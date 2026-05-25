<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import {
  Position, ArrowLeft, ArrowRight,
  Refresh, Link, Close, Loading
} from '@element-plus/icons-vue';

interface Panel {
  id: string;
  accountId: string;
  platform: string;
  nickname: string;
  browser_mode?: 'embedded' | 'external_chrome' | 'external_fingerprint';
}

interface Props {
  panel: Panel | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [panelId: string];
}>();

const currentUrl = ref('');
const isLoading = ref(false);
const canGoBack = ref(false);
const canGoForward = ref(false);
const urlInput = ref('');

const isEmbedded = computed(() => {
  return props.panel?.browser_mode === 'embedded' || props.panel?.browser_mode === undefined;
});

const displayUrl = computed(() => {
  if (!currentUrl.value) return '';
  try {
    const u = new URL(currentUrl.value);
    return u.hostname + u.pathname;
  } catch {
    return currentUrl.value;
  }
});

const panelApi = (window as any).matrixflow?.panel;

function goBack() {
  if (props.panel && panelApi) {
    panelApi.navigate(props.panel.id, 'back');
  }
}

function goForward() {
  if (props.panel && panelApi) {
    panelApi.navigate(props.panel.id, 'forward');
  }
}

function refresh() {
  if (props.panel && panelApi) {
    panelApi.navigate(props.panel.id, 'refresh');
  }
}

function openDevTools() {
  if (props.panel && panelApi) {
    panelApi.openDevTools(props.panel.id);
  }
}

function navigateToUrl() {
  const url = urlInput.value.trim();
  if (!url || !props.panel || !panelApi) return;

  const finalUrl = url.startsWith('http') ? url : `https://${url}`;
  panelApi.navigate(props.panel.id, 'url', finalUrl);
  currentUrl.value = finalUrl;
}

function handleUrlKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    navigateToUrl();
    (e.target as HTMLInputElement).blur();
  }
}

function handleUrlFocus(e: FocusEvent) {
  urlInput.value = currentUrl.value;
  (e.target as HTMLInputElement).select();
}

function handleUrlBlur() {
  urlInput.value = displayUrl.value;
}

function handleClose() {
  if (props.panel) {
    emit('close', props.panel.id);
  }
}

function onUrlChange(panelId: string, url: string) {
  if (panelId === props.panel?.id) {
    currentUrl.value = url;
    urlInput.value = url;
  }
}

function onNavigationState(panelId: string, back: boolean, forward: boolean) {
  if (panelId === props.panel?.id) {
    canGoBack.value = back;
    canGoForward.value = forward;
  }
}

function onLoadingState(panelId: string, loading: boolean) {
  if (panelId === props.panel?.id) {
    isLoading.value = loading;
  }
}

onMounted(() => {
  if (panelApi) {
    panelApi.onUrlChange(onUrlChange);
    panelApi.onNavigationState(onNavigationState);
    panelApi.onLoadingState(onLoadingState);
  }
});
</script>

<template>
  <div class="browser-content">
    <template v-if="isEmbedded">
      <div class="browser-content__toolbar">
        <div class="browser-content__nav">
          <button
            class="nav-btn"
            :disabled="!canGoBack"
            title="后退"
            @click="goBack"
          >
            <el-icon :size="16"><ArrowLeft /></el-icon>
          </button>
          <button
            class="nav-btn"
            :disabled="!canGoForward"
            title="前进"
            @click="goForward"
          >
            <el-icon :size="16"><ArrowRight /></el-icon>
          </button>
          <button
            class="nav-btn"
            :class="{ 'is-loading': isLoading }"
            title="刷新"
            @click="refresh"
          >
            <el-icon :size="16"><Refresh /></el-icon>
          </button>
        </div>

        <div class="browser-content__url-bar">
          <span class="url-bar__lock">
            <svg v-if="currentUrl.startsWith('https')" viewBox="0 0 24 24" width="14" height="14">
              <path fill="#4CAF50" d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
            </svg>
          </span>
          <el-icon v-if="isLoading" :size="14" class="url-bar__loading">
            <Loading />
          </el-icon>
          <input
            v-model="urlInput"
            class="url-bar__input"
            placeholder="搜索或输入网址"
            spellcheck="false"
            @keydown="handleUrlKeydown"
            @focus="handleUrlFocus"
            @blur="handleUrlBlur"
          />
        </div>

        <div class="browser-content__actions">
          <button class="nav-btn" title="打开控制台" @click="openDevTools">
            <el-icon :size="16"><Link /></el-icon>
          </button>
          <button class="nav-btn nav-btn--close" title="关闭" @click="handleClose">
            <el-icon :size="16"><Close /></el-icon>
          </button>
        </div>
      </div>

      <div class="browser-content__viewport">
        <div class="browser-content__placeholder">
          <p>加载中...</p>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="browser-content__external">
        <div class="external-icon">
          <el-icon :size="64"><Position /></el-icon>
        </div>
        <h3 class="external-title">已在外部浏览器打开</h3>
        <p class="external-hint">
          {{ panel?.nickname }} 的创作者中心已在独立浏览器窗口中打开
        </p>
        <div class="external-info">
          <el-tag type="info" effect="plain">
            {{ panel?.browser_mode === 'external_chrome' ? 'Chrome 浏览器' : '指纹浏览器' }}
          </el-tag>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.browser-content {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-page);
}

.browser-content__toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border-light);
  height: 40px;
}

.browser-content__nav {
  display: flex;
  gap: 2px;
}

.nav-btn {
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);
}

.nav-btn:hover:not(:disabled) {
  background: var(--color-fill-light);
  color: var(--color-text-primary);
}

.nav-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.nav-btn.is-loading .el-icon {
  animation: spin 0.8s linear infinite;
}

.nav-btn--close:hover {
  background: var(--color-danger-light);
  color: var(--color-danger);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.browser-content__url-bar {
  flex: 1;
  display: flex;
  align-items: center;
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
  height: 28px;
  padding: 0 var(--space-3);
  gap: var(--space-1);
  border: 1px solid var(--color-border-light);
  transition: border-color var(--transition-fast);
}

.browser-content__url-bar:focus-within {
  border-color: var(--color-primary);
  background: var(--color-bg-card);
}

.url-bar__lock {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.url-bar__loading {
  flex-shrink: 0;
  color: var(--color-primary);
  animation: spin 0.8s linear infinite;
}

.url-bar__input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 13px;
  background: transparent;
  color: var(--color-text-regular);
  min-width: 0;
}

.url-bar__input::placeholder {
  color: var(--color-text-placeholder);
}

.browser-content__actions {
  display: flex;
  gap: 2px;
}

.browser-content__viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.browser-content__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  color: var(--color-text-placeholder);
}

.browser-content__external {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-8);
  text-align: center;
}

.external-icon {
  color: var(--color-accent);
  margin-bottom: var(--space-4);
}

.external-title {
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0 0 var(--space-2);
}

.external-hint {
  font-size: var(--font-size-base);
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-4);
  max-width: 400px;
}

.external-info {
  display: flex;
  gap: var(--space-2);
}
</style>
