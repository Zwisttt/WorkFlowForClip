<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import {
  Refresh,
  Plus,
  Search,
  ArrowDown,
  Monitor,
  Grid,
  Position,
} from '@element-plus/icons-vue';

interface Account {
  id: string;
  platform: string;
  nickname?: string;
  avatar?: string;
  status?: 'online' | 'offline' | 'expired';
  browser_mode?: 'embedded' | 'external_chrome' | 'external_fingerprint';
  cookieValid?: boolean;
}

interface Props {
  accounts: Account[];
  activePanelIds: string[];
  loading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
});

const emit = defineEmits<{
  refresh: [];
  addAccount: [];
  selectAccount: [accountId: string];
}>();

// 视图模式：按平台 / 按分组
const viewMode = ref<'platform' | 'group'>('platform');

// 搜索关键词
const searchQuery = ref('');

// 展开状态
const expandedPlatforms = ref<Set<string>>(new Set(['douyin', 'xiaohongshu', 'wechat', 'kuaishou']));

// 平台配置
const platformConfig = {
  douyin: { label: '抖音', color: 'var(--color-plat-douyin)' },
  xiaohongshu: { label: '小红书', color: 'var(--color-plat-xiaohongshu)' },
  wechat: { label: '视频号', color: 'var(--color-plat-wechat)' },
  kuaishou: { label: '快手', color: 'var(--color-plat-kuaishou)' },
};

// 按平台分组
const groupedByPlatform = computed(() => {
  const groups: Record<string, Account[]> = {
    douyin: [],
    xiaohongshu: [],
    wechat: [],
    kuaishou: [],
  };

  props.accounts.forEach((account) => {
    if (groups[account.platform]) {
      groups[account.platform].push(account);
    }
  });

  // 应用搜索过滤
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase();
    Object.keys(groups).forEach((platform) => {
      groups[platform] = groups[platform].filter(
        (a) => a.nickname?.toLowerCase().includes(query) || a.id.toLowerCase().includes(query)
      );
    });
  }

  return groups;
});

// 获取平台配置
function getPlatformConfig(platform: string) {
  return platformConfig[platform as keyof typeof platformConfig] || { label: platform, color: 'var(--color-primary)' };
}

// 切换平台展开状态
function togglePlatform(platform: string) {
  if (expandedPlatforms.value.has(platform)) {
    expandedPlatforms.value.delete(platform);
  } else {
    expandedPlatforms.value.add(platform);
  }
}

// 判断账号是否已在面板中打开
function isOpened(accountId: string): boolean {
  return props.activePanelIds.includes(accountId);
}

// 获取浏览器图标
function getBrowserIcon(browserMode?: string) {
  switch (browserMode) {
    case 'external_chrome':
    case 'external_fingerprint':
      return Position;
    default:
      return Monitor;
  }
}

// 获取状态颜色
function getStatusColor(status?: string): string {
  switch (status) {
    case 'online':
      return 'var(--color-success)';
    case 'expired':
      return 'var(--color-danger)';
    default:
      return 'var(--color-text-placeholder)';
  }
}

// 处理账号点击
function handleAccountClick(account: Account) {
  emit('selectAccount', account.id);
}
</script>

<template>
  <aside class="panel-sidebar">
    <!-- 顶部标题栏 -->
    <header class="panel-sidebar__header">
      <h3 class="panel-sidebar__title">多开面板</h3>
      <div class="panel-sidebar__actions">
        <el-tooltip content="刷新账号列表" placement="top">
          <el-button
            :icon="Refresh"
            circle
            size="small"
            :loading="loading"
            @click="emit('refresh')"
          />
        </el-tooltip>
        <el-tooltip content="添加账号" placement="top">
          <el-button
            :icon="Plus"
            circle
            size="small"
            type="primary"
            @click="emit('addAccount')"
          />
        </el-tooltip>
      </div>
    </header>

    <!-- 视图切换 + 搜索 -->
    <div class="panel-sidebar__toolbar">
      <el-radio-group v-model="viewMode" size="small" class="view-mode-toggle">
        <el-radio-button value="platform">按平台</el-radio-button>
        <el-radio-button value="group">按分组</el-radio-button>
      </el-radio-group>

      <el-input
        v-model="searchQuery"
        :prefix-icon="Search"
        placeholder="搜索账号..."
        clearable
        size="small"
        class="search-input"
      />
    </div>

    <!-- 账号列表 -->
    <div class="panel-sidebar__content">
      <Loading v-if="loading" />

      <Empty
        v-else-if="accounts.length === 0"
        text="暂无账号"
        action-label="添加账号"
        @action="emit('addAccount')"
      />

      <template v-else>
        <!-- 按平台分组 -->
        <template v-if="viewMode === 'platform'">
          <div
            v-for="(platformAccounts, platform) in groupedByPlatform"
            :key="platform"
            class="platform-group"
          >
            <!-- 平台标题 -->
            <div
              class="platform-group__header"
              @click="togglePlatform(platform)"
            >
              <div class="platform-group__left">
                <span
                  class="platform-dot"
                  :style="{ background: getPlatformConfig(platform).color }"
                />
                <span class="platform-name">{{ getPlatformConfig(platform).label }}</span>
                <span class="platform-count">({{ platformAccounts.length }})</span>
              </div>
              <el-icon
                class="platform-arrow"
                :class="{ 'platform-arrow--expanded': expandedPlatforms.has(platform) }"
              >
                <ArrowDown />
              </el-icon>
            </div>

            <!-- 账号列表 -->
            <Transition name="collapse">
              <div
                v-if="expandedPlatforms.has(platform) && platformAccounts.length > 0"
                class="platform-group__accounts"
              >
                <div
                  v-for="account in platformAccounts"
                  :key="account.id"
                  class="account-item"
                  :class="{
                    'account-item--active': isOpened(account.id),
                    'account-item--external': account.browser_mode !== 'embedded',
                  }"
                  @click="handleAccountClick(account)"
                >
                  <!-- 头像 -->
                  <div class="account-item__avatar">
                    <el-avatar :size="32" :src="account.avatar">
                      {{ account.nickname?.charAt(0) || '?' }}
                    </el-avatar>
                    <!-- 平台色边框 -->
                    <span
                      class="avatar-border"
                      :style="{ borderColor: getPlatformConfig(platform).color }"
                    />
                  </div>

                  <!-- 账号信息 -->
                  <div class="account-item__info">
                    <div class="account-item__name">{{ account.nickname || '未命名' }}</div>
                    <div class="account-item__meta">
                      <!-- 状态点 -->
                      <span
                        class="status-dot"
                        :style="{ background: getStatusColor(account.status) }"
                      />
                      <span class="status-text">
                        {{ account.status === 'online' ? '在线' : account.status === 'expired' ? '已过期' : '离线' }}
                      </span>
                    </div>
                  </div>

                  <!-- 浏览器类型图标 -->
                  <div class="account-item__browser">
                    <el-icon v-if="account.browser_mode !== 'embedded'" :size="14">
                      <component :is="getBrowserIcon(account.browser_mode)" />
                    </el-icon>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- 空状态提示 -->
            <Transition name="collapse">
              <div
                v-if="expandedPlatforms.has(platform) && platformAccounts.length === 0 && searchQuery"
                class="platform-group__empty"
              >
                无匹配账号
              </div>
            </Transition>
          </div>
        </template>

        <!-- 按分组（暂未实现） -->
        <div v-else class="group-view-placeholder">
          <el-icon :size="32"><Grid /></el-icon>
          <p>分组视图开发中</p>
        </div>
      </template>
    </div>
  </aside>
</template>

<script lang="ts">
import Loading from '@/renderer/components/common/Loading.vue';
import Empty from '@/renderer/components/common/Empty.vue';

export default {
  components: {
    Loading,
    Empty,
  },
};
</script>

<style scoped>
.panel-sidebar {
  width: 220px;
  min-width: 220px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-card);
  border-right: 1px solid var(--color-border);
}

/* ── 顶部标题栏 ── */
.panel-sidebar__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border-light);
}

.panel-sidebar__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.panel-sidebar__actions {
  display: flex;
  gap: var(--space-2);
}

/* ── 工具栏 ── */
.panel-sidebar__toolbar {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-bottom: 1px solid var(--color-border-light);
}

.view-mode-toggle {
  width: 100%;
}

.view-mode-toggle :deep(.el-radio-button__inner) {
  width: 100%;
}

.search-input {
  width: 100%;
}

/* ── 内容区 ── */
.panel-sidebar__content {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-2) 0;
}

/* ── 平台分组 ── */
.platform-group {
  margin-bottom: var(--space-1);
}

.platform-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  transition: background var(--transition-fast);
}

.platform-group__header:hover {
  background: var(--color-bg-sidebar-hover);
}

.platform-group__left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.platform-dot {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.platform-name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-regular);
}

.platform-count {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.platform-arrow {
  font-size: 12px;
  color: var(--color-text-placeholder);
  transition: transform var(--transition-fast);
}

.platform-arrow--expanded {
  transform: rotate(180deg);
}

/* ── 账号列表 ── */
.platform-group__accounts {
  padding: 0 var(--space-2);
}

.account-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  margin: var(--space-1) 0;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--transition-fast);
  position: relative;
}

.account-item:hover {
  background: var(--color-bg-sidebar-hover);
}

.account-item--active {
  background: var(--color-primary-lighter);
}

.account-item--active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 24px;
  background: var(--color-primary);
  border-radius: 0 2px 2px 0;
}

.account-item--external {
  background: var(--color-accent-light);
}

.account-item--external:hover {
  background: rgba(14, 165, 233, 0.15);
}

/* ── 头像 ── */
.account-item__avatar {
  position: relative;
  flex-shrink: 0;
}

.avatar-border {
  position: absolute;
  inset: -2px;
  border: 2px solid transparent;
  border-radius: var(--radius-full);
  pointer-events: none;
}

/* ── 账号信息 ── */
.account-item__info {
  flex: 1;
  min-width: 0;
}

.account-item__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.account-item__meta {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-top: 2px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

.status-text {
  font-size: var(--font-size-2xs);
  color: var(--color-text-secondary);
}

/* ── 浏览器图标 ── */
.account-item__browser {
  color: var(--color-accent);
  flex-shrink: 0;
}

/* ── 空状态 ── */
.platform-group__empty {
  padding: var(--space-4);
  text-align: center;
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
}

.group-view-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  color: var(--color-text-placeholder);
  gap: var(--space-3);
}

/* ── 折叠动画 ── */
.collapse-enter-active,
.collapse-leave-active {
  transition: all var(--transition-base);
  overflow: hidden;
}

.collapse-enter-from,
.collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.collapse-enter-to,
.collapse-leave-from {
  opacity: 1;
  max-height: 1000px;
}
</style>
