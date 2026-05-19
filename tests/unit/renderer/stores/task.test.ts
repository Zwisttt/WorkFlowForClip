import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { installMatrixflowMock, removeMatrixflowMock } from '../../../mocks/window-matrixflow';
import { useTaskStore } from '@/renderer/stores/task';
import type { MatrixflowMock } from '../../../mocks/window-matrixflow';
import type { Task, TaskStatus } from '@/renderer/stores/task';

let mock: MatrixflowMock;

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'publish',
    accountId: 'acc-1',
    accountName: 'TestUser',
    contentId: 'content-1',
    contentTitle: 'Test Content',
    platform: 'douyin',
    status: 'pending',
    progress: 0,
    retryCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  mock = installMatrixflowMock();
});

afterEach(() => {
  removeMatrixflowMock();
});

describe('useTaskStore', () => {
  describe('initial state', () => {
    it('starts with empty tasks', () => {
      const store = useTaskStore();
      expect(store.tasks).toEqual([]);
    });

    it('starts with loading=false', () => {
      const store = useTaskStore();
      expect(store.loading).toBe(false);
    });
  });

  describe('computed', () => {
    it('runningTasks filters by running status', () => {
      const store = useTaskStore();
      store.tasks = [
        makeTask({ id: '1', status: 'running' }),
        makeTask({ id: '2', status: 'pending' }),
        makeTask({ id: '3', status: 'running' }),
      ];
      expect(store.runningTasks).toHaveLength(2);
    });

    it('failedTasks filters by failed status', () => {
      const store = useTaskStore();
      store.tasks = [
        makeTask({ id: '1', status: 'failed' }),
        makeTask({ id: '2', status: 'success' }),
      ];
      expect(store.failedTasks).toHaveLength(1);
    });

    it('hasFailedTasks is true when there are failed tasks', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ status: 'failed' })];
      expect(store.hasFailedTasks).toBe(true);
    });

    it('hasFailedTasks is false when no failed tasks', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ status: 'success' })];
      expect(store.hasFailedTasks).toBe(false);
    });

    it('stats computes correct counts', () => {
      const store = useTaskStore();
      store.tasks = [
        makeTask({ id: '1', status: 'pending' }),
        makeTask({ id: '2', status: 'running' }),
        makeTask({ id: '3', status: 'success' }),
        makeTask({ id: '4', status: 'failed' }),
        makeTask({ id: '5', status: 'skipped' }),
      ];
      const s = store.stats;
      expect(s.total).toBe(5);
      expect(s.pending).toBe(1);
      expect(s.running).toBe(1);
      expect(s.success).toBe(1);
      expect(s.failed).toBe(1);
      expect(s.skipped).toBe(1);
    });

    it('stats returns zeros for empty tasks', () => {
      const store = useTaskStore();
      const s = store.stats;
      expect(s.total).toBe(0);
      expect(s.pending).toBe(0);
      expect(s.running).toBe(0);
    });
  });

  describe('fetchTasks', () => {
    it('fetches tasks from IPC and populates state', async () => {
      const tasks = [makeTask({ id: '1' }), makeTask({ id: '2' })];
      mock.publish.listTasks.mockResolvedValue(tasks);

      const store = useTaskStore();
      await store.fetchTasks();

      expect(store.tasks).toEqual(tasks);
      expect(mock.publish.listTasks).toHaveBeenCalled();
    });

    it('passes filter to IPC', async () => {
      mock.publish.listTasks.mockResolvedValue([]);

      const store = useTaskStore();
      await store.fetchTasks({ contentId: 'c-1' });

      expect(mock.publish.listTasks).toHaveBeenCalledWith({ contentId: 'c-1' });
    });

    it('manages loading state', async () => {
      let loadingDuringCall = false;
      mock.publish.listTasks.mockImplementation(async () => {
        loadingDuringCall = useTaskStore().loading;
        return [];
      });

      const store = useTaskStore();
      await store.fetchTasks();

      expect(loadingDuringCall).toBe(true);
      expect(store.loading).toBe(false);
    });

    it('resets loading on error', async () => {
      mock.publish.listTasks.mockRejectedValue(new Error('IPC fail'));

      const store = useTaskStore();
      await expect(store.fetchTasks()).rejects.toThrow('IPC fail');
      expect(store.loading).toBe(false);
    });

    it('does nothing when window.matrixflow is undefined', async () => {
      removeMatrixflowMock();
      (globalThis as Record<string, unknown>).window = {};

      const store = useTaskStore();
      await store.fetchTasks();

      expect(store.tasks).toEqual([]);
    });
  });

  describe('cancelTask', () => {
    it('cancels task and updates status', async () => {
      mock.publish.cancelTask.mockResolvedValue({ success: true });

      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1', status: 'running' })];
      await store.cancelTask('t-1');

      expect(store.tasks[0].status).toBe('cancelled');
      expect(mock.publish.cancelTask).toHaveBeenCalledWith('t-1');
    });
  });

  describe('retryTask', () => {
    it('calls IPC retryTask', async () => {
      mock.publish.retryTask.mockResolvedValue({ success: true });

      const store = useTaskStore();
      await store.retryTask('t-1');

      expect(mock.publish.retryTask).toHaveBeenCalledWith('t-1');
    });
  });

  describe('retryAllFailed', () => {
    it('retries all failed tasks', async () => {
      mock.publish.retryTask.mockResolvedValue({ success: true });

      const store = useTaskStore();
      store.tasks = [
        makeTask({ id: '1', status: 'failed' }),
        makeTask({ id: '2', status: 'failed' }),
        makeTask({ id: '3', status: 'success' }),
      ];
      await store.retryAllFailed();

      expect(mock.publish.retryTask).toHaveBeenCalledTimes(2);
      expect(mock.publish.retryTask).toHaveBeenCalledWith('1');
      expect(mock.publish.retryTask).toHaveBeenCalledWith('2');
    });
  });

  describe('updateTaskProgress', () => {
    it('updates progress and message for matching task', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1', progress: 0 })];
      store.updateTaskProgress('t-1', 50, 'Uploading...');

      expect(store.tasks[0].progress).toBe(50);
      expect(store.tasks[0].message).toBe('Uploading...');
    });

    it('does nothing for non-existent task', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1', progress: 0 })];
      store.updateTaskProgress('t-999', 50, 'Nope');

      expect(store.tasks[0].progress).toBe(0);
    });
  });

  describe('updateTaskStatus', () => {
    it('updates status for matching task', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1', status: 'pending' })];
      store.updateTaskStatus('t-1', 'success');

      expect(store.tasks[0].status).toBe('success');
    });

    it('merges additional data', () => {
      const store = useTaskStore();
      store.tasks = [makeTask({ id: 't-1', status: 'pending', errorCode: undefined })];
      store.updateTaskStatus('t-1', 'failed', { errorCode: 'TIMEOUT' });

      expect(store.tasks[0].status).toBe('failed');
      expect(store.tasks[0].errorCode).toBe('TIMEOUT');
    });
  });

  describe('listenIpcEvents', () => {
    it('returns unsubscribe function', () => {
      mock.on.onTaskProgress = () => {};
      mock.on.onTaskStatusChange = () => {};

      const store = useTaskStore();
      const unsub = store.listenIpcEvents();

      expect(typeof unsub).toBe('function');
    });
  });
});
