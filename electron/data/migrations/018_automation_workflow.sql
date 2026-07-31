CREATE TABLE IF NOT EXISTS automation_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  draft_path TEXT NOT NULL,
  draft_file TEXT NOT NULL,
  text_slot_key TEXT NOT NULL,
  image_slot_keys TEXT NOT NULL DEFAULT '[]',
  audio_slot_key TEXT NOT NULL,
  slots_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_batches (
  id TEXT PRIMARY KEY,
  source_file TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'validated',
  total_items INTEGER NOT NULL DEFAULT 0,
  completed_items INTEGER NOT NULL DEFAULT 0,
  failed_items INTEGER NOT NULL DEFAULT 0,
  progress REAL NOT NULL DEFAULT 0,
  public_audio_dir TEXT NOT NULL DEFAULT '',
  draft_output_dir TEXT NOT NULL DEFAULT '',
  video_output_dir TEXT NOT NULL DEFAULT '',
  export_settings TEXT NOT NULL DEFAULT '{}',
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS automation_items (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  template_name TEXT NOT NULL,
  script TEXT NOT NULL,
  background_path TEXT NOT NULL DEFAULT '',
  chart_path TEXT NOT NULL DEFAULT '',
  bgm_path TEXT NOT NULL DEFAULT '',
  publish_copy TEXT NOT NULL DEFAULT '',
  topics TEXT NOT NULL DEFAULT '[]',
  requested_scheduled_at TEXT NOT NULL,
  work_name TEXT NOT NULL,
  resolved_work_name TEXT NOT NULL,
  draft_path TEXT,
  video_path TEXT,
  status TEXT NOT NULL DEFAULT 'ready',
  error_stage TEXT,
  error_message TEXT,
  error_at TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  account_plans TEXT NOT NULL DEFAULT '[]',
  warning_message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (batch_id) REFERENCES automation_batches(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS automation_events (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  item_id TEXT,
  level TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (batch_id) REFERENCES automation_batches(id) ON DELETE CASCADE,
  FOREIGN KEY (item_id) REFERENCES automation_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_automation_templates_name ON automation_templates(name);
CREATE INDEX IF NOT EXISTS idx_automation_batches_status ON automation_batches(status);
CREATE INDEX IF NOT EXISTS idx_automation_items_batch ON automation_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_automation_items_status ON automation_items(status);
CREATE INDEX IF NOT EXISTS idx_automation_items_scheduled ON automation_items(requested_scheduled_at);
CREATE INDEX IF NOT EXISTS idx_automation_events_batch ON automation_events(batch_id);
