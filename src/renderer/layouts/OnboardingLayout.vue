<template>
  <div class="onboarding-layout">
    <div class="onboarding-layout__decor onboarding-layout__decor--tl" />
    <div class="onboarding-layout__decor onboarding-layout__decor--br" />
    
    <div class="onboarding-layout__card">
      <div class="onboarding-layout__brand">
        <div class="onboarding-layout__logo">M</div>
        <h1 class="onboarding-layout__name">MatrixFlow</h1>
      </div>

      <div class="onboarding-layout__steps">
        <div
          v-for="(step, index) in steps"
          :key="index"
          class="step-indicator"
          :class="{
            'step-indicator--active': index === activeStep,
            'step-indicator--done': index < activeStep
          }"
        >
          <div class="step-indicator__dot">
            <el-icon v-if="index < activeStep" :size="14"><Check /></el-icon>
            <span v-else>{{ index + 1 }}</span>
          </div>
          <span class="step-indicator__label">{{ step.title }}</span>
          <span class="step-indicator__hint">{{ step.hint }}</span>
          <div v-if="index < steps.length - 1" class="step-indicator__line" />
        </div>
      </div>

      <div class="onboarding-layout__content">
        <slot />
      </div>

      <div class="onboarding-layout__footer">
        <el-button
          v-if="showBack"
          @click="$emit('back')"
        >
          上一步
        </el-button>
        <div class="onboarding-layout__spacer" />
        <el-button
          v-if="showSkip"
          link
          type="info"
          @click="$emit('skip')"
        >
          跳过
        </el-button>
        <el-button
          v-if="showNext"
          type="primary"
          :disabled="nextDisabled"
          @click="$emit('next')"
        >
          {{ nextLabel }}
        </el-button>
      </div>

      <div class="onboarding-layout__meta">
        <span>v{{ version }}</span>
        <span>·</span>
        <span>© 2024-2026 MatrixFlow</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Check } from '@element-plus/icons-vue';

const steps = [
  { title: '欢迎', hint: '了解 MatrixFlow' },
  { title: '添加账号', hint: '连接你的平台' },
  { title: '浏览器', hint: '选择驱动方式' },
  { title: '完成', hint: '开始使用' },
];

const version = '0.2.0';

defineProps<{
  activeStep: number;
  showBack?: boolean;
  showNext?: boolean;
  showSkip?: boolean;
  nextDisabled?: boolean;
  nextLabel?: string;
}>();

defineEmits<{
  next: [];
  back: [];
  skip: [];
}>();
</script>

<style scoped>
.onboarding-layout {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--color-bg-page);
  overflow: auto;
}

.onboarding-layout__decor {
  position: absolute;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  opacity: 0.03;
  pointer-events: none;
}

.onboarding-layout__decor--tl {
  top: -100px;
  left: -100px;
  background: var(--color-primary);
}

.onboarding-layout__decor--br {
  bottom: -100px;
  right: -100px;
  background: var(--color-primary);
}

.onboarding-layout__card {
  position: relative;
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-10) var(--space-8);
  background: var(--color-bg-card);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-lg);
  margin: var(--space-6);
}

.onboarding-layout__brand {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
}

.onboarding-layout__logo {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  color: var(--color-bg-card);
  border-radius: var(--border-radius-md);
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
}

.onboarding-layout__name {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
}

.onboarding-layout__steps {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 0;
  padding: var(--space-4) 0;
}

.step-indicator {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  min-width: 100px;
}

.step-indicator__dot {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-border);
  border-radius: 50%;
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-placeholder);
  background: var(--color-bg-card);
  transition: all var(--transition-base);
}

.step-indicator__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-placeholder);
  transition: color var(--transition-base);
}

.step-indicator__hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  opacity: 0.7;
}

.step-indicator__line {
  position: absolute;
  top: 16px;
  left: calc(50% + 20px);
  width: calc(100% - 40px);
  height: 2px;
  background: var(--color-border);
  z-index: 0;
}

.step-indicator--active .step-indicator__dot {
  width: 36px;
  height: 36px;
  border-color: var(--color-primary);
  border-width: 2px;
  color: var(--color-primary);
  background: rgba(64, 158, 255, 0.08);
  box-shadow: 0 0 0 4px rgba(64, 158, 255, 0.1);
}

.step-indicator--active .step-indicator__label {
  color: var(--color-primary);
}

.step-indicator--active .step-indicator__hint {
  color: var(--color-text-secondary);
  opacity: 1;
}

.step-indicator--done .step-indicator__dot {
  border-color: var(--color-success);
  background: var(--color-success);
  color: white;
}

.step-indicator--done .step-indicator__label {
  color: var(--color-text-secondary);
}

.step-indicator--done .step-indicator__line {
  background: var(--color-success);
}

.onboarding-layout__content {
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.onboarding-layout__footer {
  display: flex;
  align-items: center;
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-light);
  gap: var(--space-3);
}

.onboarding-layout__footer :deep(.el-button) {
  min-width: 80px;
}

.onboarding-layout__spacer {
  flex: 1;
}

.onboarding-layout__meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-text-placeholder);
  margin-top: var(--space-2);
}
</style>
