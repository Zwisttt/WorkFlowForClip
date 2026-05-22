<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Monitor } from '@element-plus/icons-vue';
import { usePanelStore } from '@/stores/panel';
import PanelSidebar from '@/renderer/components/panel/PanelSidebar.vue';
import BrowserTabs from '@/renderer/components/panel/BrowserTabs.vue';
import BrowserContent from '@/renderer/components/panel/BrowserContent.vue';
import Loading from '@/renderer/components/common/Loading.vue';
import Empty from '@/renderer/components/common/Empty.vue';

const panelStore = usePanelStore();

const activePanels = computed(() => panelStore.panels);
const activePanelId = computed(() => panelStore.focusedPanelId);
const activePanel = computed(() => 
  activePanels.value.find(p => p.id === activePanelId.value) || null
);

onMounted(async () => {
  await panelStore.loadAvailableAccounts();
  await panelStore.loadPanels();
});

async function handleSelectAccount(accountId: string) {
  const result = await panelStore.openPanel(accountId);
  if (result) {
    ElMessage.success(`已打开 ${result.nickname} 的面板`);
  } else if (panelStore.panels.length >= panelStore.maxPanels) {
    ElMessage.warning(`最多同时打开 ${panelStore.maxPanels} 个面板`);
  }
}

function handleCloseTab(panelId: string) {
  panelStore.closePanel(panelId);
}

function handleCloseAllTabs() {
  panelStore.panels.forEach(p => panelStore.closePanel(p.id));
}

function handleSelectTab(panelId: string) {
  panelStore.focusPanel(panelId);
}

function handleRefresh() {
  panelStore.loadAvailableAccounts();
}

function handleAddAccount() {
  ElMessage.info('请在账号管理页面添加账号');
}

function handleOpenDevTools() {
  if (activePanelId.value) {
    ElMessage.info('开发者工具功能开发中');
  }
}
</script>

<template>
  <div class="multi-panel-view">
    <!-- 左侧账号面板 -->
    <PanelSidebar
      :accounts="panelStore.availableAccounts"
      :active-panel-ids="panelStore.panels.map(p => p.accountId)"
      :loading="false"
      @refresh="handleRefresh"
      @add-account="handleAddAccount"
      @select-account="handleSelectAccount"
    />

    <!-- 右侧浏览器区域 -->
    <div class="multi-panel-view__main">
      <!-- 有打开的面板 -->
      <template v-if="activePanels.length > 0">
        <!-- 标签栏 -->
        <BrowserTabs
          :panels="activePanels"
          :active-panel-id="activePanelId"
          @select="handleSelectTab"
          @close="handleCloseTab"
          @close-all="handleCloseAllTabs"
        />

        <!-- 内容区 -->
        <BrowserContent
          :panel="activePanel"
          @open-dev-tools="handleOpenDevTools"
        />
      </template>

      <!-- 空状态 -->
      <template v-else>
        <div class="multi-panel-view__empty">
          <div class="empty-illustration">
            <el-icon :size="80"><Monitor /></el-icon>
          </div>
          <h3 class="empty-title">选择账号开始矩阵管理</h3>
          <p class="empty-hint">从左侧面板选择账号，打开创作者中心</p>
          <div class="empty-features">
            <div class="feature-item">
              <span class="feature-dot" />
              <span>支持抖音、小红书、视频号、快手四大平台</span>
            </div>
            <div class="feature-item">
              <span class="feature-dot" />
              <span>内嵌浏览器与外部浏览器自由切换</span>
            </div>
            <div class="feature-item">
              <span class="feature-dot" />
              <span>最多同时管理 10 个账号面板</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.multi-panel-view {
  display: flex;
  height: 100%;
  background: var(--color-bg-page);
}

.multi-panel-view__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

/* ── 空状态 ── */
.multi-panel-view__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  text-align: center;
}

.empty-illustration {
  color: var(--color-text-placeholder);
  margin-bottom: var(--space-6);
}

.empty-title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 var(--space-2);
}

.empty-hint {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-6);
}

.empty-features {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  max-width: 320px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.feature-dot {
  width: 6px;
  height: 6px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  flex-shrink: 0;
}
</style>
