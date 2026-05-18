import { describe, it, expect, beforeEach, vi } from 'vitest';

const {
  mockBackup, mockExec, mockPrepare, mockPragma, mockClose,
  mockExistsSync, mockMkdirSync, mockReaddirSync, mockStatSync,
  mockCopyFileSync, mockUnlinkSync,
} = vi.hoisted(() => ({
  mockBackup: vi.fn(),
  mockExec: vi.fn(),
  mockPrepare: vi.fn(() => ({
    run: vi.fn(),
    all: vi.fn(() => []),
    get: vi.fn(() => undefined),
  })),
  mockPragma: vi.fn(),
  mockClose: vi.fn(),
  mockExistsSync: vi.fn(() => true),
  mockMkdirSync: vi.fn(),
  mockReaddirSync: vi.fn(() => []),
  mockStatSync: vi.fn(() => ({ size: 1024, birthtime: new Date('2025-01-01') })),
  mockCopyFileSync: vi.fn(),
  mockUnlinkSync: vi.fn(),
}));

const mockTransaction = vi.fn((fn: Function) => (...args: unknown[]) => fn(...args));

vi.mock('better-sqlite3', () => {
  const ctor = function () {
    return {
      pragma: mockPragma,
      exec: mockExec,
      prepare: mockPrepare,
      transaction: mockTransaction,
      close: mockClose,
      backup: mockBackup,
    };
  };
  const mod = Object.assign(ctor, {
    __esModule: true,
    default: ctor,
  });
  return mod;
});

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    readdirSync: mockReaddirSync,
    statSync: mockStatSync,
    copyFileSync: mockCopyFileSync,
    unlinkSync: mockUnlinkSync,
  },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  readdirSync: mockReaddirSync,
  statSync: mockStatSync,
  copyFileSync: mockCopyFileSync,
  unlinkSync: mockUnlinkSync,
}));

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/matrixflow-test'),
  },
}));

vi.mock('@electron/core/Logger', () => ({
  Logger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { initDatabase, createBackup, listBackups, restoreBackup, deleteBackup, clearData, closeDatabase } from '@electron/data/Database';

describe('Database backup functions', () => {
  beforeEach(() => {
    mockPrepare.mockReturnValue({ run: vi.fn(), all: vi.fn(() => []), get: vi.fn(() => undefined) });
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    mockStatSync.mockReturnValue({ size: 1024, birthtime: new Date('2025-01-01') });
    mockExec.mockReset();
    mockBackup.mockReset();
    mockCopyFileSync.mockReset();
    mockUnlinkSync.mockReset();
    mockMkdirSync.mockReset();
  });



  describe('listBackups', () => {
    it('returns empty array when no backups', () => {
      initDatabase();
      mockReaddirSync.mockReturnValue([]);

      const result = listBackups();
      expect(result).toEqual([]);
    });

    it('returns empty array when backup dir does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      const result = listBackups();
      expect(result).toEqual([]);
    });

    it('returns sorted backup list newest first', () => {
      initDatabase();
      const files = ['backup-2025-01-01-120000.db', 'backup-2025-06-01-120000.db'];
      mockReaddirSync.mockReturnValue(files);
      mockStatSync.mockImplementation((p: string) => {
        const isJan = p.includes('2025-01-01');
        return {
          size: 1024,
          birthtime: isJan ? new Date('2025-01-01') : new Date('2025-06-01'),
        };
      });

      const result = listBackups();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('backup-2025-06-01-120000.db');
      expect(result[1].name).toBe('backup-2025-01-01-120000.db');
    });

    it('filters non-backup files', () => {
      initDatabase();
      mockReaddirSync.mockReturnValue(['backup-good.db', 'other-file.txt', 'notes.md']);

      const result = listBackups();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('backup-good.db');
    });
  });

  describe('restoreBackup', () => {
    it('replaces main DB with backup', () => {
      initDatabase();
      mockExistsSync.mockReturnValue(true);

      restoreBackup('backup-2025-06-01-120000');

      expect(mockCopyFileSync).toHaveBeenCalled();
    });

    it('throws when backup file not found', () => {
      initDatabase();
      mockExistsSync.mockReturnValue(false);

      expect(() => restoreBackup('nonexistent')).toThrow('备份文件不存在');
    });
  });

  describe('deleteBackup', () => {
    it('removes backup file', () => {
      initDatabase();
      mockExistsSync.mockReturnValue(true);

      deleteBackup('backup-2025-01-01-120000');

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('throws when file not found', () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => deleteBackup('nonexistent')).toThrow('备份文件不存在');
    });
  });

  describe('clearData', () => {
    it('clears logs directory with type=logs', () => {
      mockReaddirSync.mockReturnValue(['log1.txt', 'log2.txt']);

      clearData('logs');

      expect(mockUnlinkSync).toHaveBeenCalledTimes(2);
    });

    it('clears cache directory with type=cache', () => {
      mockReaddirSync.mockReturnValue(['cache1.tmp']);
      mockStatSync.mockReturnValue({ size: 100, isDirectory: () => false });

      clearData('cache');

      expect(mockUnlinkSync).toHaveBeenCalled();
    });

    it('handles non-existent logs dir', () => {
      mockExistsSync.mockReturnValue(false);

      expect(() => clearData('logs')).not.toThrow();
    });
  });
});
