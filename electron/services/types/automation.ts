export type AutomationItemStatus =
  | 'validation_failed'
  | 'ready'
  | 'generating'
  | 'draft_ready'
  | 'exporting'
  | 'video_ready'
  | 'scheduling'
  | 'scheduled'
  | 'publishing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AutomationBatchStatus =
  | 'validated'
  | 'running'
  | 'paused'
  | 'awaiting_export_setup'
  | 'completed'
  | 'partial_failed'
  | 'cancelled';

export interface AutomationTemplateSlot {
  key: string;
  type: 'text' | 'image' | 'audio';
  label: string;
  preview: string;
  sourcePath?: string;
}

export interface AutomationTemplate {
  id: string;
  name: string;
  draftPath: string;
  draftFile: string;
  textSlotKey: string;
  imageSlotKeys: string[];
  audioSlotKey: string;
  slots: AutomationTemplateSlot[];
  createdAt: string;
  updatedAt: string;
}

export interface AutomationAccountMatch {
  id: string;
  name: string;
  platform: string;
  cookieValid: boolean;
  status: string;
}

export interface AutomationSheetPreview {
  name: string;
  rowCount: number;
  matchedAccounts: AutomationAccountMatch[];
}

export interface AutomationValidationIssue {
  sheetName: string;
  rowNumber: number;
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface AutomationRowPreview {
  sheetName: string;
  rowNumber: number;
  templateName: string;
  script: string;
  backgroundPath: string;
  chartPath: string;
  bgmPath: string;
  publishCopy: string;
  topics: string[];
  requestedScheduledAt: string | null;
  workName: string;
  title: string;
  description: string;
}

export interface AutomationWorkbookPreview {
  filePath: string;
  sheets: AutomationSheetPreview[];
  rows: AutomationRowPreview[];
  issues: AutomationValidationIssue[];
  canStart: boolean;
}

export interface AutomationSheetMapping {
  sheetName: string;
  accountIds: string[];
}

export interface AutomationStartRequest {
  filePath: string;
  sheetMappings: AutomationSheetMapping[];
  publicAudioDir: string;
  draftOutputDir: string;
  videoOutputDir: string;
  exportWaitSeconds: number;
  openWaitSeconds?: number;
  homeWaitSeconds?: number;
  stepPauseSeconds?: number;
}

export interface AutomationAccountPlan {
  accountId: string;
  accountName: string;
  platform: 'douyin' | 'xiaohongshu';
  scheduledAt: string;
  mode: 'native_schedule' | 'local_schedule';
  status: 'ready' | 'scheduled' | 'publishing' | 'completed' | 'failed';
  publishTaskId?: string;
  error?: string;
}

export interface AutomationBatch {
  id: string;
  sourceFile: string;
  status: AutomationBatchStatus;
  totalItems: number;
  completedItems: number;
  failedItems: number;
  progress: number;
  publicAudioDir: string;
  draftOutputDir: string;
  videoOutputDir: string;
  exportSettings: Record<string, number>;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationItem {
  id: string;
  batchId: string;
  sheetName: string;
  rowNumber: number;
  templateName: string;
  script: string;
  backgroundPath: string;
  chartPath: string;
  bgmPath: string;
  publishCopy: string;
  topics: string[];
  requestedScheduledAt: string;
  workName: string;
  resolvedWorkName: string;
  draftPath?: string;
  videoPath?: string;
  status: AutomationItemStatus;
  errorStage?: string;
  errorMessage?: string;
  errorAt?: string;
  retryCount: number;
  accountPlans: AutomationAccountPlan[];
  warningMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationBatchDetail {
  batch: AutomationBatch;
  items: AutomationItem[];
}

export interface AutomationCoordinate {
  key: 'search' | 'result' | 'export' | 'confirm' | 'close' | 'home';
  label: string;
  x?: number;
  y?: number;
}

export interface AutomationExportSettings {
  coordinates: AutomationCoordinate[];
  ready: boolean;
}

export interface AutomationStopExportsResult {
  stoppedWorker: boolean;
  pausedBatches: number;
  pausedItems: number;
}
