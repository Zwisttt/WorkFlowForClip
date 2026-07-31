import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { BrowserWindow } from 'electron';
import { automationWorkbookService, splitPublishCopy } from './AutomationWorkbookService';
import { jianyingTemplateService } from './JianyingTemplateService';
import { jianyingExportService } from './JianyingExportService';
import { accountService } from './AccountService';
import { publishService } from './PublishService';
import { taskScheduler } from '../core/TaskScheduler';
import {
  automationBatchRepo,
  automationItemRepo,
  automationTemplateRepo,
  type AutomationBatchRow,
  type AutomationItemRow,
  type AutomationTemplateRow,
} from '../data/repositories/AutomationRepository';
import type {
  AutomationAccountPlan,
  AutomationBatch,
  AutomationBatchDetail,
  AutomationExportSettings,
  AutomationItem,
  AutomationStartRequest,
  AutomationTemplate,
  AutomationWorkbookPreview,
} from './types/automation';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv']);
const LOCAL_TIMER_MAX_MS = 2_147_000_000;

function nowISO(): string {
  return new Date().toISOString();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJSON<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function templateFromRow(row: AutomationTemplateRow): AutomationTemplate {
  return {
    id: row.id,
    name: row.name,
    draftPath: row.draft_path,
    draftFile: row.draft_file,
    textSlotKey: row.text_slot_key,
    imageSlotKeys: parseJSON<string[]>(row.image_slot_keys, []),
    audioSlotKey: row.audio_slot_key,
    slots: parseJSON(row.slots_json, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function batchFromRow(row: AutomationBatchRow): AutomationBatch {
  return {
    id: row.id,
    sourceFile: row.source_file,
    status: row.status as AutomationBatch['status'],
    totalItems: row.total_items,
    completedItems: row.completed_items,
    failedItems: row.failed_items,
    progress: row.progress,
    publicAudioDir: row.public_audio_dir,
    draftOutputDir: row.draft_output_dir,
    videoOutputDir: row.video_output_dir,
    exportSettings: parseJSON(row.export_settings, {}),
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function itemFromRow(row: AutomationItemRow): AutomationItem {
  return {
    id: row.id,
    batchId: row.batch_id,
    sheetName: row.sheet_name,
    rowNumber: row.row_number,
    templateName: row.template_name,
    script: row.script,
    backgroundPath: row.background_path,
    chartPath: row.chart_path,
    bgmPath: row.bgm_path,
    publishCopy: row.publish_copy,
    topics: parseJSON(row.topics, []),
    requestedScheduledAt: row.requested_scheduled_at,
    workName: row.work_name,
    resolvedWorkName: row.resolved_work_name,
    draftPath: row.draft_path ?? undefined,
    videoPath: row.video_path ?? undefined,
    status: row.status as AutomationItem['status'],
    errorStage: row.error_stage ?? undefined,
    errorMessage: row.error_message ?? undefined,
    errorAt: row.error_at ?? undefined,
    retryCount: row.retry_count,
    accountPlans: parseJSON(row.account_plans, []),
    warningMessage: row.warning_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sanitizeStem(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').replace(/[. ]+$/g, '').trim() || '未命名作品';
}

function isAuthOrRiskError(message: string): boolean {
  return /登录|Cookie|验证码|风控|账号异常|重新登录|安全验证/i.test(message);
}

export class AutomationService {
  private runningBatches = new Set<string>();
  private localTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private stoppedAccounts = new Set<string>();

  async initialize(): Promise<void> {
    await this.registerBundledLocalTemplates();
    const recoverable = await automationItemRepo.findRecoverable();
    const batchesToResume = new Set<string>();
    for (const row of recoverable) {
      let item = itemFromRow(row);
      if (item.status === 'generating') {
        await automationItemRepo.update(item.id, { status: 'ready' } as Partial<AutomationItemRow>);
        item = { ...item, status: 'ready' };
      } else if (item.status === 'exporting') {
        await automationItemRepo.update(item.id, { status: 'draft_ready' } as Partial<AutomationItemRow>);
        item = { ...item, status: 'draft_ready' };
      } else if (item.status === 'publishing') {
        const plans = item.accountPlans.map((plan) =>
          plan.status === 'publishing' ? { ...plan, status: 'ready' as const } : plan
        );
        await automationItemRepo.update(item.id, {
          status: 'video_ready',
          account_plans: JSON.stringify(plans),
        } as Partial<AutomationItemRow>);
        item = { ...item, status: 'video_ready', accountPlans: plans };
      }
      const requiresPipeline = ['ready', 'draft_ready', 'video_ready'].includes(item.status)
        || item.accountPlans.some((plan) => plan.mode === 'native_schedule' && plan.status === 'ready');
      if (requiresPipeline) {
        batchesToResume.add(item.batchId);
      } else {
        for (const plan of item.accountPlans) this.schedulePlan(item, plan);
      }
    }
    for (const batchId of batchesToResume) void this.runBatch(batchId);
  }

  dispose(): void {
    jianyingExportService.stop();
    for (const timer of this.localTimers.values()) clearTimeout(timer);
    this.localTimers.clear();
    this.runningBatches.clear();
  }

  async registerTemplate(draftPath: string, name?: string): Promise<AutomationTemplate> {
    const inspected = jianyingTemplateService.inspect(draftPath, name);
    const existing = await automationTemplateRepo.findByName(inspected.name);
    const row = await automationTemplateRepo.upsert({
      id: existing?.id ?? inspected.id,
      name: inspected.name,
      draft_path: inspected.draftPath,
      draft_file: inspected.draftFile,
      text_slot_key: inspected.textSlotKey,
      image_slot_keys: JSON.stringify(inspected.imageSlotKeys),
      audio_slot_key: inspected.audioSlotKey,
      slots_json: JSON.stringify(inspected.slots),
    });
    return templateFromRow(row);
  }

  async listTemplates(): Promise<AutomationTemplate[]> {
    const result = await automationTemplateRepo.findAll({
      page: 1,
      pageSize: 100,
      orderBy: 'created_at',
      orderDir: 'ASC',
    });
    return result.data.map(templateFromRow);
  }

  async deleteTemplate(id: string): Promise<boolean> {
    return automationTemplateRepo.deleteById(id);
  }

  analyzeWorkbook(filePath: string): Promise<AutomationWorkbookPreview> {
    return automationWorkbookService.analyze(filePath);
  }

  getExportSettings(): AutomationExportSettings {
    return jianyingExportService.getSettings();
  }

  captureExportCoordinate(key: Parameters<typeof jianyingExportService.captureCoordinate>[0]) {
    return jianyingExportService.captureCoordinate(key);
  }

  async startBatch(request: AutomationStartRequest): Promise<AutomationBatchDetail> {
    const preview = await automationWorkbookService.analyze(request.filePath);
    const accounts = await accountService.getAllAccounts();
    const accountsById = new Map(accounts.map((account) => [account.id, account]));
    const mappings = new Map(request.sheetMappings.map((mapping) => [
      mapping.sheetName,
      [...new Set(mapping.accountIds)],
    ]));
    const templates = new Map((await this.listTemplates()).map((template) => [template.name, template]));
    const issuesByRow = new Map<string, string[]>();

    for (const issue of preview.issues) {
      if (issue.severity !== 'error') continue;
      const key = `${issue.sheetName}:${issue.rowNumber}`;
      const messages = issuesByRow.get(key) ?? [];
      messages.push(`${issue.field}：${issue.message}`);
      issuesByRow.set(key, messages);
    }

    if (!request.draftOutputDir || !path.isAbsolute(request.draftOutputDir)) {
      throw new Error('请选择剪映草稿输出根目录');
    }
    if (!request.videoOutputDir || !path.isAbsolute(request.videoOutputDir)) {
      throw new Error('请选择剪映视频导出目录');
    }
    fs.mkdirSync(request.draftOutputDir, { recursive: true });
    fs.mkdirSync(request.videoOutputDir, { recursive: true });

    const publicAudios = this.listFiles(request.publicAudioDir, AUDIO_EXTENSIONS);
    const batchId = randomUUID();
    const usedNames = new Set<string>();
    const lastTimeByAccount = new Map<string, number>();
    const batchWarnings: string[] = [];
    const now = Date.now();
    const estimatedExportDone = now
      + Math.max(1, preview.rows.length) * Math.max(10, request.exportWaitSeconds) * 1000
      + 10 * 60 * 1000;
    const itemRows: Array<Omit<AutomationItemRow, 'created_at' | 'updated_at'>> = [];

    const sortedRows = [...preview.rows].sort((a, b) =>
      String(a.requestedScheduledAt).localeCompare(String(b.requestedScheduledAt))
    );
    for (const row of sortedRows) {
      const rowKey = `${row.sheetName}:${row.rowNumber}`;
      const rowErrors = [...(issuesByRow.get(rowKey) ?? [])];
      const rowWarnings: string[] = [];
      const template = templates.get(row.templateName);
      const accountIds = mappings.get(row.sheetName) ?? [];
      if (accountIds.length === 0) rowErrors.push('账号匹配：请至少选择一个抖音或小红书账号');
      if (!template) rowErrors.push(`模版名：未注册模版“${row.templateName}”`);
      if (!row.bgmPath && publicAudios.length === 0) {
        rowErrors.push('BGM素材：BGM 留空时必须配置包含音频的公共音频目录');
      }

      const requestedTime = row.requestedScheduledAt
        ? new Date(row.requestedScheduledAt).getTime()
        : Number.NaN;
      const plans: AutomationAccountPlan[] = [];
      for (const accountId of accountIds) {
        const account = accountsById.get(accountId);
        if (!account) {
          rowErrors.push(`账号匹配：账号不存在 ${accountId}`);
          continue;
        }
        if (!['douyin', 'xiaohongshu'].includes(account.platform)) {
          rowErrors.push(`账号匹配：首期不支持平台 ${account.platform}`);
          continue;
        }
        if (!account.cookieValid || account.status !== 'active') {
          rowErrors.push(`账号匹配：${account.name} 登录无效或状态不可用`);
          continue;
        }
        if (!Number.isFinite(requestedTime)) continue;

        const intervalMs = account.platform === 'douyin' ? 10 * 60_000 : 15 * 60_000;
        const previous = lastTimeByAccount.get(account.id);
        const effectiveTime = previous === undefined
          ? requestedTime
          : Math.max(requestedTime, previous + intervalMs);
        lastTimeByAccount.set(account.id, effectiveTime);
        if (effectiveTime !== requestedTime) {
          rowWarnings.push(
            `${account.name} 与前序任务时间冲突，已自动顺延到 ${new Date(effectiveTime).toLocaleString()}`,
          );
        }
        if (account.platform === 'douyin') {
          if (effectiveTime < now + 2 * 60 * 60_000) {
            rowErrors.push(`发布时间：抖音账号 ${account.name} 必须至少提前 2 小时`);
          }
          if (effectiveTime > now + 30 * 24 * 60 * 60_000) {
            rowErrors.push(`发布时间：抖音账号 ${account.name} 最多提前 30 天`);
          }
        } else if (effectiveTime < estimatedExportDone) {
          rowErrors.push(
            `发布时间：小红书账号 ${account.name} 必须晚于预计全部导出完成时间再加 10 分钟`,
          );
        }
        plans.push({
          accountId: account.id,
          accountName: account.name,
          platform: account.platform as 'douyin' | 'xiaohongshu',
          scheduledAt: new Date(effectiveTime).toISOString(),
          mode: account.platform === 'douyin' ? 'native_schedule' : 'local_schedule',
          status: 'ready',
        });
      }

      const resolvedName = this.resolveUniqueName(
        row.workName,
        request.draftOutputDir,
        request.videoOutputDir,
        usedNames,
      );
      if (resolvedName !== sanitizeStem(row.workName)) {
        rowWarnings.push(`作品同名，已由“${row.workName}”自动改为“${resolvedName}”`);
      }
      usedNames.add(resolvedName.toLocaleLowerCase());
      batchWarnings.push(...rowWarnings);

      itemRows.push({
        id: randomUUID(),
        batch_id: batchId,
        sheet_name: row.sheetName,
        row_number: row.rowNumber,
        template_name: row.templateName,
        script: row.script,
        background_path: row.backgroundPath,
        chart_path: row.chartPath,
        bgm_path: row.bgmPath,
        publish_copy: row.publishCopy,
        topics: JSON.stringify(row.topics),
        requested_scheduled_at: row.requestedScheduledAt ?? nowISO(),
        work_name: row.workName,
        resolved_work_name: resolvedName,
        draft_path: null,
        video_path: null,
        status: rowErrors.length > 0 ? 'validation_failed' : 'ready',
        error_stage: rowErrors.length > 0 ? 'validation' : null,
        error_message: rowErrors.length > 0 ? rowErrors.join('\n') : null,
        error_at: rowErrors.length > 0 ? nowISO() : null,
        retry_count: 0,
        account_plans: JSON.stringify(plans),
        warning_message: rowWarnings.join('\n') || null,
      });
    }

    if (itemRows.length === 0) throw new Error('Excel 中没有可读取的任务行');
    const failedItems = itemRows.filter((item) => item.status === 'validation_failed').length;
    const batchRow = await automationBatchRepo.insert({
      id: batchId,
      source_file: path.resolve(request.filePath),
      status: 'validated',
      total_items: itemRows.length,
      completed_items: 0,
      failed_items: failedItems,
      progress: 0,
      public_audio_dir: request.publicAudioDir,
      draft_output_dir: request.draftOutputDir,
      video_output_dir: request.videoOutputDir,
      export_settings: JSON.stringify({
        exportWaitSeconds: Math.max(10, request.exportWaitSeconds),
        openWaitSeconds: request.openWaitSeconds ?? 8,
        homeWaitSeconds: request.homeWaitSeconds ?? 5,
        stepPauseSeconds: request.stepPauseSeconds ?? 1,
      }),
      started_at: null,
      completed_at: null,
    });
    for (const item of itemRows) {
      await automationItemRepo.insert(item);
      if (item.error_message) {
        await automationItemRepo.recordEvent(
          batchId,
          item.id,
          'error',
          'validation',
          item.error_message,
        );
      }
    }
    if (batchWarnings.length > 0) {
      await automationItemRepo.recordEvent(
        batchId,
        null,
        'warning',
        'validation',
        batchWarnings.join('\n'),
      );
    }

    if (failedItems < itemRows.length) {
      void this.runBatch(batchId);
    } else {
      await automationBatchRepo.update(batchId, {
        status: 'partial_failed',
        completed_at: nowISO(),
      } as Partial<AutomationBatchRow>);
    }
    return {
      batch: batchFromRow(batchRow),
      items: itemRows.map((row) => itemFromRow({
        ...row,
        created_at: nowISO(),
        updated_at: nowISO(),
      })),
    };
  }

  async resumeBatch(batchId: string): Promise<void> {
    if (this.runningBatches.has(batchId)) return;
    void this.runBatch(batchId);
  }

  async retryItem(itemId: string): Promise<void> {
    const row = await automationItemRepo.findById(itemId);
    if (!row) throw new Error('自动化任务不存在');
    if (row.status === 'validation_failed') {
      throw new Error('校验失败的行不会自动重试，请修正 Excel 后重新导入');
    }
    await automationItemRepo.update(itemId, {
      status: row.video_path ? 'video_ready' : row.draft_path ? 'draft_ready' : 'ready',
      error_stage: null,
      error_message: null,
      error_at: null,
      retry_count: row.retry_count + 1,
    } as Partial<AutomationItemRow>);
    void this.runBatch(row.batch_id);
  }

  async cancelBatch(batchId: string): Promise<void> {
    jianyingExportService.stop();
    for (const [key, timer] of this.localTimers) {
      if (key.startsWith(`${batchId}:`)) {
        clearTimeout(timer);
        this.localTimers.delete(key);
      }
    }
    const items = await automationItemRepo.findByBatch(batchId);
    for (const item of items) {
      if (!['completed', 'validation_failed'].includes(item.status)) {
        await automationItemRepo.update(item.id, { status: 'cancelled' } as Partial<AutomationItemRow>);
      }
    }
    await automationBatchRepo.update(batchId, {
      status: 'cancelled',
      completed_at: nowISO(),
    } as Partial<AutomationBatchRow>);
    this.runningBatches.delete(batchId);
    this.emitProgress(batchId, 'cancelled', '批次已取消');
  }

  async listBatches(): Promise<AutomationBatch[]> {
    return (await automationBatchRepo.listRecent()).map(batchFromRow);
  }

  async getBatch(batchId: string): Promise<AutomationBatchDetail> {
    const batch = await automationBatchRepo.findById(batchId);
    if (!batch) throw new Error('自动化批次不存在');
    const items = await automationItemRepo.findByBatch(batchId);
    return { batch: batchFromRow(batch), items: items.map(itemFromRow) };
  }

  private async runBatch(batchId: string): Promise<void> {
    if (this.runningBatches.has(batchId)) return;
    this.runningBatches.add(batchId);
    try {
      const batchRow = await automationBatchRepo.findById(batchId);
      if (!batchRow || batchRow.status === 'cancelled') return;
      await automationBatchRepo.update(batchId, {
        status: 'running',
        started_at: batchRow.started_at ?? nowISO(),
        completed_at: null,
      } as Partial<AutomationBatchRow>);
      const batch = batchFromRow({ ...batchRow, status: 'running' });
      let items = (await automationItemRepo.findByBatch(batchId)).map(itemFromRow);
      const templates = new Map((await this.listTemplates()).map((template) => [template.name, template]));
      const publicAudios = this.listFiles(batch.publicAudioDir, AUDIO_EXTENSIONS);

      for (const item of items.filter((value) => value.status === 'ready')) {
        await this.updateItem(item.id, { status: 'generating' }, 'generate', '正在生成剪映草稿');
        const template = templates.get(item.templateName);
        if (!template) {
          await this.failItem(item, 'generate', `模版“${item.templateName}”不存在`);
          continue;
        }
        const bgmPath = item.bgmPath || publicAudios[Math.floor(Math.random() * publicAudios.length)];
        try {
          const draftPath = await this.generateWithRetry(template, batch, item, bgmPath);
          await this.updateItem(
            item.id,
            { status: 'draft_ready', draft_path: draftPath, bgm_path: bgmPath },
            'generate',
            `草稿已生成：${draftPath}`,
          );
        } catch (error) {
          await this.failItem(item, 'generate', error instanceof Error ? error.message : String(error));
        }
        await this.refreshProgress(batchId);
      }

      items = (await automationItemRepo.findByBatch(batchId)).map(itemFromRow);
      const exportCandidates = items.filter((item) => item.status === 'draft_ready');
      if (exportCandidates.length > 0) {
        try {
          await jianyingExportService.checkReady();
        } catch (error) {
          await automationBatchRepo.update(batchId, {
            status: 'awaiting_export_setup',
          } as Partial<AutomationBatchRow>);
          this.emitProgress(
            batchId,
            'awaiting_export_setup',
            error instanceof Error ? error.message : String(error),
          );
          return;
        }
      }

      for (const item of exportCandidates) {
        const startedAt = Date.now();
        await this.updateItem(item.id, { status: 'exporting' }, 'export', '正在控制剪映导出');
        try {
          await jianyingExportService.exportOne({
            draftName: item.resolvedWorkName,
            openWaitSeconds: Number(batch.exportSettings.openWaitSeconds ?? 8),
            exportWaitSeconds: Number(batch.exportSettings.exportWaitSeconds ?? 60),
            homeWaitSeconds: Number(batch.exportSettings.homeWaitSeconds ?? 5),
            stepPauseSeconds: Number(batch.exportSettings.stepPauseSeconds ?? 1),
          }, (stage, message) => this.emitProgress(batchId, stage, message, item.id));
          const videoPath = this.findExportedVideo(
            batch.videoOutputDir,
            item.resolvedWorkName,
            startedAt,
          );
          if (!videoPath) {
            throw new Error(
              `导出操作已完成，但在视频目录中没有找到“${item.resolvedWorkName}”对应的视频`,
            );
          }
          await this.updateItem(
            item.id,
            { status: 'video_ready', video_path: videoPath },
            'export',
            `视频已就绪：${videoPath}`,
          );
        } catch (error) {
          await this.failItem(item, 'export', error instanceof Error ? error.message : String(error));
        }
        await this.refreshProgress(batchId);
      }

      items = (await automationItemRepo.findByBatch(batchId)).map(itemFromRow);
      for (const item of items.filter((value) => value.status === 'video_ready' || value.status === 'scheduled')) {
        for (const plan of item.accountPlans) {
          if (plan.mode === 'native_schedule' && plan.status === 'ready') {
            await this.executeNativeSchedule(item, plan);
          } else {
            this.schedulePlan(item, plan);
          }
        }
        await this.syncItemPlanStatus(item.id);
      }
      await this.refreshProgress(batchId);
    } finally {
      this.runningBatches.delete(batchId);
    }
  }

  private async generateWithRetry(
    template: AutomationTemplate,
    batch: AutomationBatch,
    item: AutomationItem,
    bgmPath: string,
  ): Promise<string> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return jianyingTemplateService.generate(
          template,
          batch.draftOutputDir,
          item.resolvedWorkName,
          {
            script: item.script,
            backgroundPath: item.backgroundPath,
            chartPath: item.chartPath,
            bgmPath,
          },
        );
      } catch (error) {
        lastError = error;
        if (attempt === 0) await delay(300);
      }
    }
    throw lastError;
  }

  private async executeNativeSchedule(
    item: AutomationItem,
    plan: AutomationAccountPlan,
  ): Promise<void> {
    if (!item.videoPath) return;
    if (this.stoppedAccounts.has(plan.accountId)) {
      await this.updatePlan(item, plan, 'failed', undefined, '同账号前序任务因登录或风控失败');
      return;
    }
    const copy = splitPublishCopy(item.publishCopy);
    try {
      const task = await publishService.createPublishTask({
        contentId: item.videoPath,
        platform: plan.platform,
        accountId: plan.accountId,
        scheduledAt: new Date(plan.scheduledAt),
        publishMode: 'client',
        title: copy.title,
        description: copy.description,
        tags: item.topics,
        source: 'automation',
        metadata: {
          title: copy.title,
          description: copy.description,
          tags: item.topics,
          scheduleMode: 'scheduled',
          scheduledAt: plan.scheduledAt,
        },
      });
      taskScheduler.cancel(task.id);
      const result = await this.executePublishWithRetry(task.id);
      if (!result.success) throw new Error(result.error || '抖音定时发布设置失败');
      await this.updatePlan(item, plan, 'scheduled', task.id);
      this.schedulePlan(item, { ...plan, status: 'scheduled', publishTaskId: task.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthOrRiskError(message)) this.stoppedAccounts.add(plan.accountId);
      await this.updatePlan(item, plan, 'failed', undefined, message);
    }
  }

  private schedulePlan(item: AutomationItem, plan: AutomationAccountPlan): void {
    if (!item.videoPath || ['completed', 'failed'].includes(plan.status)) return;
    const key = `${item.batchId}:${item.id}:${plan.accountId}`;
    const oldTimer = this.localTimers.get(key);
    if (oldTimer) clearTimeout(oldTimer);
    const remaining = new Date(plan.scheduledAt).getTime() - Date.now();
    const timeout = Math.max(0, Math.min(remaining, LOCAL_TIMER_MAX_MS));
    const timer = setTimeout(() => {
      this.localTimers.delete(key);
      if (remaining > LOCAL_TIMER_MAX_MS) {
        this.schedulePlan(item, plan);
        return;
      }
      if (plan.mode === 'native_schedule') {
        void this.updatePlan(item, plan, 'completed', plan.publishTaskId).then(() =>
          this.syncItemPlanStatus(item.id)
        );
      } else {
        void this.executeLocalPublish(item, plan);
      }
    }, timeout);
    this.localTimers.set(key, timer);
  }

  private async executeLocalPublish(
    item: AutomationItem,
    plan: AutomationAccountPlan,
  ): Promise<void> {
    if (!item.videoPath) return;
    if (this.stoppedAccounts.has(plan.accountId)) {
      await this.updatePlan(item, plan, 'failed', undefined, '同账号前序任务因登录或风控失败');
      await this.syncItemPlanStatus(item.id);
      return;
    }
    const copy = splitPublishCopy(item.publishCopy);
    await this.updatePlan(item, plan, 'publishing');
    try {
      const task = await publishService.createPublishTask({
        contentId: item.videoPath,
        platform: plan.platform,
        accountId: plan.accountId,
        publishMode: 'client',
        title: copy.title,
        description: copy.description,
        tags: item.topics,
        source: 'automation',
        metadata: {
          title: copy.title,
          description: copy.description,
          tags: item.topics,
          scheduleMode: 'immediate',
        },
      });
      const result = await this.executePublishWithRetry(task.id);
      if (!result.success) throw new Error(result.error || '小红书发布失败');
      await this.updatePlan(item, plan, 'completed', task.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isAuthOrRiskError(message)) this.stoppedAccounts.add(plan.accountId);
      await this.updatePlan(item, plan, 'failed', undefined, message);
    }
    await this.syncItemPlanStatus(item.id);
  }

  private async executePublishWithRetry(taskId: string): Promise<{ success: boolean; error?: string }> {
    const waits = [0, 60_000, 5 * 60_000];
    let lastError = '';
    for (let attempt = 0; attempt < waits.length; attempt += 1) {
      if (waits[attempt] > 0) await delay(waits[attempt]);
      const result = await publishService.executeNow(taskId, { finalOnFailure: attempt === waits.length - 1 });
      if (result.success) return result;
      lastError = result.error || '发布失败';
      if (isAuthOrRiskError(lastError)) break;
    }
    return { success: false, error: lastError };
  }

  private async updatePlan(
    item: AutomationItem,
    originalPlan: AutomationAccountPlan,
    status: AutomationAccountPlan['status'],
    publishTaskId?: string,
    error?: string,
  ): Promise<void> {
    const row = await automationItemRepo.findById(item.id);
    if (!row) return;
    const plans = parseJSON<AutomationAccountPlan[]>(row.account_plans, []);
    const target = plans.find((plan) => plan.accountId === originalPlan.accountId);
    if (!target) return;
    target.status = status;
    if (publishTaskId) target.publishTaskId = publishTaskId;
    if (error) target.error = error;
    await automationItemRepo.update(item.id, {
      account_plans: JSON.stringify(plans),
      error_stage: status === 'failed' ? 'publish' : row.error_stage,
      error_message: status === 'failed' ? error ?? '发布失败' : row.error_message,
      error_at: status === 'failed' ? nowISO() : row.error_at,
    } as Partial<AutomationItemRow>);
    await automationItemRepo.recordEvent(
      item.batchId,
      item.id,
      status === 'failed' ? 'error' : 'info',
      'publish',
      error ?? `${target.accountName}：${status}`,
      { accountId: target.accountId, platform: target.platform, publishTaskId },
    );
    this.emitProgress(item.batchId, 'publish', `${target.accountName}：${error ?? status}`, item.id);
  }

  private async syncItemPlanStatus(itemId: string): Promise<void> {
    const row = await automationItemRepo.findById(itemId);
    if (!row) return;
    const plans = parseJSON<AutomationAccountPlan[]>(row.account_plans, []);
    let status = row.status;
    if (plans.length > 0 && plans.every((plan) => plan.status === 'completed')) status = 'completed';
    else if (plans.some((plan) => plan.status === 'failed')) status = 'failed';
    else if (plans.some((plan) => plan.status === 'publishing')) status = 'publishing';
    else if (plans.every((plan) => plan.status === 'scheduled')) status = 'scheduled';
    await automationItemRepo.update(itemId, { status } as Partial<AutomationItemRow>);
    await this.refreshProgress(row.batch_id);
  }

  private async updateItem(
    itemId: string,
    data: Partial<AutomationItemRow>,
    stage: string,
    message: string,
  ): Promise<void> {
    const row = await automationItemRepo.update(itemId, data);
    await automationItemRepo.recordEvent(row.batch_id, itemId, 'info', stage, message);
    this.emitProgress(row.batch_id, stage, message, itemId);
  }

  private async failItem(item: AutomationItem, stage: string, message: string): Promise<void> {
    await automationItemRepo.update(item.id, {
      status: 'failed',
      error_stage: stage,
      error_message: message,
      error_at: nowISO(),
      retry_count: item.retryCount + 1,
    } as Partial<AutomationItemRow>);
    await automationItemRepo.recordEvent(item.batchId, item.id, 'error', stage, message);
    this.emitProgress(item.batchId, stage, message, item.id);
  }

  private async refreshProgress(batchId: string): Promise<void> {
    const rows = await automationItemRepo.findByBatch(batchId);
    const failed = rows.filter((row) =>
      ['failed', 'validation_failed'].includes(row.status)
    ).length;
    const completed = rows.filter((row) => row.status === 'completed').length;
    const terminal = rows.filter((row) =>
      ['completed', 'failed', 'validation_failed', 'cancelled'].includes(row.status)
    ).length;
    const progress = rows.length === 0 ? 0 : Math.round(
      rows.reduce((sum, row) => {
        const weights: Record<string, number> = {
          validation_failed: 100,
          ready: 5,
          generating: 15,
          draft_ready: 30,
          exporting: 45,
          video_ready: 60,
          scheduling: 70,
          scheduled: 80,
          publishing: 90,
          completed: 100,
          failed: 100,
          cancelled: 100,
        };
        return sum + (weights[row.status] ?? 0);
      }, 0) / rows.length
    );
    const update: Partial<AutomationBatchRow> = {
      completed_items: completed,
      failed_items: failed,
      progress,
    };
    if (terminal === rows.length) {
      update.status = failed > 0 ? 'partial_failed' : 'completed';
      update.completed_at = nowISO();
    }
    await automationBatchRepo.update(batchId, update);
    this.emitProgress(batchId, 'progress', `批次进度 ${progress}%`);
  }

  private resolveUniqueName(
    workName: string,
    draftOutputDir: string,
    videoOutputDir: string,
    usedNames: Set<string>,
  ): string {
    const base = sanitizeStem(workName);
    let candidate = base;
    let suffix = 2;
    const exists = (name: string) => {
      if (usedNames.has(name.toLocaleLowerCase())) return true;
      if (fs.existsSync(path.join(draftOutputDir, name))) return true;
      return this.listFiles(videoOutputDir, VIDEO_EXTENSIONS).some(
        (file) => path.basename(file, path.extname(file)).toLocaleLowerCase() === name.toLocaleLowerCase(),
      );
    };
    while (exists(candidate)) {
      candidate = `${base}_${String(suffix).padStart(3, '0')}`;
      suffix += 1;
    }
    return candidate;
  }

  private findExportedVideo(directory: string, workName: string, startedAt: number): string | undefined {
    const normalized = workName.toLocaleLowerCase();
    return this.listFiles(directory, VIDEO_EXTENSIONS)
      .filter((file) => {
        const stem = path.basename(file, path.extname(file)).toLocaleLowerCase();
        return stem === normalized || stem.startsWith(`${normalized}_`) || stem.startsWith(`${normalized} `);
      })
      .filter((file) => fs.statSync(file).mtimeMs >= startedAt - 5_000)
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  }

  private listFiles(directory: string, extensions: Set<string>): string[] {
    if (!directory || !fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) return [];
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return this.listFiles(entryPath, extensions);
      return entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())
        ? [entryPath]
        : [];
    });
  }

  private emitProgress(batchId: string, stage: string, message: string, itemId?: string): void {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) {
        window.webContents.send('automation:progress', { batchId, itemId, stage, message });
      }
    }
  }

  private async registerBundledLocalTemplates(): Promise<void> {
    const roots = [
      ['Luna', '/Users/mac/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/Luna'],
      ['luna纯文案', '/Users/mac/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/luna纯文案'],
      ['Stella纯文案', '/Users/mac/Movies/JianyingPro/User Data/Projects/com.lveditor.draft/Stella纯文案'],
    ] as const;
    for (const [name, draftPath] of roots) {
      if (!fs.existsSync(draftPath)) continue;
      try {
        await this.registerTemplate(draftPath, name);
      } catch {
        // Registration can be completed manually from the UI if the template changes.
      }
    }
  }
}

export const automationService = new AutomationService();
