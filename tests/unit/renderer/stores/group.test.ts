import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { installMatrixflowMock, removeMatrixflowMock } from '../../../mocks/window-matrixflow';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';
import type { Group } from '@/renderer/stores/group';
import { useGroupStore } from '@/renderer/stores/group';

function makeGroup(overrides: Partial<Group> = {}): Group {
  return {
    id: 'group_1',
    name: '测试分组',
    color: '#db4b4b',
    accountIds: ['acc_1', 'acc_2'],
    publishRule: {
      platforms: ['douyin'],
      timeSlots: ['09:00', '12:00'],
      randomOffsetMin: 10,
      dailyCount: 3,
      publishMode: 'client',
      publishOrder: 'upload_order',
      restDays: [],
      isActive: true,
      publishStartTime: '08:00',
      publishEndTime: '22:00',
      intervalMinutes: 30,
      dailyLimit: 10,
      randomDelay: true,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useGroupStore', () => {
  let mock: MatrixflowMock;

  beforeEach(() => {
    setActivePinia(createPinia());
    mock = installMatrixflowMock();
  });

  afterEach(() => {
    removeMatrixflowMock();
  });

  describe('state', () => {
    it('initializes with empty groups and loading=false', () => {
      const store = useGroupStore();
      expect(store.groups).toEqual([]);
      expect(store.loading).toBe(false);
    });
  });

  describe('computed: groupCount', () => {
    it('returns 0 when no groups', () => {
      const store = useGroupStore();
      expect(store.groupCount).toBe(0);
    });

    it('returns total number of groups', () => {
      const store = useGroupStore();
      store.groups = [
        makeGroup({ id: '1' }),
        makeGroup({ id: '2' }),
        makeGroup({ id: '3' }),
      ];
      expect(store.groupCount).toBe(3);
    });
  });

  describe('actions', () => {
    describe('fetchGroups', () => {
      it('calls groups.list and populates state', async () => {
        const groups = [
          makeGroup({ id: '1', name: '分组A' }),
          makeGroup({ id: '2', name: '分组B' }),
        ];
        mock.groups.list.mockResolvedValue(groups);

        const store = useGroupStore();
        await store.fetchGroups();

        expect(mock.groups.list).toHaveBeenCalledOnce();
        expect(store.groups).toEqual(groups);
      });

      it('sets loading=true during fetch and loading=false after', async () => {
        let loadingDuringCall = false;
        mock.groups.list.mockImplementation(async () => {
          const store = useGroupStore();
          loadingDuringCall = store.loading;
          return [];
        });

        const store = useGroupStore();
        await store.fetchGroups();

        expect(loadingDuringCall).toBe(true);
        expect(store.loading).toBe(false);
      });

      it('resets loading to false even on error', async () => {
        mock.groups.list.mockRejectedValue(new Error('IPC fail'));

        const store = useGroupStore();
        await expect(store.fetchGroups()).rejects.toThrow('IPC fail');

        expect(store.loading).toBe(false);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useGroupStore();
        await store.fetchGroups();

        expect(store.groups).toEqual([]);
      });
    });

    describe('createGroup', () => {
      it('calls groups.create with generated color and default publishRule', async () => {
        const newGroup = makeGroup({ id: 'new_1', name: '新分组' });
        mock.groups.create.mockResolvedValue(newGroup);

        const store = useGroupStore();
        const result = await store.createGroup({ name: '新分组' });

        expect(mock.groups.create).toHaveBeenCalledOnce();
        const createArg = mock.groups.create.mock.calls[0][0];
        expect(createArg.name).toBe('新分组');
        expect(createArg.accountIds).toEqual([]);
        expect(createArg.color).toBeTruthy();
        expect(createArg.publishRule).toBeDefined();
        expect(createArg.publishRule.dailyCount).toBe(3);
        expect(store.groups).toHaveLength(1);
        expect(store.groups[0]).toEqual(newGroup);
        expect(result).toEqual(newGroup);
      });

      it('passes accountIds when provided', async () => {
        const newGroup = makeGroup({ id: 'new_2', accountIds: ['acc_1'] });
        mock.groups.create.mockResolvedValue(newGroup);

        const store = useGroupStore();
        await store.createGroup({ name: '带账号分组', accountIds: ['acc_1'] });

        const createArg = mock.groups.create.mock.calls[0][0];
        expect(createArg.accountIds).toEqual(['acc_1']);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useGroupStore();
        const result = await store.createGroup({ name: 'test' });

        expect(result).toBeUndefined();
        expect(store.groups).toEqual([]);
      });
    });

    describe('updateGroup', () => {
      it('calls groups.update and merges result into state', async () => {
        const updatedData = { name: '更新后分组' };
        mock.groups.update.mockResolvedValue(updatedData);

        const store = useGroupStore();
        store.groups = [makeGroup({ id: '1', name: '更新前' })];
        const result = await store.updateGroup('1', updatedData);

        expect(mock.groups.update).toHaveBeenCalledWith('1', updatedData);
        expect(store.groups[0].name).toBe('更新后分组');
        expect(result).toEqual(updatedData);
      });

      it('handles update for non-existent group in state', async () => {
        mock.groups.update.mockResolvedValue({ name: 'x' });

        const store = useGroupStore();
        store.groups = [makeGroup({ id: '1' })];
        const result = await store.updateGroup('99', { name: 'x' });

        expect(store.groups).toHaveLength(1);
        expect(result).toEqual({ name: 'x' });
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useGroupStore();
        const result = await store.updateGroup('1', { name: 'test' });

        expect(result).toBeUndefined();
      });
    });

    describe('deleteGroup', () => {
      it('calls groups.delete and removes from state', async () => {
        mock.groups.delete.mockResolvedValue({ success: true });

        const store = useGroupStore();
        store.groups = [
          makeGroup({ id: '1' }),
          makeGroup({ id: '2' }),
        ];
        await store.deleteGroup('1');

        expect(mock.groups.delete).toHaveBeenCalledWith('1');
        expect(store.groups).toHaveLength(1);
        expect(store.groups[0].id).toBe('2');
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useGroupStore();
        store.groups = [makeGroup({ id: '1' })];
        await store.deleteGroup('1');

        expect(store.groups).toHaveLength(1);
      });
    });

    describe('bindAccounts', () => {
      it('calls groups.bindAccounts and updates local state', async () => {
        mock.groups.bindAccounts.mockResolvedValue({ success: true });

        const store = useGroupStore();
        store.groups = [makeGroup({ id: '1', accountIds: [] })];
        await store.bindAccounts('1', ['acc_1', 'acc_2']);

        expect(mock.groups.bindAccounts).toHaveBeenCalledWith('1', ['acc_1', 'acc_2']);
        expect(store.groups[0].accountIds).toEqual(['acc_1', 'acc_2']);
      });

      it('handles bindAccounts for non-existent group in state', async () => {
        mock.groups.bindAccounts.mockResolvedValue({ success: true });

        const store = useGroupStore();
        store.groups = [makeGroup({ id: '1', accountIds: [] })];
        await store.bindAccounts('99', ['acc_1']);

        expect(store.groups[0].accountIds).toEqual([]);
      });

      it('does nothing when window.matrixflow is undefined', async () => {
        removeMatrixflowMock();
        (globalThis as Record<string, unknown>).window = {};

        const store = useGroupStore();
        store.groups = [makeGroup({ id: '1', accountIds: [] })];
        await store.bindAccounts('1', ['acc_1']);

        expect(store.groups[0].accountIds).toEqual([]);
      });
    });

    describe('getGroupById', () => {
      it('returns the group with matching id', () => {
        const store = useGroupStore();
        store.groups = [
          makeGroup({ id: '1', name: 'A' }),
          makeGroup({ id: '2', name: 'B' }),
        ];
        expect(store.getGroupById('1')).toEqual(store.groups[0]);
        expect(store.getGroupById('2')).toEqual(store.groups[1]);
      });

      it('returns undefined for non-existent id', () => {
        const store = useGroupStore();
        store.groups = [makeGroup({ id: '1' })];
        expect(store.getGroupById('99')).toBeUndefined();
      });

      it('returns undefined when no groups', () => {
        const store = useGroupStore();
        expect(store.getGroupById('1')).toBeUndefined();
      });
    });

    describe('getGroupAccountCount', () => {
      it('returns account count for matching group', () => {
        const store = useGroupStore();
        store.groups = [
          makeGroup({ id: '1', accountIds: ['a', 'b', 'c'] }),
          makeGroup({ id: '2', accountIds: ['d'] }),
        ];
        expect(store.getGroupAccountCount('1')).toBe(3);
        expect(store.getGroupAccountCount('2')).toBe(1);
      });

      it('returns 0 for non-existent group', () => {
        const store = useGroupStore();
        store.groups = [makeGroup({ id: '1', accountIds: ['a'] })];
        expect(store.getGroupAccountCount('99')).toBe(0);
      });

      it('returns 0 when no groups', () => {
        const store = useGroupStore();
        expect(store.getGroupAccountCount('1')).toBe(0);
      });
    });
  });
});
