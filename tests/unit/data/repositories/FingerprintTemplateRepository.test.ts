import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabaseMock } from '../../../mocks/Database';

const mockDb = createDatabaseMock();

vi.mock('@electron/data/Database', () => ({
  getDatabase: () => mockDb,
  runAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransactionAsync: (fn: (db: typeof mockDb) => unknown) => Promise.resolve().then(() => fn(mockDb)),
  runInTransaction: (fn: (db: typeof mockDb) => unknown) => fn(mockDb),
}));

import { FingerprintTemplateRepository } from '@electron/data/repositories/FingerprintTemplateRepository';
import type { FingerprintTemplate } from '@electron/data/types';

describe('FingerprintTemplateRepository', () => {
  let repo: FingerprintTemplateRepository;
  let stmt: ReturnType<typeof mockDb.prepare>;

  const mockTemplate: FingerprintTemplate = {
    id: 'fp-1',
    name: 'Chrome Desktop',
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
    screen_width: 1920,
    screen_height: 1080,
    language: 'zh-CN',
    platform: 'Win32',
    webgl_vendor: 'Google Inc.',
    webgl_renderer: 'ANGLE (Intel)',
    extra_config: '{}',
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stmt = mockDb.prepare();
    repo = new FingerprintTemplateRepository();
  });

  describe('constructor', () => {
    it('uses "fingerprint_templates" as table name', () => {
      expect((repo as unknown as { tableName: string }).tableName).toBe('fingerprint_templates');
    });
  });

  describe('findByName', () => {
    it('returns template when found by name', async () => {
      stmt.get.mockReturnValue(mockTemplate);

      const result = await repo.findByName('Chrome Desktop');

      expect(result).toEqual(mockTemplate);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE name = @name')
      );
    });

    it('returns undefined when name not found', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.findByName('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('findById', () => {
    it('returns template when found', async () => {
      stmt.get.mockReturnValue(mockTemplate);

      const result = await repo.findById('fp-1');

      expect(result).toEqual(mockTemplate);
    });

    it('returns undefined when not found', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.findById('nonexistent');

      expect(result).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('returns paginated results', async () => {
      const countStmt = { get: vi.fn().mockReturnValue({ total: 1 }) };
      const listStmt = { all: vi.fn().mockReturnValue([mockTemplate]) };
      mockDb.prepare.mockReturnValueOnce(countStmt).mockReturnValueOnce(listStmt);

      const result = await repo.findAll();

      expect(result).toEqual({
        data: [mockTemplate],
        total: 1,
        page: 1,
        pageSize: 50,
      });
    });
  });

  describe('findWhere', () => {
    it('returns templates matching conditions', async () => {
      stmt.all.mockReturnValue([mockTemplate]);

      const result = await repo.findWhere({ platform: 'Win32' });

      expect(result).toEqual([mockTemplate]);
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE platform = @platform')
      );
    });
  });

  describe('insert', () => {
    it('inserts new template', async () => {
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(mockTemplate) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.insert({
        id: 'fp-1',
        name: 'Chrome Desktop',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0',
        screen_width: 1920,
        screen_height: 1080,
        language: 'zh-CN',
        platform: 'Win32',
        webgl_vendor: 'Google Inc.',
        webgl_renderer: 'ANGLE (Intel)',
        extra_config: '{}',
      });

      expect(result).toEqual(mockTemplate);
    });
  });

  describe('update', () => {
    it('updates template fields', async () => {
      const updated = { ...mockTemplate, screen_width: 2560 };
      const runStmt = { run: vi.fn() };
      const getStmt = { get: vi.fn().mockReturnValue(updated) };
      mockDb.prepare.mockReturnValueOnce(runStmt).mockReturnValueOnce(getStmt);

      const result = await repo.update('fp-1', { screen_width: 2560 });

      expect(result.screen_width).toBe(2560);
    });
  });

  describe('deleteById', () => {
    it('deletes template by id', async () => {
      stmt.run.mockReturnValue({ changes: 1 });

      const result = await repo.deleteById('fp-1');

      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      stmt.run.mockReturnValue({ changes: 0 });

      const result = await repo.deleteById('nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('count', () => {
    it('returns total count', async () => {
      stmt.get.mockReturnValue({ total: 5 });

      const result = await repo.count();

      expect(result).toBe(5);
    });
  });

  describe('exists', () => {
    it('returns true when template exists', async () => {
      stmt.get.mockReturnValue({ '1': 1 });

      const result = await repo.exists('fp-1');

      expect(result).toBe(true);
    });

    it('returns false when template does not exist', async () => {
      stmt.get.mockReturnValue(undefined);

      const result = await repo.exists('nonexistent');

      expect(result).toBe(false);
    });
  });
});
