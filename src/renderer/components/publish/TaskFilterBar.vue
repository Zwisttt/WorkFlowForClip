<template>
  <div class="task-filter">
    <el-select v-model="localFilter.status" placeholder="全部状态" clearable multiple collapse-tags
      collapse-tags-limit="1" @change="onFilterChange">
      <el-option label="待执行" value="pending" />
      <el-option label="执行中" value="running" />
      <el-option label="已完成" value="completed" />
      <el-option label="失败" value="failed" />
      <el-option label="已取消" value="cancelled" />
      <el-option label="已跳过" value="skipped" />
    </el-select>

    <el-select v-model="localFilter.platform" placeholder="全部平台" clearable multiple collapse-tags
      collapse-tags-limit="1" @change="onFilterChange">
      <el-option label="抖音" value="douyin" />
      <el-option label="小红书" value="xiaohongshu" />
      <el-option label="B站" value="bilibili" />
      <el-option label="视频号" value="channels" />
      <el-option label="快手" value="kuaishou" />
    </el-select>

    <el-select v-model="localFilter.planId" placeholder="全部计划" clearable @change="onFilterChange">
      <el-option label="独立发布" :value="null" />
      <el-option v-for="plan in plans" :key="plan.id" :label="plan.name" :value="plan.id" />
    </el-select>

    <div class="task-filter__divider"></div>

    <el-date-picker v-model="localFilter.dateFrom" type="date" placeholder="开始日期"
      style="width:130px" format="YYYY-MM-DD" value-format="YYYY-MM-DD" @change="onFilterChange" />
    <span class="task-filter__sep">至</span>
    <el-date-picker v-model="localFilter.dateTo" type="date" placeholder="结束日期"
      style="width:130px" format="YYYY-MM-DD" value-format="YYYY-MM-DD" @change="onFilterChange" />

    <div class="task-filter__divider"></div>

    <el-input v-model="localFilter.search" placeholder="搜索..." clearable style="width:180px"
      @keyup.enter="onFilterChange" @clear="onFilterChange">
      <template #prefix><el-icon><Search /></el-icon></template>
    </el-input>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Search } from '@element-plus/icons-vue';
import { useTaskStore } from '@/renderer/stores/task';
import type { TaskFilter } from '@/renderer/stores/task';

interface Plan {
  id: string;
  name: string;
}

interface Props {
  plans?: Plan[];
}

const props = withDefaults(defineProps<Props>(), {
  plans: () => [],
});

const taskStore = useTaskStore();

const localFilter = ref<TaskFilter>({
  status: [],
  platform: [],
  planId: undefined,
  dateFrom: taskStore.filter.dateFrom,
  dateTo: taskStore.filter.dateTo,
  search: '',
});

watch(
  () => taskStore.filter,
  (newFilter) => {
    localFilter.value.status = newFilter.status || [];
    localFilter.value.platform = newFilter.platform || [];
    localFilter.value.planId = newFilter.planId;
    localFilter.value.dateFrom = newFilter.dateFrom;
    localFilter.value.dateTo = newFilter.dateTo;
    localFilter.value.search = newFilter.search || '';
  },
  { deep: true },
);

function onFilterChange() {
  taskStore.filter.status = localFilter.value.status;
  taskStore.filter.platform = localFilter.value.platform;
  taskStore.filter.planId = localFilter.value.planId;
  taskStore.filter.dateFrom = localFilter.value.dateFrom;
  taskStore.filter.dateTo = localFilter.value.dateTo;
  taskStore.filter.search = localFilter.value.search;
  taskStore.filter.offset = 0;
  taskStore.fetchTasks();
}
</script>

<style scoped>
.task-filter {
  display: flex;
  gap: var(--space-1);
  align-items: center;
  flex-wrap: wrap;
  background: var(--color-bg-card);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border-light);
  padding: var(--space-2) var(--space-3);
  box-shadow: var(--shadow-xs);
}

.task-filter :deep(.el-select) {
  --el-select-input-focus-border-color: var(--color-primary);
}

.task-filter :deep(.el-input__wrapper) {
  border-radius: var(--radius-md);
  box-shadow: none;
  border: 1px solid var(--color-border);
}

.task-filter :deep(.el-input__wrapper:hover) {
  border-color: var(--color-primary);
}

.task-filter :deep(.el-input__wrapper:focus-within) {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 2px var(--color-primary-lighter);
}

.task-filter :deep(.el-input__inner) {
  font-size: var(--font-size-sm);
}

.task-filter__divider {
  width: 1px;
  height: 20px;
  background: var(--color-border);
  margin: 0 var(--space-1);
}

.task-filter__sep {
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
  margin: 0 var(--space-1);
}

.task-filter :deep(.el-date-editor) {
  --el-date-editor-width: 130px;
}

.task-filter :deep(.el-date-editor .el-input__wrapper) {
  border-radius: var(--radius-md);
  box-shadow: none;
  border: 1px solid var(--color-border);
}

.task-filter :deep(.el-date-editor .el-input__wrapper:hover) {
  border-color: var(--color-primary);
}

.task-filter :deep(.el-input__prefix) {
  color: var(--color-text-placeholder);
}
</style>
