<template>
  <aside class="filter-panel">
    <!-- 平台筛选 -->
    <div class="filter-panel__section">
      <h4 class="filter-panel__title">平台</h4>
      <ul class="filter-panel__tree">
        <li
          v-for="item in platformOptions"
          :key="item.value"
          class="filter-panel__item"
          :class="{ 'filter-panel__item--active': selectedPlatform === item.value }"
          @click="handlePlatformSelect(item.value)"
        >
          <span class="filter-panel__dot" :style="{ background: item.color }" />
          <span class="filter-panel__label">{{ item.label }}</span>
          <span v-if="item.count !== undefined && item.count > 0" class="filter-panel__count">{{ item.count }}</span>
        </li>
      </ul>
    </div>

    <!-- 分组筛选 -->
    <div class="filter-panel__section">
      <h4 class="filter-panel__title">分组</h4>
      <ul class="filter-panel__tree">
        <li
          class="filter-panel__item"
          :class="{ 'filter-panel__item--active': selectedGroup === '' }"
          @click="handleGroupSelect('')"
        >
          <span class="filter-panel__dot filter-panel__dot--all" />
          <span class="filter-panel__label">全部</span>
        </li>
        <li
          v-for="group in groups"
          :key="group.id"
          class="filter-panel__item"
          :class="{ 'filter-panel__item--active': selectedGroup === group.id }"
          @click="handleGroupSelect(group.id)"
        >
          <span class="filter-panel__dot" :style="{ background: group.color }" />
          <span class="filter-panel__label">{{ group.name }}</span>
          <span class="filter-panel__count">{{ group.accountIds?.length || 0 }}</span>
        </li>
      </ul>
    </div>

    <!-- 状态筛选 -->
    <div class="filter-panel__section">
      <h4 class="filter-panel__title">状态</h4>
      <ul class="filter-panel__tree">
        <li
          v-for="item in statusOptions"
          :key="item.value"
          class="filter-panel__item"
          :class="{ 'filter-panel__item--active': selectedStatus === item.value }"
          @click="handleStatusSelect(item.value)"
        >
          <span class="filter-panel__status-dot" :class="`filter-panel__status-dot--${item.value}`" />
          <span class="filter-panel__label">{{ item.label }}</span>
        </li>
      </ul>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { Group } from '@/renderer/stores/group';

const props = defineProps<{
  groups: Group[];
  platformCounts?: Record<string, number>;
}>();

const emit = defineEmits<{
  'filter-platform': [value: string];
  'filter-group': [value: string];
  'filter-status': [value: string];
}>();

const selectedPlatform = ref('');
const selectedGroup = ref('');
const selectedStatus = ref('');

interface PlatformOption {
  value: string;
  label: string;
  color: string;
  count?: number;
}

const platformOptions = computed<PlatformOption[]>(() => [
  { value: '', label: '全部', color: 'var(--color-text-secondary)', count: props.platformCounts ? Object.values(props.platformCounts).reduce((a, b) => a + b, 0) : undefined },
  { value: 'douyin', label: '抖音', color: 'var(--color-plat-douyin)', count: props.platformCounts?.douyin },
  { value: 'xiaohongshu', label: '小红书', color: 'var(--color-plat-xiaohongshu)', count: props.platformCounts?.xiaohongshu },
  { value: 'channels', label: '视频号', color: 'var(--color-plat-wechat)', count: props.platformCounts?.channels },
  { value: 'kuaishou', label: '快手', color: 'var(--color-plat-kuaishou)', count: props.platformCounts?.kuaishou },
]);

const statusOptions = [
  { value: '', label: '全部' },
  { value: 'online', label: '在线' },
  { value: 'offline', label: '离线' },
  { value: 'expired', label: '已过期' },
];

function handlePlatformSelect(value: string) {
  selectedPlatform.value = value;
  emit('filter-platform', value);
}

function handleGroupSelect(value: string) {
  selectedGroup.value = value;
  emit('filter-group', value);
}

function handleStatusSelect(value: string) {
  selectedStatus.value = value;
  emit('filter-status', value);
}
</script>

<style scoped>
.filter-panel {
  width: 240px;
  min-width: 240px;
  height: 100%;
  background: var(--color-bg-card);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.filter-panel__section {
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border-light);
}

.filter-panel__section:last-child {
  border-bottom: none;
}

.filter-panel__title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 var(--space-2) 0;
}

.filter-panel__tree {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.filter-panel__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-2);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.filter-panel__item:hover {
  background: var(--color-bg-page);
}

.filter-panel__item--active {
  background: var(--color-primary-lighter);
  color: var(--color-primary);
}

.filter-panel__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.filter-panel__dot--all {
  background: var(--color-text-placeholder);
}

.filter-panel__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.filter-panel__status-dot--online {
  background: var(--color-success);
  box-shadow: 0 0 4px var(--color-success);
}

.filter-panel__status-dot--offline {
  background: var(--color-text-placeholder);
}

.filter-panel__status-dot--expired {
  background: var(--color-danger);
}

.filter-panel__label {
  flex: 1;
  font-size: var(--font-size-sm);
  color: var(--color-text-regular);
}

.filter-panel__item--active .filter-panel__label {
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.filter-panel__count {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  background: var(--color-bg-page);
  padding: 2px 6px;
  border-radius: var(--radius-full);
}

.filter-panel__item--active .filter-panel__count {
  background: var(--color-primary);
  color: white;
}
</style>