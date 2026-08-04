import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  AutomationTemplate,
  AutomationTemplateSlot,
} from './types/automation';

type DraftData = Record<string, any>;
type DraftRootData = {
  all_draft_store?: Record<string, any>[];
  [key: string]: any;
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac']);

export class JianyingTemplateError extends Error {}

function loadJson(filePath: string): DraftData | null {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trimStart().startsWith('{')) {
    return null; // 返回 null 表示文件已加密，调用方应跳过
  }
  try {
    return JSON.parse(raw) as DraftData;
  } catch (error) {
    throw new JianyingTemplateError(
      `剪映草稿 JSON 无法解析：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function getDraftFile(draftPath: string): string {
  // Modern Jianying stores the editable timeline in draft_content.json. The
  // accompanying draft_info.json may be present but is metadata only, so
  // changing it does not alter the draft opened by Jianying.
  for (const name of ['draft_content.json', 'draft_info.json']) {
    const candidate = path.join(draftPath, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new JianyingTemplateError('未找到 draft_info.json 或 draft_content.json');
}

/**
 * Some Jianying versions keep two timeline files in a draft.  Which one is
 * opened is version-dependent, so updating only the preferred file can leave
 * the editor displaying the original template assets.
 *
 * Modern Jianying also stores timelines in Timelines/<UUID>/ subdirectories.
 * Additionally, .bak files must be updated to prevent Jianying from restoring old content.
 */
function getTimelineDraftFiles(draftPath: string): string[] {
  const files: string[] = [];

  // 根目录的时间线文件（包括.bak备份）
  for (const name of ['draft_content.json', 'draft_info.json', 'draft_content.json.bak', 'draft_info.json.bak']) {
    const candidate = path.join(draftPath, name);
    if (fs.existsSync(candidate)) {
      files.push(candidate);
    }
  }

  // Timelines 子目录中的时间线文件（包括.bak备份）
  const timelinesDir = path.join(draftPath, 'Timelines');
  if (fs.existsSync(timelinesDir) && fs.statSync(timelinesDir).isDirectory()) {
    const subdirs = fs.readdirSync(timelinesDir);
    for (const subdir of subdirs) {
      const subdirPath = path.join(timelinesDir, subdir);
      if (fs.statSync(subdirPath).isDirectory()) {
        for (const name of ['draft_content.json', 'draft_info.json', 'draft_content.json.bak', 'draft_info.json.bak']) {
          const candidate = path.join(subdirPath, name);
          if (fs.existsSync(candidate)) {
            files.push(candidate);
          }
        }
      }
    }
  }

  return files;
}

function getDraftRootMetaPath(draftOutputRoot: string): string | undefined {
  const candidates = [
    path.join(draftOutputRoot, 'root_meta_info.json'),
    path.join(
      process.env.LOCALAPPDATA ?? '',
      'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft', 'root_meta_info.json',
    ),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function parseTextPreview(material: Record<string, any>): string {
  const content = material.content;
  if (typeof content !== 'string') return '';
  try {
    const inner = JSON.parse(content) as { text?: string };
    return String(inner.text ?? '').replace(/\n/g, ' ↵ ').slice(0, 160);
  } catch {
    return content.slice(0, 160);
  }
}

function resolveAssetPath(draftPath: string, rawPath: string): string | undefined {
  const marker = '_##/';
  if (rawPath.includes(marker)) {
    const relative = rawPath.split(marker, 2)[1];
    const candidate = path.join(draftPath, ...relative.split('/'));
    return fs.existsSync(candidate) ? candidate : undefined;
  }
  return rawPath && fs.existsSync(rawPath) ? rawPath : undefined;
}

function materialName(material: Record<string, any>): string {
  return String(material.material_name || material.name || path.basename(String(material.path || '')));
}

function usedMaterialIds(data: DraftData, trackType: string): string[] {
  const ids: string[] = [];
  for (const track of data.tracks ?? []) {
    if (String(track.type) !== trackType) continue;
    for (const segment of track.segments ?? []) {
      const id = String(segment.material_id ?? '');
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

function sanitizeName(value: string): string {
  const name = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();
  return name || '未命名作品';
}

function directorySize(directory: string): number {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce((total, entry) => {
    const entryPath = path.join(directory, entry.name);
    return total + (entry.isDirectory() ? directorySize(entryPath) : fs.statSync(entryPath).size);
  }, 0);
}

function replaceText(material: Record<string, any>, text: string): void {
  let inner: Record<string, any>;
  try {
    inner = JSON.parse(String(material.content ?? '{}'));
  } catch {
    throw new JianyingTemplateError('文字槽内容不是可编辑 JSON');
  }
  console.log('[JianyingTemplate] 替换文字:', {
    oldText: inner.text?.substring(0, 50),
    newText: text.substring(0, 50)
  });
  inner.text = text;
  for (const style of inner.styles ?? []) {
    if (style && Array.isArray(style.range)) style.range = [0, text.length];
  }
  material.content = JSON.stringify(inner);
}

function replaceMedia(
  material: Record<string, any>,
  assetPath: string,
  destination: string,
  type: 'image' | 'audio',
): void {
  const extension = path.extname(assetPath).toLowerCase();
  const allowed = type === 'image' ? IMAGE_EXTENSIONS : AUDIO_EXTENSIONS;
  if (!allowed.has(extension)) {
    throw new JianyingTemplateError(
      `${type === 'image' ? '图片' : '音频'}格式不支持：${path.basename(assetPath)}`,
    );
  }
  if (!path.isAbsolute(assetPath) || !fs.existsSync(assetPath)) {
    throw new JianyingTemplateError(`素材绝对路径不存在：${assetPath}`);
  }

  const targetDir = path.join(destination, 'materials', type === 'audio' ? 'audio' : 'video');
  fs.mkdirSync(targetDir, { recursive: true });
  // 使用原始文件名而不是UUID，保持与老程序一致
  const targetName = path.basename(assetPath);
  const target = path.join(targetDir, targetName);
  fs.copyFileSync(assetPath, target);

  const oldPath = String(material.path ?? '');
  console.log(`[JianyingTemplate] 替换${type === 'image' ? '图片' : '音频'}:`, {
    oldPath: oldPath.substring(0, 60),
    newPath: assetPath,
    targetPath: target
  });
  const marker = '_##/';
  const prefix = oldPath.includes(marker) ? `${oldPath.split(marker, 1)[0]}${marker}` : '';
  material.path = `${prefix}materials/${type === 'audio' ? 'audio' : 'video'}/${targetName}`;
  material.material_name = path.basename(assetPath);
  if ('name' in material) material.name = path.basename(assetPath);
}

export class JianyingTemplateService {
  inspect(draftPath: string, requestedName?: string): AutomationTemplate {
    const normalizedPath = path.resolve(draftPath);
    if (!fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isDirectory()) {
      throw new JianyingTemplateError(`模板目录不存在：${normalizedPath}`);
    }

    const draftFilePath = getDraftFile(normalizedPath);
    const data = loadJson(draftFilePath);
    if (data === null) {
      throw new JianyingTemplateError('模板文件已加密，无法解析。请使用未加密的剪映草稿作为模板。');
    }
    const materials = data.materials ?? {};

    const textIds = usedMaterialIds(data, 'text');
    const videoIds = usedMaterialIds(data, 'video');
    const audioIds = usedMaterialIds(data, 'audio');
    const texts = (materials.texts ?? []).filter((item: Record<string, any>) =>
      textIds.length === 0 || textIds.includes(String(item.id)),
    );
    const images = (materials.videos ?? []).filter(
      (item: Record<string, any>) =>
        String(item.type) === 'photo' &&
        (videoIds.length === 0 || videoIds.includes(String(item.id))),
    );
    const audios = (materials.audios ?? []).filter((item: Record<string, any>) =>
      audioIds.length === 0 || audioIds.includes(String(item.id)),
    );

    if (texts.length !== 1) {
      throw new JianyingTemplateError(`当前仅支持 1 个文字槽，检测到 ${texts.length} 个`);
    }
    if (![1, 2].includes(images.length)) {
      throw new JianyingTemplateError(`当前仅支持 1–2 个图片槽，检测到 ${images.length} 个`);
    }
    if (audios.length !== 1) {
      throw new JianyingTemplateError(`当前仅支持 1 个音频槽，检测到 ${audios.length} 个`);
    }

    const slots: AutomationTemplateSlot[] = [
      {
        key: `text:${texts[0].id}`,
        type: 'text',
        label: '脚本',
        preview: parseTextPreview(texts[0]),
      },
      ...images.map((item: Record<string, any>, index: number) => ({
        key: `material:${item.id}`,
        type: 'image' as const,
        label: index === 0 ? '底图' : '星盘图片',
        preview: materialName(item),
        sourcePath: resolveAssetPath(normalizedPath, String(item.path ?? '')),
      })),
      {
        key: `material:${audios[0].id}`,
        type: 'audio',
        label: 'BGM素材',
        preview: materialName(audios[0]),
        sourcePath: resolveAssetPath(normalizedPath, String(audios[0].path ?? '')),
      },
    ];

    const now = new Date().toISOString();
    return {
      id: randomUUID(),
      name: requestedName?.trim() || path.basename(normalizedPath),
      draftPath: normalizedPath,
      draftFile: path.basename(draftFilePath),
      textSlotKey: slots[0].key,
      imageSlotKeys: slots.filter((slot) => slot.type === 'image').map((slot) => slot.key),
      audioSlotKey: slots.find((slot) => slot.type === 'audio')!.key,
      slots,
      createdAt: now,
      updatedAt: now,
    };
  }

  generate(
    template: AutomationTemplate,
    outputRoot: string,
    workName: string,
    values: {
      script: string;
      backgroundPath: string;
      chartPath?: string;
      bgmPath: string;
    },
  ): string {
    const resolvedOutputRoot = path.resolve(outputRoot);
    const displayWorkName = workName.trim() || '未命名作品';
    const safeWorkName = sanitizeName(displayWorkName);
    const destination = path.join(resolvedOutputRoot, safeWorkName);
    if (fs.existsSync(destination)) {
      throw new JianyingTemplateError(`草稿目录已存在：${destination}`);
    }
    fs.mkdirSync(resolvedOutputRoot, { recursive: true });
    this.removeStaleDraftRootEntry(resolvedOutputRoot, destination);
    const workingDirectory = path.join(
      resolvedOutputRoot,
      `.${safeWorkName}.matrixflow-${randomUUID()}.tmp`,
    );
    fs.cpSync(template.draftPath, workingDirectory, { recursive: true });

    // 删除 Timelines 子目录，因为它可能包含加密的文件，剪映会优先读取这些文件
    const timelinesDir = path.join(workingDirectory, 'Timelines');
    if (fs.existsSync(timelinesDir)) {
      console.log('[JianyingTemplate] 删除 Timelines 目录（包含加密文件）');
      fs.rmSync(timelinesDir, { recursive: true, force: true });
    }

    try {
      // Do not trust the file name saved when the template was registered.
      // Existing templates may still store the legacy draft_info.json even
      // though Jianying now reads draft_content.json.
      const draftFile = getDraftFile(workingDirectory);
      const draftId = randomUUID().toUpperCase();
      const timelineFiles = getTimelineDraftFiles(workingDirectory);
      console.log('[JianyingTemplate] 找到时间线文件:', timelineFiles);
      let primaryData: DraftData | undefined;
      for (const file of timelineFiles) {
        console.log('[JianyingTemplate] 处理文件:', file);
        const current = loadJson(file);
        // 跳过加密文件
        if (current === null) {
          console.log('[JianyingTemplate] 文件已加密，跳过:', file);
          continue;
        }
        // draft_info.json is metadata in some Jianying versions.  Do not
        // mistake it for a second timeline just because it is JSON.
        if (!this.hasTemplateSlots(current, template)) {
          console.log('[JianyingTemplate] 文件不包含模板槽，跳过:', file);
          if (file === draftFile) {
            throw new JianyingTemplateError('模板时间线槽已失效，请重新解析模板');
          }
          continue;
        }
        this.replaceTemplateValues(current, template, values, workingDirectory);
        // A copied draft must not keep the template's content id. Jianying uses
        // this id as part of its in-memory/cache identity; if it differs from
        // draft_meta_info.json/root_meta_info.json, opening the new card can
        // resolve to the original template timeline instead.
        current.id = draftId;
        console.log('[JianyingTemplate] 写入文件:', file);
        fs.writeFileSync(file, JSON.stringify(current), 'utf8');
        if (file === draftFile) primaryData = current;
      }
      if (!primaryData) throw new JianyingTemplateError('未找到可编辑的剪映时间线文件');
      this.writeDraftMeta(
        workingDirectory,
        resolvedOutputRoot,
        destination,
        displayWorkName,
        draftId,
        primaryData,
      );
      if (fs.existsSync(destination)) {
        throw new JianyingTemplateError(`草稿目录已存在：${destination}`);
      }
      fs.renameSync(workingDirectory, destination);
      try {
        this.registerInDraftRoot(
          resolvedOutputRoot,
          template.draftPath,
          destination,
          displayWorkName,
          draftId,
          primaryData,
        );
      } catch (error) {
        fs.rmSync(destination, { recursive: true, force: true });
        throw error;
      }
      return destination;
    } catch (error) {
      fs.rmSync(workingDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  private replaceTemplateValues(
    data: DraftData,
    template: AutomationTemplate,
    values: { script: string; backgroundPath: string; chartPath?: string; bgmPath: string },
    destination: string,
  ): void {
    console.log('[JianyingTemplate] 开始替换模板内容:', {
      workName: path.basename(destination),
      hasScript: !!values.script,
      hasBackgroundPath: !!values.backgroundPath,
      hasChartPath: !!values.chartPath,
      hasBgmPath: !!values.bgmPath
    });

    const materials = data.materials ?? {};
    const textId = template.textSlotKey.replace(/^text:/, '');
    const textMaterial = (materials.texts ?? []).find(
      (item: Record<string, any>) => String(item.id) === textId,
    );
    if (!textMaterial) throw new JianyingTemplateError('模板文字槽已失效，请重新解析模板');
    replaceText(textMaterial, values.script);

    const mediaCollections = [
      ...(materials.videos ?? []),
      ...(materials.audios ?? []),
    ] as Record<string, any>[];
    const replaceByKey = (key: string, asset: string, type: 'image' | 'audio') => {
      const id = key.replace(/^material:/, '');
      const material = mediaCollections.find((item) => String(item.id) === id);
      if (!material) throw new JianyingTemplateError(`模板素材槽已失效：${key}`);
      replaceMedia(material, asset, destination, type);
    };

    replaceByKey(template.imageSlotKeys[0], values.backgroundPath, 'image');
    if (template.imageSlotKeys.length > 1) {
      if (!values.chartPath) throw new JianyingTemplateError('双图模板必须填写星盘图片');
      replaceByKey(template.imageSlotKeys[1], values.chartPath, 'image');
    }
    replaceByKey(template.audioSlotKey, values.bgmPath, 'audio');

    console.log('[JianyingTemplate] 模板内容替换完成');
  }

  private hasTemplateSlots(data: DraftData, template: AutomationTemplate): boolean {
    const materials = data.materials ?? {};
    const textId = template.textSlotKey.replace(/^text:/, '');
    const mediaIds = [
      ...template.imageSlotKeys,
      template.audioSlotKey,
    ].map((key) => key.replace(/^material:/, ''));
    const textExists = (materials.texts ?? []).some(
      (item: Record<string, any>) => String(item.id) === textId,
    );
    const presentMediaIds = new Set(
      [...(materials.videos ?? []), ...(materials.audios ?? [])]
        .map((item: Record<string, any>) => String(item.id)),
    );
    return textExists && mediaIds.every((id) => presentMediaIds.has(id));
  }

  private writeDraftMeta(
    draftPath: string,
    draftRoot: string,
    destination: string,
    workName: string,
    draftId: string,
    data: DraftData,
  ): void {
    const metaPath = path.join(draftPath, 'draft_meta_info.json');
    const nowMicros = Date.now() * 1_000;
    // Jianying 11+ may store this metadata encrypted. Replacing it with a
    // hand-written JSON object makes the draft card visible but prevents the
    // editor from opening it. In that case the copied metadata is already
    // valid for the cloned project and must remain byte-for-byte intact.
    if (fs.existsSync(metaPath)) {
      const original = fs.readFileSync(metaPath, 'utf8');
      try {
        const meta = JSON.parse(original) as Record<string, any>;
        Object.assign(meta, {
          draft_cover: fs.existsSync(path.join(draftPath, 'draft_cover.jpg'))
            ? path.join(destination, 'draft_cover.jpg')
            : '',
          draft_fold_path: destination,
          draft_id: draftId,
          draft_name: workName,
          name: workName,
          draft_root_path: draftRoot,
          draft_new_version: String(data.new_version ?? meta.draft_new_version ?? ''),
          tm_draft_create: nowMicros,
          tm_draft_modified: nowMicros,
          tm_duration: Number(data.duration ?? meta.tm_duration ?? 0),
        });
        fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');
      } catch {
        return;
      }
      return;
    }

    const meta: Record<string, any> = {
      cloud_package_completed_time: '',
      draft_cloud_capcut_purchase_info: '',
      draft_cloud_last_action_download: false,
      draft_cloud_materials: [],
      draft_cloud_purchase_info: '',
      draft_cloud_template_id: '',
      draft_cloud_tutorial_info: '',
      draft_cloud_videocut_purchase_info: '',
      draft_cover: fs.existsSync(path.join(draftPath, 'draft_cover.jpg'))
        ? path.join(destination, 'draft_cover.jpg')
        : '',
      draft_deeplink_url: '',
      draft_enterprise_info: {
        draft_enterprise_extra: '',
        draft_enterprise_id: '',
        draft_enterprise_name: '',
        enterprise_material: [],
      },
      draft_fold_path: destination,
      draft_id: draftId,
      draft_is_ai_packaging_used: false,
      draft_is_ai_shorts: false,
      draft_is_ai_translate: false,
      draft_is_article_video_draft: false,
      draft_is_from_deeplink: 'false',
      draft_is_invisible: false,
      draft_materials: [0, 1, 2, 3, 6, 7, 8].map((type) => ({ type, value: [] })),
      draft_materials_copied_info: [],
      draft_name: workName,
      draft_new_version: String(data.new_version ?? ''),
      draft_removable_storage_device: '',
      draft_root_path: draftRoot,
      draft_segment_extra_info: [],
      draft_type: '',
      name: workName,
      tm_draft_cloud_completed: '',
      tm_draft_cloud_modified: 0,
      tm_draft_create: nowMicros,
      tm_draft_modified: nowMicros,
      tm_draft_removed: 0,
      tm_duration: Number(data.duration ?? 0),
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta), 'utf8');
  }

  private registerInDraftRoot(
    draftRoot: string,
    templatePath: string,
    destination: string,
    workName: string,
    draftId: string,
    data: DraftData,
  ): void {
    const rootMetaPath = getDraftRootMetaPath(draftRoot);
    if (!rootMetaPath) return;

    let root: DraftRootData;
    try {
      root = JSON.parse(fs.readFileSync(rootMetaPath, 'utf8')) as DraftRootData;
    } catch (error) {
      throw new JianyingTemplateError(
        `剪映草稿索引无法解析：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const entries = Array.isArray(root.all_draft_store) ? root.all_draft_store : [];
    const normalizedDestination = path.resolve(destination);
    if (entries.some((entry) =>
      String(entry.draft_id) === draftId
      || path.resolve(String(entry.draft_fold_path || '')) === normalizedDestination
    )) {
      throw new JianyingTemplateError(`剪映草稿索引已存在：${workName}`);
    }

    const sourceEntry = entries.find(
      (entry) => path.resolve(String(entry.draft_fold_path || '')) === path.resolve(templatePath),
    ) ?? {};
    const nowMicros = Date.now() * 1_000;
    const entry: Record<string, any> = {
      ...sourceEntry,
      cloud_draft_cover: false,
      cloud_draft_sync: false,
      draft_cloud_last_action_download: false,
      draft_cloud_purchase_info: '',
      draft_cloud_template_id: '',
      draft_cloud_tutorial_info: '',
      draft_cloud_videocut_purchase_info: '',
      draft_cover: fs.existsSync(path.join(destination, 'draft_cover.jpg'))
        ? path.join(destination, 'draft_cover.jpg')
        : '',
      draft_fold_path: destination,
      draft_id: draftId,
      draft_is_cloud_temp_draft: false,
      draft_is_invisible: false,
      draft_json_file: path.join(destination, path.basename(getDraftFile(destination))),
      draft_name: workName,
      draft_new_version: String(data.new_version ?? sourceEntry.draft_new_version ?? ''),
      draft_root_path: draftRoot,
      draft_timeline_materials_size: directorySize(destination),
      streaming_edit_draft_ready: true,
      tm_draft_cloud_completed: '',
      tm_draft_cloud_entry_id: 0,
      tm_draft_cloud_modified: 0,
      tm_draft_cloud_parent_entry_id: -1,
      tm_draft_create: nowMicros,
      tm_draft_modified: nowMicros,
      tm_draft_removed: 0,
      tm_duration: Number(data.duration ?? sourceEntry.tm_duration ?? 0),
    };
    entries.push(entry);
    root.all_draft_store = entries;

    const temporary = `${rootMetaPath}.matrixflow-${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(root), 'utf8');
    fs.renameSync(temporary, rootMetaPath);
  }

  private removeStaleDraftRootEntry(draftRoot: string, destination: string): void {
    const rootMetaPath = getDraftRootMetaPath(draftRoot);
    if (!rootMetaPath) return;

    let root: DraftRootData;
    try {
      root = JSON.parse(fs.readFileSync(rootMetaPath, 'utf8')) as DraftRootData;
    } catch (error) {
      throw new JianyingTemplateError(
        `剪映草稿索引无法解析：${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const entries = Array.isArray(root.all_draft_store) ? root.all_draft_store : [];
    const normalizedDestination = path.resolve(destination);
    const retainedEntries = entries.filter((entry) => {
      const rawPath = String(entry.draft_fold_path || '').trim();
      if (!rawPath || path.resolve(rawPath) !== normalizedDestination) return true;
      return fs.existsSync(normalizedDestination);
    });
    if (retainedEntries.length === entries.length) return;

    root.all_draft_store = retainedEntries;
    const temporary = `${rootMetaPath}.matrixflow-${randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(root), 'utf8');
    fs.renameSync(temporary, rootMetaPath);
  }
}

export const jianyingTemplateService = new JianyingTemplateService();
