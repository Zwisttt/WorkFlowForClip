<template>
  <div class="page-accounts">
    <!-- 顶部 Tab 切换 -->
    <el-tabs v-model="activeTab" class="page-accounts__tabs">
      <el-tab-pane label="账号管理" name="accounts">
        <template #label>
          <span class="page-accounts__tab-label">
            <el-icon><User /></el-icon>
            账号管理
          </span>
        </template>
      </el-tab-pane>
      <el-tab-pane label="分组管理" name="groups">
        <template #label>
          <span class="page-accounts__tab-label">
            <el-icon><Grid /></el-icon>
            分组管理
          </span>
        </template>
      </el-tab-pane>
    </el-tabs>

    <!-- 账号管理内容 -->
    <div v-if="activeTab === 'accounts'" class="page-accounts__content">
      <!-- 嵌套左右分栏 -->
      <div class="page-accounts__split">
        <!-- 左侧筛选面板 -->
        <AccountFilterPanel
          :groups="groupStore.groups"
          @filter-platform="handlePlatformFilter"
          @filter-group="handleGroupFilter"
          @filter-status="handleStatusFilter"
        />

        <!-- 右侧内容区 -->
        <div class="page-accounts__main">
          <!-- 多维度筛选工具栏 -->
          <div class="page-accounts__toolbar">
            <div class="page-accounts__filter-bar">
              <el-radio-group v-model="statusFilter" size="small" class="status-filter">
                <el-radio-button value="">全部</el-radio-button>
                <el-radio-button value="online">在线</el-radio-button>
                <el-radio-button value="offline">离线</el-radio-button>
                <el-radio-button value="expired">已过期</el-radio-button>
              </el-radio-group>

              <el-input
                v-model="searchQuery"
                placeholder="搜索账号名称..."
                prefix-icon="Search"
                clearable
                size="small"
                class="search-input"
              />
            </div>

            <div class="page-accounts__toolbar-actions">
              <!-- 批量操作栏 -->
              <transition name="batch-slide">
                <div v-if="selectedIds.length > 0" class="page-accounts__batch">
                  <span class="page-accounts__batch-count">已选 {{ selectedIds.length }} 项</span>
                  <el-select
                    v-model="batchGroupId"
                    placeholder="移入分组"
                    size="small"
                    clearable
                    @change="handleBatchGroup"
                  >
                    <el-option
                      v-for="g in groupStore.groups"
                      :key="g.id"
                      :label="g.name"
                      :value="g.id"
                    />
                  </el-select>
                  <el-popconfirm title="确定删除选中的账号？" @confirm="handleBatchDelete">
                    <template #reference>
                      <el-button type="danger" size="small">批量删除</el-button>
                    </template>
                  </el-popconfirm>
                  <el-button size="small" @click="selectedIds = []">取消选择</el-button>
                </div>
              </transition>

              <!-- 视图切换 -->
              <div class="view-toggle">
                <el-button
                  text
                  size="small"
                  :type="viewMode === 'grid' ? 'primary' : ''"
                  @click="viewMode = 'grid'"
                >
                  <el-icon><Grid /></el-icon>
                </el-button>
                <el-button
                  text
                  size="small"
                  :type="viewMode === 'list' ? 'primary' : ''"
                  @click="viewMode = 'list'"
                >
                  <el-icon><List /></el-icon>
                </el-button>
              </div>

              <!-- 添加账号按钮 -->
              <el-button type="primary" size="small" @click="bindDialogVisible = true">
                <el-icon><Plus /></el-icon>
                添加账号
              </el-button>
            </div>
          </div>

          <!-- 账号列表区域 -->
          <div class="page-accounts__list-area">
            <Loading v-if="accountStore.loading" />
            <Empty
              v-else-if="filteredAccounts.length === 0"
              text="暂无匹配的账号"
              action-label="添加账号"
              @action="bindDialogVisible = true"
            />
            <template v-else>
              <!-- 网格视图 -->
              <div v-if="viewMode === 'grid'" class="page-accounts__grid">
                <AccountCard
                  v-for="account in filteredAccounts"
                  :key="account.id"
                  :account="account"
                  :selected="selectedIds.includes(account.id)"
                  :groups="groupStore.groups"
                  @toggle-select="toggleSelect"
                  @detail="handleDetail"
                  @validate="handleCheckCookie"
                  @login="handleLogin"
                  @delete="handleDelete"
                />
              </div>

              <!-- 列表视图 -->
              <el-table
                v-else
                :data="filteredAccounts"
                class="page-accounts__table"
                @selection-change="handleTableSelection"
              >
                <el-table-column type="selection" width="40" />
                <el-table-column label="账号" min-width="180">
                  <template #default="{ row }">
                    <div class="account-table-cell">
                      <el-avatar :size="32" :src="row.avatar">
                        {{ row.nickname?.charAt(0) || '?' }}
                      </el-avatar>
                      <div class="account-table-cell__info">
                        <span class="account-table-cell__name">{{ row.nickname }}</span>
                        <el-tag :type="getPlatformTagType(row.platform)" size="small" effect="plain">
                          {{ getPlatformLabel(row.platform) }}
                        </el-tag>
                      </div>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="状态" width="120">
                  <template #default="{ row }">
                    <div class="account-table-status">
                      <span class="account-table-status__dot" :class="`account-table-status__dot--${row.status}`" />
                      <span>{{ getStatusLabel(row.status) }}</span>
                      <el-tag :type="row.cookieValid ? 'success' : 'danger'" size="small" round>
                        Cookie{{ row.cookieValid ? '有效' : '失效' }}
                      </el-tag>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="分组" width="140">
                  <template #default="{ row }">
                    <span v-if="getGroupName(row.groupId)" class="account-table-group">
                      {{ getGroupName(row.groupId) }}
                    </span>
                    <span v-else class="account-table-group--empty">未分组</span>
                  </template>
                </el-table-column>
                <el-table-column label="最后登录" width="160">
                  <template #default="{ row }">
                    <span class="account-table-time">{{ row.lastLogin || '未登录' }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="160" fixed="right">
                  <template #default="{ row }">
                    <div class="account-table-actions">
                      <el-button text size="small" type="primary" @click="handleDetail(row.id)">设置</el-button>
                      <el-popconfirm title="确定删除该账号？" @confirm="handleDelete(row.id)">
                        <template #reference>
                          <el-button text size="small" type="danger">删除</el-button>
                        </template>
                      </el-popconfirm>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 分组管理 -->
    <div v-if="activeTab === 'groups'" class="page-accounts__groups">
      <GroupsTab />
    </div>

    <!-- 绑定账号弹窗 -->
    <BindAccountDialog
      v-model="bindDialogVisible"
      @success="handleRefresh"
    />

    <!-- 账号详情弹窗 -->
    <AccountDetailDialog
      v-model="detailDialogVisible"
      :account="selectedAccount"
      :groups="groupStore.groups"
      @changed="handleRefresh"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { User, Grid, List, Plus, Rank } from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAccountStore } from '@/renderer/stores/account';
import { useGroupStore } from '@/renderer/stores/group';
import type { Account } from '@/renderer/stores/account';
import Loading from '@/renderer/components/common/Loading.vue';
import Empty from '@/renderer/components/common/Empty.vue';
import AccountCard from '@/renderer/components/account/AccountCard.vue';
import AccountFilterPanel from '@/renderer/components/account/AccountFilterPanel.vue';
import BindAccountDialog from '@/renderer/components/account/BindAccountDialog.vue';
import AccountDetailDialog from '@/renderer/components/account/AccountDetailDialog.vue';
import GroupsTab from '@/renderer/components/group/GroupsTab.vue';

const accountStore = useAccountStore();
const groupStore = useGroupStore();

// Tab 状态
const activeTab = ref('accounts');

// 筛选状态
const platformFilter = ref('');
const groupFilter = ref('');
const statusFilter = ref('');
const searchQuery = ref('');
const viewMode = ref<'grid' | 'list'>('grid');

// 弹窗状态
const bindDialogVisible = ref(false);
const detailDialogVisible = ref(false);
const selectedAccount = ref<Account | null>(null);
const selectedIds = ref<string[]>([]);
const batchGroupId = ref('');

// 筛选后的账号列表
const filteredAccounts = computed(() => {
  let list = accountStore.accounts;

  if (platformFilter.value) {
    list = list.filter((a) => a.platform === platformFilter.value);
  }
  if (groupFilter.value) {
    list = list.filter((a) => a.groupId === groupFilter.value);
  }
  if (statusFilter.value) {
    list = list.filter((a) => a.status === statusFilter.value);
  }
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    list = list.filter((a) => a.nickname.toLowerCase().includes(q));
  }

  return list;
});

// 平台映射
const platformMap: Record<string, string> = {
  douyin: '抖音',
  xiaohongshu: '小红书',
  channels: '视频号',
  kuaishou: '快手',
  bilibili: 'B站',
};

const platformTagTypeMap: Record<string, string> = {
  douyin: '',
  xiaohongshu: 'danger',
  channels: 'success',
  kuaishou: 'warning',
  bilibili: 'primary',
};

function getPlatformLabel(platform: string) {
  return platformMap[platform] || platform;
}

function getPlatformTagType(platform: string) {
  return platformTagTypeMap[platform] || 'info';
}

function getStatusLabel(status: string) {
  const map: Record<string, string> = { online: '在线', offline: '离线', expired: '已过期' };
  return map[status] || status;
}

function getGroupName(groupId?: string) {
  if (!groupId) return '';
  const group = groupStore.groups.find((g) => g.id === groupId);
  return group?.name || '';
}

onMounted(() => {
  accountStore.fetchAccounts();
  groupStore.fetchGroups();
});

function handleRefresh() {
  accountStore.fetchAccounts();
}

function handlePlatformFilter(value: string) {
  platformFilter.value = value;
}

function handleGroupFilter(value: string) {
  groupFilter.value = value;
}

function handleStatusFilter(value: string) {
  statusFilter.value = value;
}

function handleDetail(id: string) {
  selectedAccount.value = accountStore.accounts.find((a) => a.id === id) || null;
  detailDialogVisible.value = true;
}

function toggleSelect(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx >= 0) {
    selectedIds.value.splice(idx, 1);
  } else {
    selectedIds.value.push(id);
  }
}

function handleTableSelection(rows: Account[]) {
  selectedIds.value = rows.map((r) => r.id);
}

async function handleLogin(id: string) {
  try {
    await accountStore.loginAccount(id);
    ElMessage.success('登录请求已发送');
  } catch {
    ElMessage.error('登录失败');
  }
}

async function handleCheckCookie(id: string) {
  try {
    const valid = await accountStore.checkCookie(id);
    ElMessage(valid ? 'Cookie 有效' : 'Cookie 已失效，请重新登录');
  } catch {
    ElMessage.error('检测失败');
  }
}

async function handleDelete(id: string) {
  await accountStore.deleteAccount(id);
  selectedIds.value = selectedIds.value.filter((sid) => sid !== id);
  ElMessage.success('已删除');
}

function handleBatchGroup(groupId: string) {
  if (!groupId) return;
  // 批量分组操作（通过 store 更新）
  accountStore.accounts.forEach((a) => {
    if (selectedIds.value.includes(a.id)) {
      a.groupId = groupId;
    }
  });
  ElMessage.success(`已将 ${selectedIds.value.length} 个账号移入分组`);
  batchGroupId.value = '';
  selectedIds.value = [];
}

async function handleBatchDelete() {
  for (const id of selectedIds.value) {
    await accountStore.deleteAccount(id);
  }
  ElMessage.success('批量删除完成');
  selectedIds.value = [];
}
</script>

<style scoped>
.page-accounts {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-bg-page);
}

/* ── Tab 栏 ── */
.page-accounts__tabs {
  background: var(--color-bg-card);
  padding: 0 var(--space-4);
  border-bottom: 1px solid var(--color-border);
}

.page-accounts__tabs :deep(.el-tabs__header) {
  margin: 0;
}

.page-accounts__tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.page-accounts__tab-label {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* ── 内容区分栏 ── */
.page-accounts__content {
  flex: 1;
  overflow: hidden;
}

.page-accounts__split {
  display: flex;
  height: 100%;
}

/* ── 右侧主内容区 ── */
.page-accounts__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── 工具栏 ── */
.page-accounts__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border-light);
}

.page-accounts__filter-bar {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
}

.status-filter {
  flex-shrink: 0;
}

.search-input {
  width: 200px;
}

.page-accounts__toolbar-actions {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

/* ── 批量操作栏 ── */
.page-accounts__batch {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  background: var(--color-primary-lighter);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-primary-light);
}

.page-accounts__batch-count {
  font-size: var(--font-size-sm);
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

/* ── 视图切换 ── */
.view-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
}

/* ── 列表区域 ── */
.page-accounts__list-area {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-4);
}

/* ── 卡片网格 ── */
.page-accounts__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-4);
}

/* ── 列表视图 ── */
.page-accounts__table {
  background: var(--color-bg-card);
  border-radius: var(--radius-lg);
}

.page-accounts__table :deep(.el-table__header th) {
  background: var(--color-bg-page);
  color: var(--color-text-secondary);
  font-weight: var(--font-weight-medium);
}

.account-table-cell {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.account-table-cell__info {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.account-table-cell__name {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.account-table-status {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.account-table-status__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.account-table-status__dot--online {
  background: var(--color-success);
  box-shadow: 0 0 4px var(--color-success);
}

.account-table-status__dot--offline {
  background: var(--color-text-placeholder);
}

.account-table-status__dot--expired {
  background: var(--color-danger);
}

.account-table-group {
  font-size: var(--font-size-sm);
  color: var(--color-text-regular);
}

.account-table-group--empty {
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
}

.account-table-time {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.account-table-actions {
  display: flex;
  gap: var(--space-1);
}

/* ── 占位符 ── */
.page-accounts__placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
}

/* ── 过渡动画 ── */
.batch-slide-enter-active,
.batch-slide-leave-active {
  transition: all var(--transition-fast);
}

.batch-slide-enter-from,
.batch-slide-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}

/* ── 响应式 ── */
.page-accounts__groups {
  flex: 1;
}

@media (max-width: 1024px) {
  .page-accounts__split {
    flex-direction: column;
  }

  .page-accounts__split :deep(.filter-panel) {
    width: 100%;
    min-width: unset;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
    flex-direction: row;
    overflow-x: auto;
  }

  .page-accounts__filter-bar {
    flex-wrap: wrap;
  }

  .search-input {
    width: 160px;
  }
}
</style>