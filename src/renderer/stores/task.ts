import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export type TaskStatus = 'pending' | 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled' | 'skipped';

export interface TaskFilter {
  status?: string[];
  platform?: string[];
  planId?: string | null;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface TaskListResult {
  items: Task[];
  total: number;
}

export interface Task {
  id: string;
  type: 'publish' | 'check_cookie' | 'login';
  accountId: string;
  accountName?: string;
  contentId?: string;
  contentTitle?: string;
  platform: string;
  status: TaskStatus;
  progress: number;
  message?: string;
  errorCode?: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  title?: string;
  description?: string;
  tags?: string[];
  coverUrl?: string;
  planName?: string;
  source?: string;
}

export interface AccountInfo {
  accountId: string;
  accountName: string;
  platform: string;
}

export interface GroupedTask {
  contentId: string;
  title: string;
  coverUrl?: string;
  description?: string;
  tags?: string[];
  accounts: AccountInfo[];
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  subTasks: Task[];
}

const STATUS_PRIORITY: Record<TaskStatus, number> = {
  failed: 0,
  running: 1,
  cancelled: 2,
  pending: 3,
  scheduled: 3,
  completed: 4,
  skipped: 5,
};

export const useTaskStore = defineStore('task', () => {
  const tasks = ref<Task[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const selectedIds = ref<Set<string>>(new Set());
  const filter = ref<TaskFilter>({
    status: [],
    platform: [],
    planId: undefined,
    dateFrom: undefined,
    dateTo: undefined,
    limit: 20,
    offset: 0,
  });

  const runningTasks = computed(() => tasks.value.filter((t) => t.status === 'running'));
  const failedTasks = computed(() => tasks.value.filter((t) => t.status === 'failed'));
  const hasFailedTasks = computed(() => failedTasks.value.length > 0);
  const selectedCount = computed(() => selectedIds.value.size);
  const allSelectedOnPage = computed(() =>
    tasks.value.length > 0 && tasks.value.every((t) => selectedIds.value.has(t.id))
  );

  const stats = computed(() => ({
    total: total.value,
    pending: tasks.value.filter((t) => t.status === 'pending').length,
    running: runningTasks.value.length,
    completed: tasks.value.filter((t) => t.status === 'completed').length,
    failed: failedTasks.value.length,
    skipped: tasks.value.filter((t) => t.status === 'skipped').length,
  }));

  const groupedTasks = computed<GroupedTask[]>(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks.value) {
      const key = t.contentId || t.id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }

    const result: GroupedTask[] = [];
    for (const [, group] of map) {
      const first = group[0];
      const accounts: AccountInfo[] = [];
      const seen = new Set<string>();
      let worstStatus: TaskStatus = 'completed';

      for (const t of group) {
        const key = `${t.platform}:${t.accountId}`;
        if (!seen.has(key)) {
          seen.add(key);
          accounts.push({
            accountId: t.accountId,
            accountName: t.accountName || '',
            platform: t.platform,
          });
        }
        if (STATUS_PRIORITY[t.status] < STATUS_PRIORITY[worstStatus]) {
          worstStatus = t.status;
        }
      }

      const latest = group.reduce((max, t) =>
        String(t.updatedAt) > String(max) ? t.updatedAt : max,
        first.updatedAt,
      );

      result.push({
        contentId: first.contentId || first.id,
        title: first.title || first.contentTitle || '无标题',
        coverUrl: first.coverUrl || undefined,
        description: first.description,
        tags: first.tags,
        accounts,
        status: worstStatus,
        createdAt: first.createdAt,
        updatedAt: latest,
        subTasks: group,
      });
    }

    result.sort((a, b) => {
      const as = String(a.createdAt || '');
      const bs = String(b.createdAt || '');
      return bs.localeCompare(as);
    });
    return result;
  });

  async function fetchTasks(f?: TaskFilter) {
    loading.value = true;
    try {
      if (!window.matrixflow?.publish?.listTasks) {
        console.warn('[taskStore] listTasks API 不可用');
        return;
      }
      const f2 = f || JSON.parse(JSON.stringify(filter.value));
      const raw = await window.matrixflow.publish.listTasks(f2);
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const result = raw as unknown as TaskListResult;
        tasks.value = result.items || [];
        total.value = result.total || 0;
      }
    } catch (e) {
      console.error('[taskStore] fetchTasks 失败:', e);
      tasks.value = [];
      total.value = 0;
    } finally {
      loading.value = false;
    }
  }

  async function createTask(data: Partial<Task>) {
    if (!window.matrixflow) return;
    return window.matrixflow.publish.createTask(data);
  }

  async function cancelTask(id: string) {
    if (!window.matrixflow) return;
    await window.matrixflow.publish.cancelTask(id);
    const task = tasks.value.find((t) => t.id === id);
    if (task) task.status = 'cancelled';
  }

  async function retryTask(id: string) {
    if (!window.matrixflow) return;
    const result = await window.matrixflow.publish.retryTask(id);
    const payload = result?.data ?? result;
    if (result?.success === false || payload?.success === false) {
      throw new Error(result?.message || payload?.error || '发布任务执行失败');
    }
    return result;
  }

  async function retryAllFailed() {
    const ids = failedTasks.value.map((t) => t.id);
    for (const id of ids) {
      await retryTask(id);
    }
  }

  function updateTaskProgress(taskId: string, progress: number, message?: string) {
    const task = tasks.value.find((t) => t.id === taskId);
    if (task) {
      task.progress = progress;
      if (message) task.message = message;
    }
  }

  function updateTaskStatus(taskId: string, status: TaskStatus, data?: Partial<Task>) {
    const task = tasks.value.find((t) => t.id === taskId);
    if (task) {
      task.status = status;
      task.updatedAt = new Date().toISOString();
      if (data) {
        Object.assign(task, data);
      }
    }
  }

  function toggleSelectAll() {
    if (allSelectedOnPage.value) {
      selectedIds.value.clear();
    } else {
      tasks.value.forEach((t) => selectedIds.value.add(t.id));
    }
  }

  function toggleSelect(taskId: string) {
    if (selectedIds.value.has(taskId)) {
      selectedIds.value.delete(taskId);
    } else {
      selectedIds.value.add(taskId);
    }
  }

  function clearSelection() {
    selectedIds.value.clear();
  }

  async function batchRetry() {
    if (!window.matrixflow) return;
    const ids = [...selectedIds.value];
    return window.matrixflow.publish.batchRetry(ids);
  }

  async function batchCancel() {
    if (!window.matrixflow) return;
    const ids = [...selectedIds.value];
    await window.matrixflow.publish.batchCancel(ids);
    clearSelection();
  }

  /** 监听主进程推送的任务事件 */
  function listenIpcEvents(): () => void {
    if (!window.matrixflow?.onTaskProgress) return () => {};

    const off1 = window.matrixflow.onTaskProgress((taskId: string, progress: number, message?: string) => {
      updateTaskProgress(taskId, progress, message);
    });

    const off2 = window.matrixflow.onTaskStatusChange?.((taskId: string, status: string, data?: Partial<Task>) => {
      updateTaskStatus(taskId, status as TaskStatus, data);
    });

    return () => {
      off1();
      off2?.();
    };
  }

  return {
    tasks, total, loading, selectedIds, filter, selectedCount, allSelectedOnPage,
    groupedTasks, runningTasks, failedTasks, hasFailedTasks, stats,
    fetchTasks, createTask, cancelTask, retryTask, retryAllFailed,
    batchRetry, batchCancel,
    toggleSelectAll, toggleSelect, clearSelection,
    updateTaskProgress, updateTaskStatus, listenIpcEvents,
  };
});
