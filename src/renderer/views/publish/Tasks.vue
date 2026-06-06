<template>
  <div class="page-tasks">
    <!-- 发布子导航 -->
    <nav class="page-tasks__tabs">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="page-tasks__tab"
        :class="{ 'page-tasks__tab--active': isActive(item.path) }"
      >
        <el-icon :size="15"><component :is="item.icon" /></el-icon>
        {{ item.label }}
      </router-link>
    </nav>

    <!-- 工具栏：筛选 + 操作 -->
    <div class="page-tasks__toolbar">
      <TaskFilterBar :plans="plans" />
      <div class="page-tasks__toolbar-actions">
        <el-button size="small" @click="handleExport">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
      </div>
    </div>

    <!-- 批量操作栏 -->
    <TaskBatchBar v-if="taskStore.selectedCount > 0" />

    <!-- 统计概览 -->
    <div v-if="taskStore.total > 0" class="page-tasks__stats">
      <div class="page-tasks__stat-chip">
        <span class="page-tasks__stat-label">全部</span>
        <span class="page-tasks__stat-value">{{ taskStore.total }}</span>
      </div>
      <div class="page-tasks__stat-chip page-tasks__stat-chip--pending">
        <span class="page-tasks__stat-dot"></span>
        <span class="page-tasks__stat-value">{{ taskStore.stats.pending }}</span>
        <span class="page-tasks__stat-label">待执行</span>
      </div>
      <div class="page-tasks__stat-chip page-tasks__stat-chip--running">
        <span class="page-tasks__stat-dot"></span>
        <span class="page-tasks__stat-value">{{ taskStore.stats.running }}</span>
        <span class="page-tasks__stat-label">执行中</span>
      </div>
      <div class="page-tasks__stat-chip page-tasks__stat-chip--completed">
        <span class="page-tasks__stat-dot"></span>
        <span class="page-tasks__stat-value">{{ taskStore.stats.completed }}</span>
        <span class="page-tasks__stat-label">已完成</span>
      </div>
      <div class="page-tasks__stat-chip page-tasks__stat-chip--failed">
        <span class="page-tasks__stat-dot"></span>
        <span class="page-tasks__stat-value">{{ taskStore.stats.failed }}</span>
        <span class="page-tasks__stat-label">失败</span>
      </div>
    </div>

    <!-- 列表区域 -->
    <div class="page-tasks__list">
      <TaskTable
        :total="taskStore.total"
        @detail="onShowDetail"
        @execute="onExecuteGroup"
        @delete="onDeleteGroup"
      />

      <!-- 空状态 -->
      <div v-if="!taskStore.loading && taskStore.tasks.length === 0" class="page-tasks__empty">
        <el-empty description="暂无发布任务">
          <el-button type="primary" size="small" @click="$router.push('/publish/video')">
            去发布
          </el-button>
        </el-empty>
      </div>

      <!-- 分页 -->
      <div v-if="taskStore.total > 0" class="page-tasks__pagination">
        <span class="page-tasks__pagination-info">共 {{ taskStore.total }} 条</span>
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="taskStore.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="sizes, prev, pager, next"
          background
          small
        />
      </div>
    </div>

    <TaskDetailDrawer v-model="drawerVisible" :group="selectedGroup" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  List, Calendar, Document, VideoCamera, Download,
} from '@element-plus/icons-vue';
import { useTaskStore } from '@/renderer/stores/task';
import type { GroupedTask } from '@/renderer/stores/task';
import TaskFilterBar from '@/renderer/components/publish/TaskFilterBar.vue';
import TaskTable from '@/renderer/components/publish/TaskTable.vue';
import TaskDetailDrawer from '@/renderer/components/publish/TaskDetailDrawer.vue';
import TaskBatchBar from '@/renderer/components/publish/TaskBatchBar.vue';

const route = useRoute();
const taskStore = useTaskStore();

const navItems = [
  { path: '/publish/tasks', label: '任务列表', icon: List },
  { path: '/publish/drafts', label: '草稿', icon: Document },
  { path: '/publish/video', label: '视频发布', icon: VideoCamera },
];

function isActive(path: string) {
  return route.path === path;
}

const drawerVisible = ref(false);
const selectedGroup = ref<GroupedTask | null>(null);
const currentPage = ref(1);
const pageSize = ref(20);
const plans = ref<{ id: string; name: string }[]>([]);

let unlisten: (() => void) | null = null;

onMounted(async () => {
  await taskStore.fetchTasks();
  unlisten = taskStore.listenIpcEvents();
  await loadPlans();
});

onUnmounted(() => {
  unlisten?.();
});

async function loadPlans() {
  try {
    if (window.matrixflow?.publish?.listPlans) {
      const result = await window.matrixflow.publish.listPlans() as { items: { id: string; name: string }[] };
      if (result?.items) {
        plans.value = result.items;
      }
    }
  } catch {
    plans.value = [];
  }
}

watch(currentPage, () => {
  taskStore.filter.offset = (currentPage.value - 1) * pageSize.value;
  taskStore.fetchTasks();
});

watch(pageSize, () => {
  taskStore.filter.limit = pageSize.value;
  taskStore.filter.offset = 0;
  currentPage.value = 1;
  taskStore.fetchTasks();
});

function onShowDetail(group: GroupedTask) {
  selectedGroup.value = group;
  drawerVisible.value = true;
}

async function onExecuteGroup(group: GroupedTask) {
  const next = group.subTasks.find(t => t.status === 'pending' || t.status === 'failed');
  if (!next) {
    ElMessage.info('没有待执行的任务');
    return;
  }

  try {
    taskStore.updateTaskStatus(next.id, 'running');
    await taskStore.retryTask(next.id);
    ElMessage.success(`发布任务执行完成: ${next.accountName || next.platform}`);
    setTimeout(() => taskStore.fetchTasks(), 1000);
  } catch (error) {
    console.error('执行发布任务失败:', error);
    const message = error instanceof Error ? error.message : '执行发布任务失败';
    ElMessage.error(message);
  }
}

async function onRetry(id: string) {
  try {
    await taskStore.retryTask(id);
    ElMessage.success('重试已提交');
  } catch {
    ElMessage.error('重试失败');
  }
}

async function onCancel(id: string) {
  try {
    await ElMessageBox.confirm('确定取消该任务？', '取消确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    await taskStore.cancelTask(id);
    ElMessage.success('任务已取消');
  } catch {}
}

async function onSkip(id: string) {
  try {
    await taskStore.cancelTask(id);
    ElMessage.success('已跳过');
  } catch {
    ElMessage.error('操作失败');
  }
}

async function onDeleteGroup(group: GroupedTask) {
  try {
    let failedCount = 0;
    for (const sub of group.subTasks) {
      try {
        await taskStore.deleteTask(sub.id);
      } catch {
        failedCount++;
      }
    }
    if (failedCount === 0) {
      ElMessage.success('删除成功');
    } else if (failedCount < group.subTasks.length) {
      ElMessage.warning(`${failedCount} 条任务删除失败（可能正在执行中）`);
    } else {
      ElMessage.error('删除失败');
    }
    await taskStore.fetchTasks();
  } catch {
    ElMessage.error('删除失败');
  }
}

function onPlanClick(planId: string | null) {
  if (planId) {
    // Navigate to plan detail
  }
}

async function handleExport() {
  ElMessage.info('导出功能开发中');
}
</script>

<style scoped>
.page-tasks {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-page);
}

/* ── 子导航 tab 栏 ── */
.page-tasks__tabs {
  display: flex;
  gap: 0;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
  padding: 0 var(--space-6);
}

.page-tasks__tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  text-decoration: none;
  border-bottom: 2px solid transparent;
  transition: color var(--transition-fast), border-color var(--transition-fast);
}

.page-tasks__tab:hover {
  color: var(--color-primary);
}

.page-tasks__tab--active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

/* ── 工具栏 ── */
.page-tasks__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-6);
}

.page-tasks__toolbar-actions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* ── 统计概览 ── */
.page-tasks__stats {
  display: flex;
  gap: var(--space-4);
  padding: 0 var(--space-6) var(--space-3);
}

.page-tasks__stat-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.page-tasks__stat-value {
  font-weight: var(--font-weight-semibold);
  font-size: var(--font-size-lg);
  color: var(--color-text-primary);
}

.page-tasks__stat-label {
  color: var(--color-text-secondary);
}

.page-tasks__stat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.page-tasks__stat-chip--pending .page-tasks__stat-dot {
  background: var(--color-info);
}

.page-tasks__stat-chip--running .page-tasks__stat-dot {
  background: var(--color-warning);
}

.page-tasks__stat-chip--completed .page-tasks__stat-dot {
  background: var(--color-success);
}

.page-tasks__stat-chip--failed .page-tasks__stat-dot {
  background: var(--color-danger);
}

/* ── 列表区域 ── */
.page-tasks__list {
  flex: 1;
  min-height: 0;
  padding: 0 var(--space-6) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

/* ── 空状态 ── */
.page-tasks__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-12) 0;
}

/* ── 分页 ── */
.page-tasks__pagination {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--color-border-light);
  box-shadow: var(--shadow-xs);
}

.page-tasks__pagination-info {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.page-tasks__pagination :deep(.el-pagination) {
  --el-pagination-button-bg-color: var(--color-bg-card);
  --el-pagination-button-color: var(--color-text-secondary);
  --el-pagination-hover-color: var(--color-primary);
}

.page-tasks__pagination :deep(.el-pagination.is-background .el-pager li:not(.is-disabled).is-active) {
  background: var(--color-primary);
}
</style>
