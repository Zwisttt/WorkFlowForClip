import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { installMatrixflowMock, removeMatrixflowMock } from '../../../mocks/window-matrixflow';
import { useDraftStore } from '@/renderer/stores/draft';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';

let mock: MatrixflowMock;

function makeDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: 'draft-1',
    type: 'video' as const,
    title: 'Test Draft',
    description: 'Test description',
    platformConfigs: {},
    status: 'draft' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function okResult<T>(data: T) {
  return { success: true, data };
}

beforeEach(() => {
  setActivePinia(createPinia());
  mock = installMatrixflowMock();
});

afterEach(() => {
  removeMatrixflowMock();
});

describe('useDraftStore', () => {
  describe('initial state', () => {
    it('starts with empty drafts', () => {
      const store = useDraftStore();
      expect(store.drafts).toEqual([]);
    });

    it('starts with loading=false', () => {
      const store = useDraftStore();
      expect(store.loading).toBe(false);
    });

    it('starts with empty filterStatus', () => {
      const store = useDraftStore();
      expect(store.filterStatus).toBe('');
    });
  });

  describe('loadDrafts', () => {
    it('loads drafts from IPC', async () => {
      const drafts = [makeDraft({ id: 'd-1' }), makeDraft({ id: 'd-2' })];
      mock.draft.list.mockResolvedValue(okResult(drafts));

      const store = useDraftStore();
      await store.loadDrafts();

      expect(store.drafts).toEqual(drafts);
      expect(mock.draft.list).toHaveBeenCalled();
    });

    it('passes filterStatus to IPC when set', async () => {
      mock.draft.list.mockResolvedValue(okResult([]));

      const store = useDraftStore();
      store.filterStatus = 'ready';
      await store.loadDrafts();

      expect(mock.draft.list).toHaveBeenCalledWith('ready');
    });

    it('manages loading state', async () => {
      let loadingDuringCall = false;
      mock.draft.list.mockImplementation(async () => {
        loadingDuringCall = useDraftStore().loading;
        return okResult([]);
      });

      const store = useDraftStore();
      await store.loadDrafts();

      expect(loadingDuringCall).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('resets loading on error', async () => {
      mock.draft.list.mockRejectedValue(new Error('IPC fail'));

      const store = useDraftStore();
      await expect(store.loadDrafts()).rejects.toThrow('IPC fail');
      expect(store.loading).toBe(false);
    });
  });

  describe('createDraft', () => {
    it('creates draft and prepends to list', async () => {
      const newDraft = makeDraft({ id: 'new-1' });
      mock.draft.create.mockResolvedValue(okResult(newDraft));

      const store = useDraftStore();
      const result = await store.createDraft({
        type: 'video',
        title: 'New Draft',
        platformConfigs: {},
        status: 'draft',
      });

      expect(result).toEqual(newDraft);
      expect(store.drafts[0]).toEqual(newDraft);
    });

    it('returns null when IPC returns unsuccessful result', async () => {
      mock.draft.create.mockResolvedValue({ success: false, data: undefined });

      const store = useDraftStore();
      const result = await store.createDraft({
        type: 'video',
        title: 'Fail',
        platformConfigs: {},
        status: 'draft',
      });

      expect(result).toBeNull();
      expect(store.drafts).toHaveLength(0);
    });
  });

  describe('updateDraft', () => {
    it('updates draft in list', async () => {
      const updated = makeDraft({ id: 'd-1', title: 'Updated' });
      mock.draft.update.mockResolvedValue(okResult(updated));

      const store = useDraftStore();
      store.drafts = [makeDraft({ id: 'd-1', title: 'Original' })];
      const result = await store.updateDraft('d-1', { title: 'Updated' });

      expect(result).toEqual(updated);
      expect(store.drafts[0].title).toBe('Updated');
    });

    it('returns null when IPC returns unsuccessful result', async () => {
      mock.draft.update.mockResolvedValue({ success: false, data: undefined });

      const store = useDraftStore();
      const result = await store.updateDraft('d-1', { title: 'Fail' });

      expect(result).toBeNull();
    });
  });

  describe('deleteDraft', () => {
    it('deletes draft from list', async () => {
      mock.draft.delete.mockResolvedValue({ success: true });

      const store = useDraftStore();
      store.drafts = [makeDraft({ id: 'd-1' }), makeDraft({ id: 'd-2' })];
      const result = await store.deleteDraft('d-1');

      expect(result).toBe(true);
      expect(store.drafts).toHaveLength(1);
      expect(store.drafts[0].id).toBe('d-2');
    });

    it('returns false when IPC returns unsuccessful result', async () => {
      mock.draft.delete.mockResolvedValue({ success: false });

      const store = useDraftStore();
      store.drafts = [makeDraft({ id: 'd-1' })];
      const result = await store.deleteDraft('d-1');

      expect(result).toBe(false);
      expect(store.drafts).toHaveLength(1);
    });
  });

  describe('duplicateDraft', () => {
    it('duplicates draft and prepends copy', async () => {
      const copy = makeDraft({ id: 'd-copy', title: 'Test Draft (副本)' });
      mock.draft.duplicate.mockResolvedValue(okResult(copy));

      const store = useDraftStore();
      store.drafts = [makeDraft({ id: 'd-1' })];
      const result = await store.duplicateDraft('d-1');

      expect(result).toEqual(copy);
      expect(store.drafts).toHaveLength(2);
      expect(store.drafts[0].id).toBe('d-copy');
    });

    it('returns null when IPC returns unsuccessful result', async () => {
      mock.draft.duplicate.mockResolvedValue({ success: false, data: undefined });

      const store = useDraftStore();
      const result = await store.duplicateDraft('d-1');

      expect(result).toBeNull();
    });
  });

  describe('getPlatformConfig', () => {
    it('returns platform config for existing draft', () => {
      const store = useDraftStore();
      store.drafts = [
        makeDraft({
          id: 'd-1',
          platformConfigs: { douyin: { title: '抖音标题' } },
        }),
      ];

      const config = store.getPlatformConfig('d-1', 'douyin');
      expect(config).toEqual({ title: '抖音标题' });
    });

    it('returns null for non-existent platform', () => {
      const store = useDraftStore();
      store.drafts = [makeDraft({ id: 'd-1', platformConfigs: {} })];

      const config = store.getPlatformConfig('d-1', 'xiaohongshu');
      expect(config).toBeNull();
    });

    it('returns null for non-existent draft', () => {
      const store = useDraftStore();
      const config = store.getPlatformConfig('d-999', 'douyin');
      expect(config).toBeNull();
    });
  });
});
