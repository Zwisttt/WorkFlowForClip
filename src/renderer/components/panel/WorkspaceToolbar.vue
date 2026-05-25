<script setup lang="ts">
import { ref, computed, watch } from 'vue';

interface Props {
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  currentUrl: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  back: [];
  forward: [];
  refresh: [];
  openDevTools: [];
  togglePin: [];
  navigate: [url: string];
}>();

const inputValue = ref('');
const isFocused = ref(false);

// Watch for URL changes from parent
watch(
  () => props.currentUrl,
  (newUrl) => {
    if (!isFocused.value) {
      inputValue.value = newUrl;
    }
  },
  { immediate: true }
);

const displayUrl = computed(() => {
  if (!props.currentUrl) return '';
  try {
    const url = new URL(props.currentUrl);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return props.currentUrl;
  }
});

const isHttps = computed(() => {
  try {
    const url = new URL(props.currentUrl);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
});

function handleInput() {
  // User is typing - show full URL
}

function handleFocus() {
  isFocused.value = true;
  inputValue.value = props.currentUrl;
}

function handleBlur() {
  isFocused.value = false;
  inputValue.value = displayUrl.value;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    const url = inputValue.value.trim();
    if (url) {
      emit('navigate', url.startsWith('http') ? url : `https://${url}`);
    }
    (e.target as HTMLInputElement).blur();
  }
}
</script>

<template>
  <div class="workspace-toolbar">
    <!-- Navigation Buttons -->
    <div class="workspace-toolbar__nav">
      <button
        class="workspace-toolbar__nav-btn"
        :class="{ 'workspace-toolbar__nav-btn--disabled': !canGoBack }"
        :disabled="!canGoBack"
        title="返回"
        @click="emit('back')"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <button
        class="workspace-toolbar__nav-btn"
        :class="{ 'workspace-toolbar__nav-btn--disabled': !canGoForward }"
        :disabled="!canGoForward"
        title="前进"
        @click="emit('forward')"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6 4L10 8L6 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <button
        class="workspace-toolbar__nav-btn"
        title="刷新"
        @click="emit('refresh')"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M2.5 8a5.5 5.5 0 1 0 1.2-3.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M2.5 3.5V6.5H5.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <!-- URL Bar -->
    <div class="workspace-toolbar__url-wrapper">
      <div
        class="workspace-toolbar__url-bar"
        :class="{ 'workspace-toolbar__url-bar--focused': isFocused }"
      >
        <!-- Lock Icon -->
        <svg
          v-if="isHttps"
          class="workspace-toolbar__lock-icon workspace-toolbar__lock-icon--secure"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <rect x="2" y="5" width="8" height="6" rx="1" stroke="#10b981" stroke-width="1.2"/>
          <path d="M4 5V3.5a2 2 0 1 1 4 0V5" stroke="#10b981" stroke-width="1.2" stroke-linecap="round"/>
        </svg>
        <svg
          v-else
          class="workspace-toolbar__lock-icon workspace-toolbar__lock-icon--insecure"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <rect x="2" y="5" width="8" height="6" rx="1" stroke="#64748b" stroke-width="1.2"/>
          <path d="M4 5V3.5a2 2 0 1 1 4 0" stroke="#64748b" stroke-width="1.2" stroke-linecap="round"/>
        </svg>

        <!-- Input -->
        <input
          v-model="inputValue"
          type="text"
          class="workspace-toolbar__url-input"
          placeholder="输入网址搜索"
          @focus="handleFocus"
          @blur="handleBlur"
          @keydown="handleKeydown"
        >

        <!-- Loading Spinner -->
        <svg
          v-if="isLoading"
          class="workspace-toolbar__spinner"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
        >
          <circle cx="7" cy="7" r="5.5" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="25" stroke-dashoffset="10" stroke-linecap="round"/>
        </svg>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="workspace-toolbar__actions">
      <button
        class="workspace-toolbar__action-btn"
        title="开发者工具"
        @click="emit('openDevTools')"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M6.5 2.5L8 4L6 6.5M9.5 13.5L8 11L10 8.5M4 8H11M3 5H5M3 10H5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>

      <button
        class="workspace-toolbar__action-btn"
        title="固定窗口"
        @click="emit('togglePin')"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 2L10 9L13 12L11.5 13.5L8 10V2H10Z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.workspace-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 44px;
  background: #1e293b;
  border-bottom: 1px solid #334155;
  padding: 0 12px;
}

.workspace-toolbar__nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.workspace-toolbar__nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #94a3b8;
  transition: all 150ms ease;
}

.workspace-toolbar__nav-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}

.workspace-toolbar__nav-btn:active:not(:disabled) {
  transform: scale(0.95);
}

.workspace-toolbar__nav-btn--disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.workspace-toolbar__url-wrapper {
  flex: 1;
}

.workspace-toolbar__url-bar {
  display: flex;
  align-items: center;
  height: 32px;
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 0 10px;
  gap: 8px;
  transition: all 150ms ease;
}

.workspace-toolbar__url-bar--focused {
  background: #1e293b;
  border-color: #2563eb;
}

.workspace-toolbar__url-bar--focused .workspace-toolbar__lock-icon {
  display: none;
}

.workspace-toolbar__lock-icon {
  flex-shrink: 0;
}

.workspace-toolbar__url-input {
  flex: 1;
  height: 100%;
  padding: 0;
  border: none;
  background: transparent;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 13px;
  color: #f1f5f9;
  outline: none;
}

.workspace-toolbar__url-input::placeholder {
  color: #64748b;
}

.workspace-toolbar__spinner {
  flex-shrink: 0;
  animation: workspace-toolbar__spin 0.8s linear infinite;
}

@keyframes workspace-toolbar__spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.workspace-toolbar__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.workspace-toolbar__action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 6px;
  cursor: pointer;
  color: #94a3b8;
  transition: all 150ms ease;
}

.workspace-toolbar__action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f1f5f9;
}

.workspace-toolbar__action-btn:active {
  transform: scale(0.95);
}
</style>