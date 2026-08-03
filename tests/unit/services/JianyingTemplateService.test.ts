import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { JianyingTemplateService } from '../../../electron/services/JianyingTemplateService';

const temporaryRoots: string[] = [];

function createFixture(imageCount: 1 | 2): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-jianying-'));
  temporaryRoots.push(root);
  fs.mkdirSync(path.join(root, 'materials', 'video'), { recursive: true });
  fs.mkdirSync(path.join(root, 'materials', 'audio'), { recursive: true });

  const images = Array.from({ length: imageCount }, (_, index) => ({
    id: `image-${index + 1}`,
    type: 'photo',
    path: `fixture_##/materials/video/original-${index + 1}.png`,
    material_name: `original-${index + 1}.png`,
  }));
  for (let index = 0; index < imageCount; index += 1) {
    fs.writeFileSync(path.join(root, 'materials', 'video', `original-${index + 1}.png`), 'image');
  }
  fs.writeFileSync(path.join(root, 'materials', 'audio', 'original.mp3'), 'audio');

  fs.writeFileSync(path.join(root, 'draft_info.json'), JSON.stringify({
    id: 'template-content-id',
    tracks: [
      { type: 'text', segments: [{ material_id: 'text-1' }] },
      { type: 'video', segments: images.map((image) => ({ material_id: image.id })) },
      { type: 'audio', segments: [{ material_id: 'audio-1' }] },
    ],
    materials: {
      texts: [{
        id: 'text-1',
        content: JSON.stringify({ text: '模板文字', styles: [{ range: [0, 4] }] }),
      }],
      videos: images,
      audios: [{
        id: 'audio-1',
        path: 'fixture_##/materials/audio/original.mp3',
        material_name: 'original.mp3',
      }],
    },
  }));
  fs.writeFileSync(path.join(root, 'draft_meta_info.json'), JSON.stringify({
    draft_name: '旧名字',
  }));
  return root;
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('JianyingTemplateService', () => {
  it.each([1, 2] as const)('解析并生成 %i 图模板', (imageCount) => {
    const service = new JianyingTemplateService();
    const templateRoot = createFixture(imageCount);
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-output-'));
    temporaryRoots.push(outputRoot);
    const newBackground = path.join(outputRoot, 'new-background.png');
    const newChart = path.join(outputRoot, 'new-chart.png');
    const newAudio = path.join(outputRoot, 'new-audio.mp3');
    fs.writeFileSync(newBackground, 'new-image');
    fs.writeFileSync(newChart, 'new-chart');
    fs.writeFileSync(newAudio, 'new-audio');
    fs.writeFileSync(path.join(outputRoot, 'root_meta_info.json'), JSON.stringify({
      root_path: outputRoot,
      all_draft_store: [{
        draft_id: 'template-draft-id',
        draft_name: `测试模板-${imageCount}`,
        draft_fold_path: templateRoot,
        draft_root_path: outputRoot,
      }],
    }));

    const template = service.inspect(templateRoot, `测试模板-${imageCount}`);
    expect(template.imageSlotKeys).toHaveLength(imageCount);
    expect(template.slots.map((slot) => slot.label)).toEqual(
      imageCount === 2
        ? ['脚本', '底图', '星盘图片', 'BGM素材']
        : ['脚本', '底图', 'BGM素材'],
    );

    const destination = service.generate(template, outputRoot, '作品 A', {
      script: '新的自动化脚本',
      backgroundPath: newBackground,
      chartPath: imageCount === 2 ? newChart : undefined,
      bgmPath: newAudio,
    });
    const draft = JSON.parse(fs.readFileSync(path.join(destination, 'draft_info.json'), 'utf8'));
    const text = JSON.parse(draft.materials.texts[0].content);

    expect(text.text).toBe('新的自动化脚本');
    expect(text.styles[0].range).toEqual([0, 7]);
    expect(draft.materials.videos[0].material_name).toBe('new-background.png');
    if (imageCount === 2) {
      expect(draft.materials.videos[1].material_name).toBe('new-chart.png');
    }
    expect(draft.materials.audios[0].material_name).toBe('new-audio.mp3');
    const meta = JSON.parse(fs.readFileSync(path.join(destination, 'draft_meta_info.json'), 'utf8'));
    expect(meta.draft_name).toBe('作品 A');
    expect(meta.draft_id).toMatch(/^[0-9A-F-]{36}$/);
    expect(meta.draft_fold_path).toBe(destination);
    expect(draft.id).toBe(meta.draft_id);
    expect(draft.id).not.toBe('template-content-id');

    const rootMeta = JSON.parse(fs.readFileSync(path.join(outputRoot, 'root_meta_info.json'), 'utf8'));
    const registered = rootMeta.all_draft_store.find((entry: Record<string, any>) =>
      entry.draft_name === '作品 A'
    );
    expect(registered).toMatchObject({
      draft_id: meta.draft_id,
      draft_fold_path: destination,
      draft_root_path: outputRoot,
    });
    expect(registered.draft_id).toBe(draft.id);
  });

  it('草稿显示名保留原文，仅目录名替换非法字符', () => {
    const service = new JianyingTemplateService();
    const templateRoot = createFixture(1);
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-output-'));
    temporaryRoots.push(outputRoot);
    const imagePath = path.join(outputRoot, 'image.png');
    const audioPath = path.join(outputRoot, 'audio.mp3');
    fs.writeFileSync(imagePath, 'image');
    fs.writeFileSync(audioPath, 'audio');
    fs.writeFileSync(path.join(outputRoot, 'root_meta_info.json'), JSON.stringify({
      root_path: outputRoot,
      all_draft_store: [],
    }));

    const template = service.inspect(templateRoot, '测试模板');
    const destination = service.generate(template, outputRoot, 'Stella 2026.7.30 09:20', {
      script: '测试脚本',
      backgroundPath: imagePath,
      bgmPath: audioPath,
    });

    expect(path.basename(destination)).toBe('Stella 2026.7.30 09_20');
    const meta = JSON.parse(fs.readFileSync(path.join(destination, 'draft_meta_info.json'), 'utf8'));
    expect(meta.draft_name).toBe('Stella 2026.7.30 09:20');
    const rootMeta = JSON.parse(fs.readFileSync(path.join(outputRoot, 'root_meta_info.json'), 'utf8'));
    expect(rootMeta.all_draft_store).toContainEqual(expect.objectContaining({
      draft_name: 'Stella 2026.7.30 09:20',
      draft_fold_path: destination,
      draft_id: meta.draft_id,
    }));
  });

  it('同时存在草稿信息和内容文件时，替换两份时间线中的文案、图片和音频', () => {
    const service = new JianyingTemplateService();
    const templateRoot = createFixture(1);
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-output-'));
    temporaryRoots.push(outputRoot);
    const imagePath = path.join(outputRoot, 'image.png');
    const audioPath = path.join(outputRoot, 'audio.mp3');
    fs.writeFileSync(imagePath, 'replacement-image');
    fs.writeFileSync(audioPath, 'replacement-audio');
    const infoPath = path.join(templateRoot, 'draft_info.json');
    const contentPath = path.join(templateRoot, 'draft_content.json');
    const content = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
    content.materials.texts[0].content = JSON.stringify({ text: '实际内容文件中的模板文字' });
    fs.writeFileSync(contentPath, JSON.stringify(content));
    fs.writeFileSync(path.join(outputRoot, 'root_meta_info.json'), JSON.stringify({
      root_path: outputRoot,
      all_draft_store: [],
    }));

    const template = service.inspect(templateRoot, '内容文件优先模板');
    // Simulate a template registered by an older MatrixFlow version.
    template.draftFile = 'draft_info.json';
    const destination = service.generate(template, outputRoot, '作品 B', {
      script: 'Excel 脚本内容',
      backgroundPath: imagePath,
      bgmPath: audioPath,
    });

    const generatedContent = JSON.parse(fs.readFileSync(path.join(destination, 'draft_content.json'), 'utf8'));
    expect(JSON.parse(generatedContent.materials.texts[0].content).text).toBe('Excel 脚本内容');
    expect(generatedContent.materials.videos[0].material_name).toBe('image.png');
    expect(generatedContent.materials.audios[0].material_name).toBe('audio.mp3');
    const generatedInfo = JSON.parse(fs.readFileSync(path.join(destination, 'draft_info.json'), 'utf8'));
    expect(JSON.parse(generatedInfo.materials.texts[0].content).text).toBe('Excel 脚本内容');
    expect(generatedInfo.materials.videos[0].material_name).toBe('image.png');
    expect(generatedInfo.materials.audios[0].material_name).toBe('audio.mp3');
    for (const draft of [generatedContent, generatedInfo]) {
      const image = draft.materials.videos[0];
      const audio = draft.materials.audios[0];
      expect(fs.readFileSync(path.join(destination, image.path.split('_##/')[1]), 'utf8')).toBe('replacement-image');
      expect(fs.readFileSync(path.join(destination, audio.path.split('_##/')[1]), 'utf8')).toBe('replacement-audio');
    }
    const rootMeta = JSON.parse(fs.readFileSync(path.join(outputRoot, 'root_meta_info.json'), 'utf8'));
    expect(rootMeta.all_draft_store[0].draft_json_file).toBe(path.join(destination, 'draft_content.json'));
  });

  it('输出目录没有索引时，登记到剪映的本机草稿索引', () => {
    const service = new JianyingTemplateService();
    const templateRoot = createFixture(1);
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-output-'));
    const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-localappdata-'));
    temporaryRoots.push(outputRoot, localAppData);
    const originalLocalAppData = process.env.LOCALAPPDATA;
    process.env.LOCALAPPDATA = localAppData;
    try {
      const jianyingIndexRoot = path.join(localAppData, 'JianyingPro', 'User Data', 'Projects', 'com.lveditor.draft');
      fs.mkdirSync(jianyingIndexRoot, { recursive: true });
      fs.writeFileSync(path.join(jianyingIndexRoot, 'root_meta_info.json'), JSON.stringify({
        root_path: jianyingIndexRoot,
        all_draft_store: [],
      }));
      const imagePath = path.join(outputRoot, 'image.png');
      const audioPath = path.join(outputRoot, 'audio.mp3');
      fs.writeFileSync(imagePath, 'image');
      fs.writeFileSync(audioPath, 'audio');

      const template = service.inspect(templateRoot, '本机索引模板');
      const destination = service.generate(template, outputRoot, '作品 C', {
        script: '索引验证脚本',
        backgroundPath: imagePath,
        bgmPath: audioPath,
      });
      const index = JSON.parse(fs.readFileSync(path.join(jianyingIndexRoot, 'root_meta_info.json'), 'utf8'));
      expect(index.all_draft_store).toContainEqual(expect.objectContaining({
        draft_name: '作品 C',
        draft_fold_path: destination,
        draft_json_file: path.join(destination, 'draft_info.json'),
      }));
    } finally {
      process.env.LOCALAPPDATA = originalLocalAppData;
    }
  });

  it('目录已删除时自动移除同路径失效索引并重新生成', () => {
    const service = new JianyingTemplateService();
    const templateRoot = createFixture(1);
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-output-'));
    temporaryRoots.push(outputRoot);
    const imagePath = path.join(outputRoot, 'image.png');
    const audioPath = path.join(outputRoot, 'audio.mp3');
    fs.writeFileSync(imagePath, 'image');
    fs.writeFileSync(audioPath, 'audio');
    const destination = path.join(outputRoot, '作品 A');
    fs.writeFileSync(path.join(outputRoot, 'root_meta_info.json'), JSON.stringify({
      root_path: outputRoot,
      all_draft_store: [
        {
          draft_id: 'template-draft-id',
          draft_name: '测试模板',
          draft_fold_path: templateRoot,
        },
        {
          draft_id: 'stale-draft-id',
          draft_name: '作品 A',
          draft_fold_path: destination,
        },
      ],
    }));

    const template = service.inspect(templateRoot, '测试模板');
    service.generate(template, outputRoot, '作品 A', {
      script: '重新生成的脚本',
      backgroundPath: imagePath,
      bgmPath: audioPath,
    });

    const rootMeta = JSON.parse(fs.readFileSync(path.join(outputRoot, 'root_meta_info.json'), 'utf8'));
    expect(rootMeta.all_draft_store).toContainEqual(expect.objectContaining({
      draft_id: 'template-draft-id',
      draft_fold_path: templateRoot,
    }));
    const generatedEntries = rootMeta.all_draft_store.filter(
      (entry: Record<string, any>) => entry.draft_fold_path === destination,
    );
    expect(generatedEntries).toHaveLength(1);
    expect(generatedEntries[0].draft_id).not.toBe('stale-draft-id');
    expect(fs.existsSync(path.join(destination, 'draft_info.json'))).toBe(true);
  });

  it('拒绝超过首期边界的模板结构', () => {
    const service = new JianyingTemplateService();
    const templateRoot = createFixture(1);
    const draftPath = path.join(templateRoot, 'draft_info.json');
    const draft = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
    draft.materials.texts.push({
      id: 'text-2',
      content: JSON.stringify({ text: '第二段文字' }),
    });
    draft.tracks[0].segments.push({ material_id: 'text-2' });
    fs.writeFileSync(draftPath, JSON.stringify(draft));

    expect(() => service.inspect(templateRoot)).toThrow('当前仅支持 1 个文字槽');
  });
});
