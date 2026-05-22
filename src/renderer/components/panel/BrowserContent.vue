<script setup lang="ts">
import { computed } from 'vue';
import { Monitor, Position, Link } from '@element-plus/icons-vue';

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
  openDevTools: [];
}>();

// 是否为外部浏览器
const isExternal = computed(() => {
  return props.panel?.browser_mode !== 'embedded' && props.panel?.browser_mode !== undefined;
});

// 平台配置
const platformConfig = {
  douyin: { label: '抖音', url: 'https://creator.douyin.com/' },
  xiaohongshu: { label: '小红书', url: 'https://creator.xiaohongshu.com/' },
  wechat: { label: '视频号', url: 'https://channels.weixin.qq.com/' },
  kuaishou: { label: '快手', url: 'https://cp.kuaishou.com/' },
};

function getPlatformConfig(platform: string) {
  return platformConfig[platform as keyof typeof platformConfig] || { label: platform, url: '' };
}
</script>

<template>
  <div class="browser-content">
    <!-- 内嵌浏览器模式 -->
    <template v-if="!isExternal">
      <div class="browser-content__toolbar">
        <div class="browser-content__info">
          <el-icon :size="16"><Monitor /></el-icon>
          <span>{{ panel?.nickname }} - {{ getPlatformConfig(panel?.platform || '').label }}创作者中心</span>
        </div>
        <el-button
          type="primary"
          text
          size="small"
          @click="emit('openDevTools')"
        >
          <el-icon><Link /></el-icon>
          打开控制台
        </el-button>
      </div>
      <div class="browser-content__viewport">
        <!-- BrowserView 内容区域由主进程渲染 -->
        <div class="browser-content__placeholder">
          <el-icon :size="48" color="var(--color-text-placeholder)"><Monitor /></el-icon>
          <p>浏览器内容在独立窗口中展示</p>
        </div>
      </div>
    </template>

    <!-- 外部浏览器模式 -->
    <template v-else>
      <div class="browser-content__external">
        <div class="external-icon">
          <el-icon :size="64"><Position /></el-icon>
        </div>
        <h3 class="external-title">已在外部浏览器打开</h3>
        <p class="external-hint">
          {{ panel?.nickname }} 的 {{ getPlatformConfig(panel?.platform || '').label }}创作者中心
          已在独立浏览器窗口中打开
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

/* ── 工具栏 ── */
.browser-content__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border-light);
}

.browser-content__info {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

/* ── 视口区域 ── */
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

/* ── 外部浏览器状态 ── */
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
