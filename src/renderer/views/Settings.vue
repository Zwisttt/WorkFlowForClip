<template>
  <div class="page-settings">
    <h2 class="page-settings__title">设置</h2>

    <el-tabs v-model="activeTab" class="settings-tabs">
      <el-tab-pane label="基本设置" name="general">
        <div class="settings-card">
          <el-form label-width="140px" class="settings-form">
            <el-divider content-position="left">基本设置</el-divider>

            <el-form-item label="主题">
              <el-select v-model="settings.settings.theme" @change="(v: string) => settings.updateSetting('theme', v as any)">
                <el-option label="浅色" value="light" />
                <el-option label="深色" value="dark" />
                <el-option label="跟随系统" value="auto" />
              </el-select>
            </el-form-item>

            <el-form-item label="语言">
              <el-select v-model="settings.settings.language" @change="(v: string) => settings.updateSetting('language', v as any)">
                <el-option label="简体中文" value="zh-CN" />
                <el-option label="English" value="en-US" />
              </el-select>
            </el-form-item>

            <el-divider content-position="left">任务设置</el-divider>

            <el-form-item label="并发任务数">
              <el-input-number
                v-model="settings.settings.concurrentTasks"
                :min="1"
                :max="10"
                @change="(v: number | undefined) => v && settings.updateSetting('concurrentTasks', v)"
              />
            </el-form-item>

            <el-form-item label="重试次数">
              <el-input-number
                v-model="settings.settings.retryLimit"
                :min="0"
                :max="10"
                @change="(v: number | undefined) => v && settings.updateSetting('retryLimit', v)"
              />
            </el-form-item>

            <el-divider content-position="left">Cookie 检测</el-divider>

            <el-form-item label="自动检测 Cookie">
              <el-switch
                v-model="settings.settings.autoCheckCookie"
                @change="(v: boolean) => settings.updateSetting('autoCheckCookie', v)"
              />
            </el-form-item>

            <el-form-item v-if="settings.settings.autoCheckCookie" label="检测间隔（分钟）">
              <el-input-number
                v-model="settings.settings.cookieCheckInterval"
                :min="10"
                :max="1440"
                :step="10"
                @change="(v: number | undefined) => v && settings.updateSetting('cookieCheckInterval', v)"
              />
            </el-form-item>
          </el-form>
        </div>
      </el-tab-pane>

      <el-tab-pane label="浏览器配置" name="browser">
        <div class="settings-card">
          <div class="browser-mode-selector">
            <div class="browser-mode-selector__label">启动模式</div>
            <el-radio-group
              v-model="settings.settings.browserMode"
              size="large"
              class="browser-mode-selector__group"
              @change="(v: string | number | boolean) => onBrowserModeChange(v as AppSettings['browserMode'])"
            >
              <el-radio-button value="embedded">
                内嵌 Patchright（推荐）
              </el-radio-button>
              <el-radio-button value="external_chrome">
                外置 Chrome
              </el-radio-button>
              <el-radio-button value="external_fingerprint">
                外置指纹浏览器
              </el-radio-button>
            </el-radio-group>
          </div>

          <div class="browser-mode-section">
            <div v-if="settings.settings.browserMode === 'embedded'" class="mode-status mode-status--success">
              <div class="mode-status__icon">
                <el-icon :size="20"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm193.5 301.7l-210.6 292a31.8 31.8 0 01-51.7 0L318.5 484.9c-3.8-5.3 0-12.7 6.5-12.7h46.9c10.3 0 19.9 5 25.9 13.3l71.2 99.8 157.2-218c6-8.4 15.7-13.3 25.9-13.3H699c6.5 0 9.9 7.4 6.5 12.7z" fill="currentColor"/></svg></el-icon>
              </div>
              <div class="mode-status__content">
                <div class="mode-status__title">内嵌模式已启用</div>
                <div class="mode-status__desc">开箱即用，反检测能力最强。外置模式适合已有指纹浏览器的用户。</div>
              </div>
            </div>

            <div v-if="settings.settings.browserMode === 'external_chrome'" class="mode-config-panel">
              <div class="mode-config-panel__header">
                <el-icon :size="18"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M928 160H96c-17.7 0-32 14.3-32 32v608c0 17.7 14.3 32 32 32h832c17.7 0 32-14.3 32-32V192c0-17.7-14.3-32-32-32zM338 620c-60.9 0-110-49.1-110-110s49.1-110 110-110 110 49.1 110 110-49.1 110-110 110zm202-26h-56c-4.4 0-8-3.6-8-8v-44c0-4.4 3.6-8 8-8h56c4.4 0 8 3.6 8 8v44c0 4.4-3.6 8-8 8zm0-116h-56c-4.4 0-8-3.6-8-8v-44c0-4.4 3.6-8 8-8h56c4.4 0 8 3.6 8 8v44c0 4.4-3.6 8-8 8zm190 116h-56c-4.4 0-8-3.6-8-8v-44c0-4.4 3.6-8 8-8h56c4.4 0 8 3.6 8 8v44c0 4.4-3.6 8-8 8zm0-116h-56c-4.4 0-8-3.6-8-8v-44c0-4.4 3.6-8 8-8h56c4.4 0 8 3.6 8 8v44c0 4.4-3.6 8-8 8z" fill="currentColor"/></svg></el-icon>
                <span>Chrome 配置</span>
              </div>
              <el-form label-width="140px" class="settings-form">
                <el-form-item label="Chrome 路径">
                  <el-input
                    v-model="settings.settings.chromePath"
                    placeholder="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                    @change="(v: string) => settings.updateSetting('chromePath', v)"
                  >
                    <template #append>
                      <el-button @click="selectChromePath">选择</el-button>
                    </template>
                  </el-input>
                </el-form-item>
                <el-form-item label="CDP 端点">
                  <el-input
                    v-model="settings.settings.cdpEndpoint"
                    placeholder="ws://127.0.0.1:9222（留空则直接启动 Chrome）"
                    @change="(v: string) => settings.updateSetting('cdpEndpoint', v)"
                  />
                </el-form-item>
              </el-form>
            </div>

            <div v-if="settings.settings.browserMode === 'external_fingerprint'" class="mode-config-panel">
              <div class="mode-config-panel__header">
                <el-icon :size="18"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M880 112H144c-17.7 0-32 14.3-32 32v736c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V144c0-17.7-14.3-32-32-32zM401.3 651h-34.5c-3.8 0-6.9-2.7-7.8-6.4l-18.1-71.4h-84.6l-18.1 71.4c-1 3.7-4 6.4-7.8 6.4h-34.5c-4.9 0-8.5-4.6-7.3-9.3l69.3-265.7c1-3.7 4-6.3 7.8-6.3h41.4c3.8 0 6.9 2.6 7.8 6.3l69.3 265.7c1.2 4.7-2.4 9.3-7.3 9.3zm327.2 0H488c-4.4 0-8-3.6-8-8v-32c0-4.4 3.6-8 8-8h120.3L493 414.4c-2.3-3.2-1.8-7.6 1-10.3l25.5-25.5c3.5-3.5 9.2-3 12 1l119.7 164V307c0-4.4 3.6-8 8-8h33.8c4.4 0 8 3.6 8 8v336c0 4.4-3.6 8-8 8z" fill="currentColor"/></svg></el-icon>
                <span>指纹浏览器配置</span>
                <el-link
                  type="primary"
                  href="https://github.com/AdrYfish/fingerprint-chromium"
                  target="_blank"
                  :underline="false"
                  class="mode-config-panel__link"
                >
                  了解详情 →
                </el-link>
              </div>
              <el-alert
                type="warning"
                :closable="false"
                show-icon
              >
                <template #title>需要先下载指纹浏览器</template>
                指纹浏览器基于 Chromium 定制，支持通过 --fingerprint 参数注入浏览器指纹。请先下载并安装，然后在下方配置路径。
              </el-alert>
              <el-form label-width="140px" class="settings-form">
                <el-form-item label="指纹浏览器路径">
                  <el-input
                    v-model="settings.settings.fingerprintBrowserPath"
                    placeholder="选择 fingerprint-chromium 可执行文件"
                    @change="(v: string) => settings.updateSetting('fingerprintBrowserPath', v)"
                  >
                    <template #append>
                      <el-button @click="selectFingerprintPath">选择</el-button>
                    </template>
                  </el-input>
                </el-form-item>
                <el-form-item label="CDP 端点">
                  <el-input
                    v-model="settings.settings.cdpEndpoint"
                    placeholder="ws://127.0.0.1:9222（留空则直接启动指纹浏览器）"
                    @change="(v: string) => settings.updateSetting('cdpEndpoint', v)"
                  />
                </el-form-item>
              </el-form>
              <p class="settings-hint">请先启动指纹浏览器并开启远程调试端口，MatrixFlow 将通过 CDP 协议接管。</p>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="指纹配置" name="fingerprint">
        <div class="settings-card">
          <template v-if="settings.settings.browserMode === 'external_fingerprint'">
            <FingerprintSettings />
          </template>
          <div v-else class="mode-status mode-status--info">
            <div class="mode-status__icon">
              <el-icon :size="20"><svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm32 664c0 4.4-3.6 8-8 8h-48c-4.4 0-8-3.6-8-8V456c0-4.4 3.6-8 8-8h48c4.4 0 8 3.6 8 8v272zm-32-344c-26.5 0-48-21.5-48-48s21.5-48 48-48 48 21.5 48 48-21.5 48-48 48z" fill="currentColor"/></svg></el-icon>
            </div>
            <div class="mode-status__content">
              <div class="mode-status__title">指纹配置仅在「外置指纹浏览器」模式下生效</div>
              <div class="mode-status__desc">
                指纹模板依赖 fingerprint-chromium 的 <code style="background: rgba(0,0,0,0.06); padding: 1px 5px; border-radius: 3px; font-family: var(--font-family-mono); font-size: 12px;">--fingerprint</code> 系列参数，普通浏览器（Patchright / Chrome）不支持这些参数。请先在「浏览器配置」中将启动模式切换为「外置指纹浏览器」。
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>

      <el-tab-pane label="代理设置" name="proxy">
        <div class="settings-card">
          <ProxySettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="平台配置" name="platform">
        <div class="settings-card">
          <PlatformSettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="License" name="license">
        <div class="settings-card">
          <LicenseSettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="通知设置" name="notification">
        <div class="settings-card">
          <NotificationSettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="数据管理" name="data">
        <div class="settings-card">
          <DataManagementSettings />
        </div>
      </el-tab-pane>

      <el-tab-pane label="关于" name="about">
        <div class="settings-card">
          <AboutPanel />
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSettingsStore } from '@/renderer/stores/settings';
import type { AppSettings } from '@/renderer/stores/settings';
import FingerprintSettings from '@/renderer/components/settings/FingerprintSettings.vue';
import ProxySettings from '@/renderer/components/settings/ProxySettings.vue';
import PlatformSettings from '@/renderer/components/settings/PlatformSettings.vue';
import LicenseSettings from '@/renderer/components/settings/LicenseSettings.vue';
import NotificationSettings from '@/renderer/components/settings/NotificationSettings.vue';
import DataManagementSettings from '@/renderer/components/settings/DataManagementSettings.vue';
import AboutPanel from '@/renderer/components/settings/AboutPanel.vue';

const settings = useSettingsStore();
const activeTab = ref('general');

onMounted(() => {
  settings.fetchSettings();
});

async function onBrowserModeChange(mode: AppSettings['browserMode']) {
  await settings.updateSetting('browserMode', mode);
}

async function selectChromePath() {
  const filePath = await window.matrixflow.dialog.openFile({
    title: '选择 Chrome 浏览器',
    properties: ['openFile'],
    filters: [{ name: '应用程序', extensions: ['app', 'exe'] }],
  });
  if (filePath) {
    settings.updateSetting('chromePath', filePath);
  }
}

async function selectFingerprintPath() {
  const filePath = await window.matrixflow.dialog.openFile({
    title: '选择指纹浏览器',
    properties: ['openFile'],
    filters: [{ name: '应用程序', extensions: ['app', 'exe'] }],
  });
  if (filePath) {
    settings.updateSetting('fingerprintBrowserPath', filePath);
  }
}
</script>

<style scoped>
.page-settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.page-settings__title {
  font-size: var(--font-size-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin: 0;
  padding: var(--space-4) var(--space-4) 0 var(--space-4);
}

.settings-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 var(--space-4) var(--space-4) var(--space-4);
}

.settings-tabs :deep(.el-tabs__header) {
  margin-bottom: var(--space-4);
  flex-shrink: 0;
}

.settings-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow-y: auto;
}

.settings-card {
  flex: 1;
  background: var(--color-bg-card);
  border-radius: var(--border-radius-md);
  padding: var(--space-6);
  box-shadow: var(--shadow-sm);
  overflow-y: auto;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.settings-hint {
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
  margin: var(--space-1) 0 0 0;
  line-height: 1.5;
}

.browser-mode-selector {
  margin-bottom: var(--space-6);
}

.browser-mode-selector__label {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-4);
}

.browser-mode-selector__group {
  display: flex;
  gap: var(--space-3);
}

.browser-mode-selector__group :deep(.el-radio-button) {
  flex: 1;
}

.browser-mode-selector__group :deep(.el-radio-button__inner) {
  width: 100%;
  padding: var(--space-4) var(--space-5);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  border-radius: var(--radius-lg) !important;
  border: 2px solid var(--color-border) !important;
  box-shadow: none;
  transition: all var(--transition-fast);
}

.browser-mode-selector__group :deep(.el-radio-button__inner:hover) {
  border-color: var(--color-primary-light) !important;
  color: var(--color-primary);
}

.browser-mode-selector__group :deep(.el-radio-button.is-active .el-radio-button__inner) {
  border-color: var(--color-primary) !important;
  background: var(--color-primary-lighter);
  color: var(--color-primary);
  box-shadow: var(--shadow-focus);
}

.browser-mode-section {
  margin-top: var(--space-5);
}

.mode-status {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  border: 1px solid transparent;
}

.mode-status--success {
  background: var(--color-success-light, #d1fae5);
  border-color: var(--color-success, #10b981);
}

.mode-status--info {
  background: var(--color-primary-lighter, #dbeafe);
  border-color: var(--color-primary-light, #3b82f6);
}

.mode-status--info .mode-status__icon {
  background: var(--color-primary, #2563eb);
}

.mode-status__icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  color: #fff;
}

.mode-status--success .mode-status__icon {
  background: var(--color-success, #10b981);
}

.mode-status__content {
  flex: 1;
  min-width: 0;
}

.mode-status__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  margin-bottom: var(--space-1);
}

.mode-status__desc {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  line-height: 1.6;
}

.mode-config-panel {
  background: var(--color-bg-page, #f8fafc);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: var(--radius-lg);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.mode-config-panel__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  padding-bottom: var(--space-3);
  border-bottom: 1px solid var(--color-border-light, #f1f5f9);
}

.mode-config-panel__header .el-icon {
  color: var(--color-primary);
}

.mode-config-panel__link {
  margin-left: auto;
  font-size: var(--font-size-sm);
}

.mode-config-panel .el-alert {
  border-radius: var(--radius-md);
}

.mode-config-panel .settings-form {
  margin-top: 0;
}
</style>
