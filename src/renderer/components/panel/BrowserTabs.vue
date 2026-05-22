<script setup lang="ts">
import { computed } from 'vue';
import { Close, Monitor, Position } from '@element-plus/icons-vue';

interface Panel {
  id: string;
  accountId: string;
  platform: string;
  nickname: string;
  browser_mode?: 'embedded' | 'external_chrome' | 'external_fingerprint';
}

interface Props {
  panels: Panel[];
  activePanelId: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  select: [panelId: string];
  close: [panelId: string];
  closeAll: [];
}>();

// 平台配置
const platformConfig = {
  douyin: { label: '抖音', color: 'var(--color-plat-douyin)' },
  xiaohongshu: { label: '小红书', color: 'var(--color-plat-xiaohongshu)' },
  wechat: { label: '视频号', color: 'var(--color-plat-wechat)' },
  kuaishou: { label: '快手', color: 'var(--color-plat-kuaishou)' },
};

function getPlatformConfig(platform: string) {
  return platformConfig[platform as keyof typeof platformConfig] || { label: platform, color: 'var(--color-primary)' };
}

function getBrowserIcon(browserMode?: string) {
  return browserMode !== 'embedded' ? Position : Monitor;
}

function handleTabClick(panelId: string) {
  emit('select', panelId);
}

function handleCloseClick(e: Event, panelId: string) {
  e.stopPropagation();
  emit('close', panelId);
}
</script>

<template>
  <div class="browser-tabs">
    <!-- 标签列表 -->
    <div class="browser-tabs__list">
      <div
        v-for="panel in panels"
        :key="panel.id"
        class="browser-tab"
        :class="{
          'browser-tab--active': panel.id === activePanelId,
          'browser-tab--external': panel.browser_mode !== 'embedded',
        }"
        @click="handleTabClick(panel.id)"
      >
        <!-- 平台图标 -->
        <span
          class="browser-tab__platform"
          :style="{ background: getPlatformConfig(panel.platform).color }"
        >
          {{ getPlatformConfig(panel.platform).label.slice(0, 2) }}
        </span>

        <!-- 账号名称 -->
        <span class="browser-tab__name">{{ panel.nickname }}</span>

        <!-- 外部浏览器标识 -->
        <el-icon
          v-if="panel.browser_mode !== 'embedded'"
          class="browser-tab__external-icon"
          :size="12"
        >
          <Position />
        </el-icon>

        <!-- 关闭按钮 -->
        <button
          class="browser-tab__close"
          @click="handleCloseClick($event, panel.id)"
        >
          <el-icon :size="12"><Close /></el-icon>
        </button>
      </div>
    </div>

    <!-- 关闭全部按钮 -->
    <div v-if="panels.length > 1" class="browser-tabs__actions">
      <el-button
        type="primary"
        text
        size="small"
        @click="emit('closeAll')"
      >
        关闭全部
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.browser-tabs {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border);
}

.browser-tabs__list {
  display: flex;
  gap: var(--space-2);
  flex: 1;
  overflow-x: auto;
  padding: var(--space-1) 0;
}

/* 隐藏滚动条但保留滚动功能 */
.browser-tabs__list::-webkit-scrollbar {
  height: 4px;
}

.browser-tabs__list::-webkit-scrollbar-track {
  background: transparent;
}

.browser-tabs__list::-webkit-scrollbar-thumb {
  background: var(--color-border);
  border-radius: var(--radius-full);
}

/* ── 标签项 ── */
.browser-tab {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background: var(--color-bg-page);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  flex-shrink: 0;
}

.browser-tab:hover {
  border-color: var(--color-primary);
  background: var(--color-bg-card);
}

.browser-tab--active {
  background: var(--color-primary-lighter);
  border-color: var(--color-primary);
  box-shadow: var(--shadow-sm);
}

.browser-tab--external {
  background: var(--color-accent-light);
  border-color: var(--color-accent);
}

/* ── 平台标识 ── */
.browser-tab__platform {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-bold);
  color: white;
  padding: 2px 4px;
  border-radius: var(--radius-xs);
  line-height: 1;
}

.browser-tab__name {
  font-size: var(--font-size-sm);
  color: var(--color-text-regular);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.browser-tab--active .browser-tab__name {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}

/* ── 外部浏览器图标 ── */
.browser-tab__external-icon {
  color: var(--color-accent);
}

/* ── 关闭按钮 ── */
.browser-tab__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--color-text-placeholder);
  transition: all var(--transition-fast);
}

.browser-tab__close:hover {
  background: var(--color-danger-light);
  color: var(--color-danger);
}

/* ── 操作区 ── */
.browser-tabs__actions {
  flex-shrink: 0;
}
</style>
