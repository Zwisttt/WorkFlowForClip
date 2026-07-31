import { randomUUID } from 'crypto';
import { BaseRepository } from './BaseRepository';
import { runAsync, runInTransactionAsync } from '../Database';

export interface AutomationTemplateRow {
  id: string;
  name: string;
  draft_path: string;
  draft_file: string;
  text_slot_key: string;
  image_slot_keys: string;
  audio_slot_key: string;
  slots_json: string;
  created_at: string;
  updated_at: string;
}

export interface AutomationBatchRow {
  id: string;
  source_file: string;
  status: string;
  total_items: number;
  completed_items: number;
  failed_items: number;
  progress: number;
  public_audio_dir: string;
  draft_output_dir: string;
  video_output_dir: string;
  export_settings: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AutomationItemRow {
  id: string;
  batch_id: string;
  sheet_name: string;
  row_number: number;
  template_name: string;
  script: string;
  background_path: string;
  chart_path: string;
  bgm_path: string;
  publish_copy: string;
  topics: string;
  requested_scheduled_at: string;
  work_name: string;
  resolved_work_name: string;
  draft_path: string | null;
  video_path: string | null;
  status: string;
  error_stage: string | null;
  error_message: string | null;
  error_at: string | null;
  retry_count: number;
  account_plans: string;
  warning_message: string | null;
  created_at: string;
  updated_at: string;
}

export class AutomationTemplateRepository extends BaseRepository<AutomationTemplateRow> {
  constructor() {
    super('automation_templates');
  }

  async upsert(row: Omit<AutomationTemplateRow, 'created_at' | 'updated_at'>): Promise<AutomationTemplateRow> {
    return runInTransactionAsync((db) => {
      db.prepare(`
        INSERT INTO automation_templates (
          id, name, draft_path, draft_file, text_slot_key, image_slot_keys,
          audio_slot_key, slots_json
        ) VALUES (
          @id, @name, @draft_path, @draft_file, @text_slot_key, @image_slot_keys,
          @audio_slot_key, @slots_json
        )
        ON CONFLICT(name) DO UPDATE SET
          draft_path = excluded.draft_path,
          draft_file = excluded.draft_file,
          text_slot_key = excluded.text_slot_key,
          image_slot_keys = excluded.image_slot_keys,
          audio_slot_key = excluded.audio_slot_key,
          slots_json = excluded.slots_json,
          updated_at = datetime('now')
      `).run(row);
      return db.prepare('SELECT * FROM automation_templates WHERE name = ?')
        .get(row.name) as AutomationTemplateRow;
    });
  }

  async findByName(name: string): Promise<AutomationTemplateRow | undefined> {
    return this.findOneWhere({ name } as Partial<AutomationTemplateRow>);
  }
}

export class AutomationBatchRepository extends BaseRepository<AutomationBatchRow> {
  constructor() {
    super('automation_batches');
  }

  async listRecent(limit = 30): Promise<AutomationBatchRow[]> {
    return runAsync((db) => db.prepare(
      'SELECT * FROM automation_batches ORDER BY created_at DESC LIMIT ?'
    ).all(limit) as AutomationBatchRow[]);
  }
}

export class AutomationItemRepository extends BaseRepository<AutomationItemRow> {
  constructor() {
    super('automation_items');
  }

  async findByBatch(batchId: string): Promise<AutomationItemRow[]> {
    return runAsync((db) => db.prepare(
      'SELECT * FROM automation_items WHERE batch_id = ? ORDER BY row_number ASC, created_at ASC'
    ).all(batchId) as AutomationItemRow[]);
  }

  async findRecoverable(): Promise<AutomationItemRow[]> {
    return runAsync((db) => db.prepare(`
      SELECT * FROM automation_items
      WHERE status IN (
        'ready', 'generating', 'draft_ready', 'exporting',
        'video_ready', 'scheduled', 'publishing'
      )
      ORDER BY requested_scheduled_at ASC
    `).all() as AutomationItemRow[]);
  }

  async recordEvent(
    batchId: string,
    itemId: string | null,
    level: 'info' | 'warning' | 'error',
    stage: string,
    message: string,
    details: Record<string, unknown> = {},
  ): Promise<void> {
    await runAsync((db) => {
      db.prepare(`
        INSERT INTO automation_events (
          id, batch_id, item_id, level, stage, message, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), batchId, itemId, level, stage, message, JSON.stringify(details));
    });
  }
}

export const automationTemplateRepo = new AutomationTemplateRepository();
export const automationBatchRepo = new AutomationBatchRepository();
export const automationItemRepo = new AutomationItemRepository();
