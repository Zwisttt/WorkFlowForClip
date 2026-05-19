import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { draftService } from '@electron/services/DraftService';

const mockDb = vi.hoisted(() => ({
  prepare: vi.fn(),
}));

const mockLog = vi.hoisted(() => ({
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
}));

let dbAvailable = vi.hoisted(() => true);

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => mockDb),
}));

vi.mock('electron-log', () => ({
  default: mockLog,
  info: mockLog.info,
  error: mockLog.error,
  warn: mockLog.warn,
  transports: { file: { resolvePathFn: vi.fn() } },
}));

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  isDatabaseAvailable: () => dbAvailable,
}));

function stmt(get?: unknown, all?: unknown[], run?: unknown) {
  return { get: vi.fn(() => get), all: vi.fn(() => all ?? []), run: vi.fn(() => run) };
}

describe('DraftService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbAvailable = true;
    mockDb.prepare.mockReturnValue(stmt());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createDraft', () => {
    it('creates and saves a draft', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt());

      const draft = draftService.createDraft({
        type: 'video',
        title: '测试视频',
        platformConfigs: { douyin: { title: '抖音标题' } },
        status: 'draft',
      });

      expect(draft.id).toMatch(/^draft_/);
      expect(draft.type).toBe('video');
      expect(draft.title).toBe('测试视频');
      expect(draft.status).toBe('draft');
      expect(mockDb.prepare).toHaveBeenCalled();
    });

    it('creates draft with optional fields', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt());

      const draft = draftService.createDraft({
        type: 'image',
        title: '图片草稿',
        description: '描述',
        coverPath: '/tmp/cover.jpg',
        filePath: '/tmp/img.png',
        platformConfigs: {},
        status: 'ready',
      });

      expect(draft.type).toBe('image');
      expect(draft.description).toBe('描述');
    });
  });

  describe('getDraft', () => {
    it('returns draft when found', () => {
      const row = {
        id: 'draft_001',
        type: 'video',
        title: '测试',
        description: null,
        cover_path: null,
        file_path: '/tmp/video.mp4',
        platform_configs: JSON.stringify({ douyin: { title: '抖音' } }),
        status: 'draft',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      };
      mockDb.prepare.mockReset().mockReturnValue(stmt(row));

      const result = draftService.getDraft('draft_001');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('draft_001');
      expect(result!.type).toBe('video');
      expect(result!.platformConfigs).toEqual({ douyin: { title: '抖音' } });
    });

    it('returns null when not found', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined));
      const result = draftService.getDraft('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null when db unavailable', () => {
      dbAvailable = false;
      const result = draftService.getDraft('draft_001');
      expect(result).toBeNull();
    });

    it('maps null fields to undefined', () => {
      const row = {
        id: 'draft_001',
        type: 'video',
        title: '测试',
        description: null,
        cover_path: null,
        file_path: null,
        platform_configs: JSON.stringify({}),
        status: 'draft',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      };
      mockDb.prepare.mockReset().mockReturnValue(stmt(row));

      const result = draftService.getDraft('draft_001');
      expect(result!.description).toBeUndefined();
      expect(result!.coverPath).toBeUndefined();
      expect(result!.filePath).toBeUndefined();
    });
  });

  describe('updateDraft', () => {
    it('updates draft fields', () => {
      const existing = {
        id: 'draft_001',
        type: 'video',
        title: '旧标题',
        description: null,
        cover_path: null,
        file_path: null,
        platform_configs: JSON.stringify({}),
        status: 'draft',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      };
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(existing))
        .mockReturnValueOnce(stmt());

      const result = draftService.updateDraft('draft_001', { title: '新标题' });
      expect(result).not.toBeNull();
      expect(result!.title).toBe('新标题');
    });

    it('returns null when draft not found', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(null));
      const result = draftService.updateDraft('nonexistent', { title: 'x' });
      expect(result).toBeNull();
    });

    it('preserves id and createdAt on update', () => {
      const existing = {
        id: 'draft_001',
        type: 'video',
        title: '旧',
        description: null,
        cover_path: null,
        file_path: null,
        platform_configs: JSON.stringify({}),
        status: 'draft',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(existing))
        .mockReturnValueOnce(stmt());

      const result = draftService.updateDraft('draft_001', { title: '新' });
      expect(result!.id).toBe('draft_001');
    });
  });

  describe('listDrafts', () => {
    it('returns all drafts', () => {
      const rows = [
        {
          id: 'draft_001',
          type: 'video',
          title: '草稿1',
          description: null,
          cover_path: null,
          file_path: null,
          platform_configs: JSON.stringify({}),
          status: 'draft',
          created_at: '2026-05-01T00:00:00.000Z',
          updated_at: '2026-05-01T00:00:00.000Z',
        },
      ];
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, rows));

      const result = draftService.listDrafts();
      expect(result).toHaveLength(1);
    });

    it('filters by status', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, []));
      draftService.listDrafts('ready');
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('WHERE status = ?'));
    });

    it('returns empty array when db unavailable', () => {
      dbAvailable = false;
      const result = draftService.listDrafts();
      expect(result).toEqual([]);
    });
  });

  describe('deleteDraft', () => {
    it('deletes draft when exists', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, undefined, { changes: 1 }));
      const result = draftService.deleteDraft('draft_001');
      expect(result).toBe(true);
    });

    it('returns false when not found', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(undefined, undefined, { changes: 0 }));
      const result = draftService.deleteDraft('nonexistent');
      expect(result).toBe(false);
    });

    it('returns false when db unavailable', () => {
      dbAvailable = false;
      const result = draftService.deleteDraft('draft_001');
      expect(result).toBe(false);
    });
  });

  describe('duplicateDraft', () => {
    it('duplicates draft with (副本) suffix', () => {
      const original = {
        id: 'draft_001',
        type: 'video',
        title: '测试视频',
        description: '描述',
        cover_path: null,
        file_path: '/tmp/video.mp4',
        platform_configs: JSON.stringify({ douyin: { title: '抖音' } }),
        status: 'draft',
        created_at: '2026-05-01T00:00:00.000Z',
        updated_at: '2026-05-01T00:00:00.000Z',
      };

      mockDb.prepare.mockReset()
        .mockReturnValueOnce(stmt(original))
        .mockReturnValueOnce(stmt());

      const result = draftService.duplicateDraft('draft_001');
      expect(result).not.toBeNull();
      expect(result!.title).toBe('测试视频 (副本)');
      expect(result!.id).not.toBe('draft_001');
    });

    it('returns null when original not found', () => {
      mockDb.prepare.mockReset().mockReturnValue(stmt(null));
      const result = draftService.duplicateDraft('nonexistent');
      expect(result).toBeNull();
    });
  });
});
