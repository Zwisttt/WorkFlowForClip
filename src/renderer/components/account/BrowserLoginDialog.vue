<template>
  <el-dialog
    v-model="visible"
    title=""
    width="640px"
    destroy-on-close
    :close-on-click-modal="false"
    class="add-account-dialog"
    @close="handleClose"
  >
    <template #header>
      <div class="dialog-header">
        <h2 class="dialog-header__title">添加账号</h2>
        <p class="dialog-header__subtitle">选择平台并配置登录方式</p>
      </div>
    </template>

    <div class="browser-login-dialog">
      <div class="browser-login-dialog__steps">
        <div class="steps-track">
          <div class="steps-track__line"></div>
          <div 
            class="steps-track__progress" 
            :style="{ width: `${currentStep * 50}%` }"
          ></div>
        </div>
        <div
          v-for="(stepItem, index) in steps"
          :key="stepItem.key"
          class="step-indicator"
          :class="{
            'step-indicator--active': currentStep === index,
            'step-indicator--done': currentStep > index,
          }"
        >
          <div class="step-indicator__dot">
            <div class="step-indicator__number">
              <el-icon v-if="currentStep > index" :size="14"><Check /></el-icon>
              <span v-else>{{ index + 1 }}</span>
            </div>
          </div>
          <span class="step-indicator__label">{{ stepItem.label }}</span>
        </div>
      </div>

      <!-- Step 1: 选择平台 -->
      <div v-if="currentStep === 0" class="browser-login-dialog__content">
        <div class="section-label">
          <span class="section-label__text">选择平台</span>
        </div>
        
        <div class="platform-grid">
          <div
            v-for="platform in platforms"
            :key="platform.value"
            class="platform-card"
            :class="{ 'platform-card--active': selectedPlatform === platform.value }"
            :style="{ '--platform-color': platform.color }"
            @click="selectedPlatform = platform.value"
          >
            <div class="platform-card__icon">
              <span class="platform-card__initial">{{ platform.label.charAt(0) }}</span>
            </div>
            <span class="platform-card__name">{{ platform.label }}</span>
            <div class="platform-card__badge" v-if="selectedPlatform === platform.value">
              <el-icon :size="12"><Check /></el-icon>
            </div>
          </div>
        </div>

        <div class="section-divider"></div>

        <div class="section-label">
          <span class="section-label__text">配置模式</span>
        </div>

        <div class="config-mode-cards">
          <div
            class="config-mode-card"
            :class="{ 'config-mode-card--active': configMode === 'quick' }"
            @click="configMode = 'quick'"
          >
            <div class="config-mode-card__icon config-mode-card__icon--quick">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
              </svg>
            </div>
            <div class="config-mode-card__content">
              <span class="config-mode-card__title">快速配置</span>
              <span class="config-mode-card__desc">内嵌浏览器 + 本地指纹 + 本地IP</span>
            </div>
            <div class="config-mode-card__check" v-if="configMode === 'quick'">
              <el-icon :size="14"><Check /></el-icon>
            </div>
          </div>

          <div
            class="config-mode-card"
            :class="{ 'config-mode-card--active': configMode === 'smart' }"
            @click="configMode = 'smart'"
          >
            <div class="config-mode-card__icon config-mode-card__icon--smart">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
            </div>
            <div class="config-mode-card__content">
              <span class="config-mode-card__title">智能配置</span>
              <span class="config-mode-card__desc">AI 风险检测 → 推荐配置</span>
            </div>
            <div class="config-mode-card__check" v-if="configMode === 'smart'">
              <el-icon :size="14"><Check /></el-icon>
            </div>
          </div>

          <div
            class="config-mode-card"
            :class="{ 'config-mode-card--active': configMode === 'custom' }"
            @click="configMode = 'custom'"
          >
            <div class="config-mode-card__icon config-mode-card__icon--custom">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <div class="config-mode-card__content">
              <span class="config-mode-card__title">自定义配置</span>
              <span class="config-mode-card__desc">自由选择浏览器、指纹、代理</span>
            </div>
            <div class="config-mode-card__check" v-if="configMode === 'custom'">
              <el-icon :size="14"><Check /></el-icon>
            </div>
          </div>
        </div>

        <div v-if="configMode === 'custom'" class="custom-config-section">
          <div class="config-row">
            <div class="config-item">
              <label class="config-item__label">浏览器类型</label>
              <el-select v-model="browserType" placeholder="选择浏览器" style="width: 100%">
                <el-option label="内嵌浏览器" value="embedded" />
                <el-option label="外置 Chrome" value="chrome" />
                <el-option label="指纹浏览器" value="fingerprint" />
              </el-select>
            </div>
            
            <div class="config-item">
              <label class="config-item__label">指纹配置</label>
              <el-select v-model="fingerprintId" :placeholder="fingerprintPlaceholder" clearable style="width: 100%">
                <el-option
                  v-for="fp in fingerprintOptions"
                  :key="fp.id"
                  :label="fp.name"
                  :value="fp.id"
                />
              </el-select>
            </div>
            
            <div class="config-item">
              <label class="config-item__label">代理配置</label>
              <el-select v-model="proxyId" :placeholder="proxyPlaceholder" clearable style="width: 100%">
                <el-option
                  v-for="p in proxyOptions"
                  :key="p.id"
                  :label="`${p.name} (${p.host}:${p.port})`"
                  :value="p.id"
                />
              </el-select>
            </div>
          </div>

          <div v-if="browserType === 'embedded'" class="config-hint config-hint--embedded">
            <div class="config-hint__icon">
              <el-icon :size="16"><InfoFilled /></el-icon>
            </div>
            <div class="config-hint__content">
              <p class="config-hint__text">{{ browserTypeHint }}</p>
            </div>
          </div>

          <div v-if="browserType === 'chrome'" class="config-hint config-hint--chrome-plugin">
            <div class="config-hint__icon">
              <el-icon :size="16"><WarningFilled /></el-icon>
            </div>
            <div class="config-hint__content">
              <p class="config-hint__text">外置 Chrome 需要安装指纹修改插件才能使用独立指纹。请在上方选择指纹配置后，安装以下插件：</p>
              <p class="config-hint__links">
                <span class="config-hint__link" @click="openInChrome('https://chromewebstore.google.com/detail/webrtc-network-limiter/npeicpdbkakmehahjeeohfdhnlpdklia')">WebRTC Leak Prevent ↗</span>
              </p>
            </div>
          </div>

          <div class="config-preview-card">
            <div class="config-preview-card__header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="config-preview-card__icon">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
                <polyline points="10 9 9 9 8 9"/>
              </svg>
              <span>配置预览</span>
            </div>
            <div class="config-preview-card__items">
              <div class="config-preview-item">
                <span class="config-preview-item__label">浏览器</span>
                <span class="config-preview-item__value">{{ configPreview.browser }}</span>
              </div>
              <div class="config-preview-item">
                <span class="config-preview-item__label">指纹</span>
                <span class="config-preview-item__value">{{ configPreview.fingerprint }}</span>
              </div>
              <div class="config-preview-item">
                <span class="config-preview-item__label">代理</span>
                <span class="config-preview-item__value">{{ configPreview.proxy }}</span>
              </div>
              <div class="config-preview-item">
                <span class="config-preview-item__label">风险等级</span>
                <span class="config-preview-item__value" :class="`risk--${configPreview.riskLevel}`">
                  {{ configPreview.riskLevel === 'low' ? '低风险' : configPreview.riskLevel === 'medium' ? '中风险' : '高风险' }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="configMode === 'smart'" class="smart-config-section">
          <div class="ai-analysis-panel">
            <div class="ai-analysis-panel__header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="ai-analysis-panel__icon">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 16v-4M12 8h.01"/>
              </svg>
              <span>AI 风险分析</span>
            </div>

            <div v-if="!selectedPlatform" class="ai-analysis-panel__empty">
              请先选择平台
            </div>

            <template v-else>
              <div class="ai-analysis-panel__risk-level">
                <span class="ai-analysis-panel__label">当前风险等级</span>
                <span class="ai-analysis-panel__risk-badge" :class="`ai-analysis-panel__risk-badge--${aiRiskLevel}`">
                  {{ aiRiskLevel === 'low' ? '低风险' : aiRiskLevel === 'medium' ? '⚠️ 中风险' : '🔴 高风险' }}
                </span>
              </div>

              <div class="ai-analysis-panel__factors">
                <span class="ai-analysis-panel__label">检测结果</span>
                <div class="ai-factor-list">
                  <div class="ai-factor-item">
                    <span class="ai-factor-item__key">本地IP</span>
                    <span class="ai-factor-item__val">{{ riskInfo?.localIP || '本地IP' }}</span>
                  </div>
                  <div class="ai-factor-item">
                    <span class="ai-factor-item__key">同IP同平台账号</span>
                    <span class="ai-factor-item__val">{{ riskInfo?.sameIPCount ?? 0 }} 个</span>
                  </div>
                  <div class="ai-factor-item">
                    <span class="ai-factor-item__key">系统限制</span>
                    <span class="ai-factor-item__val">{{ riskInfo?.limit ?? 5 }} 个</span>
                  </div>
                </div>
              </div>

              <div class="ai-analysis-panel__recommend">
                <span class="ai-analysis-panel__label">💡 推荐配置</span>
                <div class="ai-recommend-list">
                  <div class="ai-recommend-item">
                    <span class="ai-recommend-item__key">浏览器</span>
                    <span class="ai-recommend-item__val">{{ smartRecommend.browser }}</span>
                  </div>
                  <div class="ai-recommend-item">
                    <span class="ai-recommend-item__key">指纹</span>
                    <span class="ai-recommend-item__val">{{ smartRecommend.fingerprint }}</span>
                  </div>
                  <div class="ai-recommend-item">
                    <span class="ai-recommend-item__key">代理</span>
                    <span class="ai-recommend-item__val">{{ smartRecommend.proxy }}</span>
                  </div>
                </div>
              </div>

              <div class="ai-analysis-panel__actions">
                <div v-if="!proxyOptions.length && aiRiskLevel !== 'low'" class="ai-analysis-panel__prerequisite">
                  <el-icon :size="14"><Warning /></el-icon>
                  <span>需要先配置代理池才能使用智能配置</span>
                  <el-text size="small" type="info">请在系统设置中添加代理</el-text>
                </div>
                <el-button v-else type="primary" @click="applySmartRecommend" :disabled="aiRiskLevel === 'low' && !proxyOptions.length">
                  应用推荐配置
                </el-button>
              </div>
            </template>
          </div>
        </div>

        <div v-if="riskInfo && riskInfo.sameIPCount >= 3" class="risk-warning-banner">
          <div class="risk-warning-banner__icon">
            <el-icon :size="20"><Warning /></el-icon>
          </div>
          <div class="risk-warning-banner__content">
            <span class="risk-warning-banner__title">风险提示</span>
            <span class="risk-warning-banner__text">
              检测到您已有 <strong>{{ riskInfo.sameIPCount }}</strong> 个 {{ currentPlatformLabel }} 账号使用本地IP，
              建议使用智能配置或自定义配置
            </span>
          </div>
        </div>
      </div>

      <!-- Step 2: 登录中 -->
      <div v-else-if="currentStep === 1" class="browser-login-dialog__content">
        <div class="login-status">
          <div v-if="loginStatus === 'logging_in'" class="login-status__loading">
            <div class="login-status__spinner-wrapper">
              <el-icon class="login-status__spinner" :size="48"><Loading /></el-icon>
            </div>
            <span class="login-status__text">正在启动浏览器...</span>
            <span class="login-status__hint">请稍候，正在为您准备登录环境</span>
          </div>

          <div v-else-if="loginStatus === 'detecting'" class="login-status__detecting">
            <div class="login-status__spinner-wrapper">
              <el-icon class="login-status__spinner" :size="48"><Loading /></el-icon>
            </div>
            <span class="login-status__text">等待登录...</span>
            <span class="login-status__hint">请在浏览器中完成登录操作</span>
            <el-progress
              :percentage="loginProgress"
              :show-text="false"
              :stroke-width="6"
              class="login-status__progress"
            />
          </div>

          <div v-else-if="loginStatus === 'failed'" class="login-status__failed">
            <div class="login-status__icon-wrapper login-status__icon-wrapper--danger">
              <el-icon :size="40"><CircleCloseFilled /></el-icon>
            </div>
            <span class="login-status__text">登录失败</span>
            <span class="login-status__error">{{ loginError }}</span>
          </div>

          <div v-else-if="loginStatus === 'timeout'" class="login-status__timeout">
            <div class="login-status__icon-wrapper login-status__icon-wrapper--warning">
              <el-icon :size="40"><WarningFilled /></el-icon>
            </div>
            <span class="login-status__text">登录超时</span>
            <span class="login-status__hint">请检查网络连接后重试</span>
          </div>
        </div>
      </div>

      <!-- Step 3: 完成 -->
      <div v-else-if="currentStep === 2" class="browser-login-dialog__content">
        <div class="login-success">
          <div class="login-success__icon-wrapper">
            <el-icon :size="56"><CircleCheckFilled /></el-icon>
          </div>
          <h3 class="login-success__title">账号绑定成功</h3>
          <p class="login-success__desc">已成功绑定 {{ currentPlatformLabel }} 账号</p>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="browser-login-dialog__footer">
        <el-button v-if="currentStep === 1 && (loginStatus === 'failed' || loginStatus === 'timeout')" @click="handleRetry">
          重试
        </el-button>
        <el-button v-if="currentStep === 1" @click="handleCancel">
          取消
        </el-button>
        <el-button v-if="currentStep === 0" :disabled="!selectedPlatform" type="primary" @click="handleNext">
          开始登录
        </el-button>
        <el-button v-if="currentStep === 2" type="primary" @click="handleFinish">
          完成
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, onMounted } from 'vue';
import {
  Check, Loading, CircleCloseFilled, WarningFilled, CircleCheckFilled, Warning, InfoFilled,
} from '@element-plus/icons-vue';
import { ElMessage } from 'element-plus';
import { useAccountStore, type BrowserConfig } from '@/renderer/stores/account';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [val: boolean]; success: [] }>();

const accountStore = useAccountStore();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
});

const currentStep = ref(0);
const selectedPlatform = ref('');
const configMode = ref<'quick' | 'smart' | 'custom'>('quick');
const browserType = ref<'embedded' | 'chrome' | 'fingerprint'>('embedded');
const chromePath = ref('');
const fingerprintId = ref<string | null>(null);
const proxyId = ref<string | null>(null);
const loginStatus = ref<'idle' | 'logging_in' | 'detecting' | 'success' | 'failed' | 'timeout' | 'cancelled'>('idle');
const loginError = ref('');
const loginProgress = ref(0);

const steps = [
  { key: 'select', label: '选择平台' },
  { key: 'login', label: '登录' },
  { key: 'done', label: '完成' },
];

const platforms = [
  { label: '抖音', value: 'douyin', color: '#161823' },
  { label: '小红书', value: 'xiaohongshu', color: '#FE2C55' },
  { label: '视频号', value: 'weixin_video', color: '#07C160' },
  { label: '快手', value: 'kuaishou', color: '#FF4906' },
  { label: 'B站', value: 'bilibili', color: '#00A1D6' },
];

const fingerprintOptions = ref<Array<{ id: string; name: string }>>([]);
const proxyOptions = ref<Array<{ id: string; name: string; host: string; port: number }>>([]);

const riskInfo = ref<{
  localIP: string;
  sameIPCount: number;
  limit: number;
  riskLevel: 'low' | 'medium' | 'high';
} | null>(null);

const aiRiskLevel = computed(() => {
  if (!riskInfo.value) return 'low';
  return riskInfo.value.riskLevel;
});

const smartRecommend = computed(() => {
  const level = aiRiskLevel.value;
  if (level === 'high') {
    const fpName = fingerprintOptions.value.length
      ? fingerprintOptions.value[0].name
      : '独立指纹（自动生成）';
    const proxyName = proxyOptions.value.length
      ? proxyOptions.value[0].name
      : '请先配置代理池';
    return {
      browser: '内嵌 Patchright',
      fingerprint: fpName,
      proxy: proxyName,
      fingerprintId: fingerprintOptions.value.length ? fingerprintOptions.value[0].id : null,
      proxyId: proxyOptions.value.length ? proxyOptions.value[0].id : null,
    };
  }
  if (level === 'medium') {
    const proxyName = proxyOptions.value.length
      ? proxyOptions.value[0].name
      : '请先配置代理池';
    return {
      browser: '内嵌 Patchright',
      fingerprint: '本地指纹',
      proxy: proxyName,
      fingerprintId: null,
      proxyId: proxyOptions.value.length ? proxyOptions.value[0].id : null,
    };
  }
  return {
    browser: '内嵌 Patchright',
    fingerprint: '本地指纹',
    proxy: '本地IP（无需代理）',
    fingerprintId: null,
    proxyId: null,
  };
});

function applySmartRecommend() {
  browserType.value = 'embedded';
  fingerprintId.value = smartRecommend.value.fingerprintId;
  proxyId.value = smartRecommend.value.proxyId;
}

const currentPlatformLabel = computed(() => {
  return platforms.find((p) => p.value === selectedPlatform.value)?.label || '';
});

const fingerprintPlaceholder = computed(() => {
  switch (browserType.value) {
    case 'embedded': return '默认（本地指纹）';
    case 'chrome': return '默认（本地指纹）';
    case 'fingerprint': return '默认（自动生成）';
    default: return '默认（本地指纹）';
  }
});

const proxyPlaceholder = computed(() => {
  switch (browserType.value) {
    case 'embedded': return '默认（本地IP）';
    case 'chrome': return '默认（本地IP）';
    case 'fingerprint': return '默认（代理IP）';
    default: return '默认（本地IP）';
  }
});

const browserTypeHint = computed(() => {
  if (browserType.value === 'embedded') {
    return '内嵌 Patchright 使用本地真实指纹，防自动化检测能力强（CreepJS: 0% headless）。如需自定义 Canvas/WebGL 指纹，需通过 init scripts 配置。建议高风控平台（小红书、抖音）升级到指纹浏览器。';
  }
  return '';
});

const effectiveRiskLevel = computed(() => {
  let score = 0;
  const baseRisk = riskInfo.value;

  switch (browserType.value) {
    case 'embedded': score += 2; break;
    case 'chrome': score += 3; break;
    case 'fingerprint': score += 1; break;
  }

  if (fingerprintId.value) {
    if (browserType.value === 'chrome') score += 2;
    else score += 0;
  } else {
    if (browserType.value === 'fingerprint') score += 2;
    else score += 1;
  }

  if (!proxyId.value) {
    score += 2;
    if (baseRisk && baseRisk.sameIPCount >= 3) score += 1;
  }

  if (score <= 3) return 'low';
  if (score <= 5) return 'medium';
  return 'high';
});

const configPreview = computed(() => {
  const browserLabel = {
    embedded: '内嵌浏览器',
    chrome: '外置 Chrome',
    fingerprint: '指纹浏览器',
  }[browserType.value];

  let fingerprintLabel: string;
  if (browserType.value === 'chrome' && fingerprintId.value) {
    fingerprintLabel = (fingerprintOptions.value.find(f => f.id === fingerprintId.value)?.name || '独立指纹') + '（需插件）';
  } else if (fingerprintId.value) {
    fingerprintLabel = fingerprintOptions.value.find(f => f.id === fingerprintId.value)?.name || '独立指纹';
  } else if (browserType.value === 'fingerprint') {
    fingerprintLabel = '独立指纹（自动生成）';
  } else {
    fingerprintLabel = '本地指纹';
  }

  let proxyLabel: string;
  if (proxyId.value) {
    proxyLabel = proxyOptions.value.find(p => p.id === proxyId.value)?.name || '代理IP';
  } else {
    proxyLabel = '本地IP';
  }

  return {
    browser: browserLabel,
    fingerprint: fingerprintLabel,
    proxy: proxyLabel,
    riskLevel: effectiveRiskLevel.value,
  };
});

let progressInterval: ReturnType<typeof setInterval> | null = null;
let unsubscribe: (() => void) | null = null;

async function loadOptions() {
  try {
    const [fpResult, proxyResult] = await Promise.all([
      window.matrixflow.fingerprint.list(),
      window.matrixflow.proxy.list(),
    ]);

    if (fpResult.success && fpResult.data) {
      fingerprintOptions.value = fpResult.data.map((f: any) => ({
        id: f.id,
        name: f.name,
      }));
    }

    if (proxyResult.success && proxyResult.data) {
      proxyOptions.value = proxyResult.data.map((p: any) => ({
        id: p.id,
        name: p.name,
        host: p.host,
        port: p.port,
      }));
    }
  } catch (error) {
    console.error('Failed to load options:', error);
  }
}

async function detectRisk() {
  if (!selectedPlatform.value) return;

  try {
    const [accountsResult, limitResult] = await Promise.all([
      window.matrixflow.accounts.list(),
      window.matrixflow.ipLimit.check(selectedPlatform.value),
    ]);

    const accounts = accountsResult || [];
    const platformAccounts = accounts.filter((a: any) => a.platform === selectedPlatform.value);

    const platformCount = limitResult?.data?.platformCount ?? platformAccounts.length;
    const platformLimit = limitResult?.data?.platformLimit ?? 5;
    const exceeded = limitResult?.data?.exceeded ?? false;

    riskInfo.value = {
      localIP: '本地IP',
      sameIPCount: platformCount,
      limit: platformLimit,
      riskLevel: exceeded ? 'high' : platformCount >= platformLimit * 0.6 ? 'medium' : 'low',
    };
  } catch (error) {
    console.error('Failed to detect risk:', error);
  }
}

watch(() => props.modelValue, async (val) => {
  if (val) {
    reset();
    await loadOptions();
    unsubscribe = accountStore.setupLoginListeners();
  } else {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  }
});

watch(selectedPlatform, () => {
  detectRisk();
});

watch(configMode, (mode) => {
  if (mode === 'quick') {
    browserType.value = 'embedded';
    fingerprintId.value = null;
    proxyId.value = null;
  }
});

watch(() => accountStore.loginState.status, (status) => {
  loginStatus.value = status;
  
  if (status === 'success') {
    currentStep.value = 2;
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  } else if (status === 'failed' || status === 'timeout') {
    loginError.value = accountStore.loginState.error || '未知错误';
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
  if (progressInterval) {
    clearInterval(progressInterval);
  }
});

function reset() {
  currentStep.value = 0;
  selectedPlatform.value = '';
  configMode.value = 'quick';
  browserType.value = 'embedded';
  chromePath.value = '';
  fingerprintId.value = null;
  proxyId.value = null;
  loginStatus.value = 'idle';
  loginError.value = '';
  loginProgress.value = 0;
  riskInfo.value = null;
  accountStore.resetLoginState();
}

function handleClose() {
  visible.value = false;
}

async function handleNext() {
  if (!selectedPlatform.value) return;
  
  currentStep.value = 1;
  loginStatus.value = 'logging_in';
  loginProgress.value = 0;

  progressInterval = setInterval(() => {
    if (loginProgress.value < 95) {
      loginProgress.value += Math.random() * 3;
    }
  }, 500);

  const browserConfig: BrowserConfig = {
    type: browserType.value,
    executablePath: browserType.value === 'chrome' ? chromePath.value : undefined,
    fingerprintId: browserType.value === 'fingerprint' ? (fingerprintId.value || undefined) : (configMode.value === 'custom' ? (fingerprintId.value || undefined) : undefined),
    proxyId: configMode.value === 'custom' ? (proxyId.value || undefined) : undefined,
  };

  try {
    await accountStore.startLogin(selectedPlatform.value, browserConfig);
  } catch (error) {
    loginStatus.value = 'failed';
    loginError.value = String(error);
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }
}

function handleCancel() {
  accountStore.cancelLogin();
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
  visible.value = false;
}

function handleRetry() {
  handleNext();
}

function handleFinish() {
  emit('update:modelValue', false);
  emit('success');
}

async function selectChromePath() {
  ElMessage.info('请在设置中配置 Chrome 路径');
}

async function openInChrome(url: string) {
  const result = await window.matrixflow.browser.openUrl(url);
  if (!result.success) {
    ElMessage.warning(result.message || 'Chrome 浏览器路径未配置，请在系统设置中配置');
  }
}
</script>

<style scoped>
.add-account-dialog :deep(.el-dialog__header) {
  padding: 0;
  margin: 0;
}

.add-account-dialog :deep(.el-dialog__body) {
  padding: var(--space-5);
  padding-top: 0;
}

.add-account-dialog :deep(.el-dialog__footer) {
  padding: 0 var(--space-5) var(--space-5);
}

.dialog-header {
  padding: var(--space-5) var(--space-5) var(--space-3);
  border-bottom: 1px solid var(--color-border-light);
}

.dialog-header__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  line-height: 1.3;
}

.dialog-header__subtitle {
  margin: var(--space-1) 0 0 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.browser-login-dialog {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.browser-login-dialog__content {
  min-height: 280px;
}

.browser-login-dialog__steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: relative;
  padding: var(--space-3) var(--space-6);
  margin-bottom: var(--space-1);
}

.steps-track {
  position: absolute;
  left: calc(16.67% + 14px);
  right: calc(16.67% + 14px);
  top: calc(50% - 1px);
  height: 2px;
  z-index: 0;
}

.steps-track__line {
  position: absolute;
  inset: 0;
  background: var(--color-border);
  border-radius: 1px;
}

.steps-track__progress {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, var(--color-primary) 0%, var(--color-primary-light) 100%);
  border-radius: 1px;
  transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.step-indicator {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  z-index: 1;
}

.step-indicator__dot {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-card);
  border: 2px solid var(--color-border);
  border-radius: 50%;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.step-indicator__number {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-indicator__label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.step-indicator--active .step-indicator__dot {
  border-color: var(--color-primary);
  background: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.step-indicator--active .step-indicator__number {
  color: #fff;
}

.step-indicator--active .step-indicator__label {
  color: var(--color-primary);
  font-weight: var(--font-weight-semibold);
}

.step-indicator--done .step-indicator__dot {
  border-color: var(--color-success);
  background: var(--color-success);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.step-indicator--done .step-indicator__number {
  color: #fff;
}

.step-indicator--done .step-indicator__label {
  color: var(--color-success);
}

.section-label {
  margin-bottom: var(--space-2);
}

.section-label__text {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-divider {
  height: 1px;
  background: var(--color-border-light);
  margin: var(--space-3) 0;
}

.platform-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-2);
}

.platform-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-3) var(--space-2);
  background: var(--color-bg-card);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.platform-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent 0%, rgba(0, 0, 0, 0.02) 100%);
  opacity: 0;
  transition: opacity 0.25s;
}

.platform-card:hover {
  border-color: var(--color-primary-light);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.platform-card:hover::before {
  opacity: 1;
}

.platform-card--active {
  border-color: var(--color-primary);
  background: linear-gradient(135deg, var(--color-primary-lighter) 0%, #fff 100%);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.platform-card--active .platform-card__icon {
  background: var(--platform-color);
  color: #fff;
}

.platform-card__icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg-page);
  border-radius: var(--radius-md);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.platform-card__initial {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-bold);
}

.platform-card__name {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.platform-card__badge {
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.3);
}

.config-mode-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}

.config-mode-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-2);
  background: var(--color-bg-card);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.config-mode-card:hover {
  border-color: var(--color-primary-light);
}

.config-mode-card--active {
  border-color: var(--color-primary);
  background: linear-gradient(135deg, var(--color-primary-lighter) 0%, #fff 100%);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.08);
}

.config-mode-card__icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

.config-mode-card__icon svg {
  width: 18px;
  height: 18px;
}

.config-mode-card__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: center;
}

.config-mode-card__title {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.config-mode-card__desc {
  font-size: var(--font-size-3xs);
  color: var(--color-text-secondary);
  line-height: 1.3;
}

.config-mode-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-3);
  background: var(--color-bg-card);
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.config-mode-card:hover {
  border-color: var(--color-primary-light);
  background: var(--color-bg-page);
}

.config-mode-card--active {
  border-color: var(--color-primary);
  background: linear-gradient(135deg, var(--color-primary-lighter) 0%, #fff 100%);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
}

.config-mode-card__icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-md);
  flex-shrink: 0;
}

.config-mode-card__icon svg {
  width: 22px;
  height: 22px;
}

.config-mode-card__icon--quick {
  background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
  color: var(--color-primary);
}

.config-mode-card__icon--smart {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  color: #d97706;
}

.config-mode-card__icon--custom {
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  color: #059669;
}

.config-mode-card__content {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  align-items: center;
}

.config-mode-card__title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.config-mode-card__desc {
  font-size: var(--font-size-2xs);
  color: var(--color-text-secondary);
  line-height: 1.4;
}

.config-mode-card__check {
  position: absolute;
  top: var(--space-1);
  right: var(--space-1);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}

.custom-config-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin-top: var(--space-3);
  padding: var(--space-3);
  background: var(--color-bg-page);
  border-radius: var(--radius-lg);
}

.config-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-3);
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.config-item__label {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
}

.config-hint {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-md);
  font-size: var(--font-size-2xs);
  line-height: 1.5;
}

.config-hint--embedded {
  background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
  border: 1px solid #93c5fd;
}

.config-hint--embedded .config-hint__text {
  color: #1e40af;
}

.config-hint--chrome-plugin {
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border: 1px solid #fcd34d;
}

.config-hint--chrome-plugin .config-hint__text {
  color: #92400e;
  margin: 0;
}

.config-hint__icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: inherit;
}

.config-hint__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.config-hint__text {
  margin: 0;
}

.config-hint__links {
  display: flex;
  gap: var(--space-3);
  margin: 0;
}

.config-hint__link {
  color: #d97706;
  text-decoration: none;
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-2xs);
  cursor: pointer;
  transition: opacity 0.2s;
}

.config-hint__link:hover {
  text-decoration: underline;
  opacity: 0.8;
}

.login-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-6) 0;
}

.login-status__loading,
.login-status__detecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.login-status__spinner-wrapper {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary-lighter) 0%, #dbeafe 100%);
  border-radius: 50%;
}

.login-status__spinner {
  animation: spin 1s linear infinite;
  color: var(--color-primary);
}

.login-status__icon-wrapper {
  width: 56px;
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.login-status__icon-wrapper--danger {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  color: var(--color-danger);
}

.login-status__icon-wrapper--warning {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  color: var(--color-warning);
}

.login-status__text {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.login-status__hint {
  font-size: var(--font-size-2xs);
  color: var(--color-text-secondary);
}

.login-status__error {
  font-size: var(--font-size-2xs);
  color: var(--color-danger);
  text-align: center;
  max-width: 280px;
  padding: var(--space-1) var(--space-3);
  background: var(--color-danger-light);
  border-radius: var(--radius-sm);
}

.login-status__progress {
  width: 200px;
}

.login-status__failed,
.login-status__timeout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
}

.login-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6) 0;
}

.login-success__icon-wrapper {
  width: 64px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  border-radius: 50%;
  color: var(--color-success);
}

.login-success__title {
  margin: 0;
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.login-success__desc {
  margin: 0;
  font-size: var(--font-size-xs);
  color: var(--color-text-secondary);
}

.config-hint--chrome-plugin .config-hint__text {
  color: #92400e;
  margin: 0;
}

.config-hint__icon {
  flex-shrink: 0;
  margin-top: 1px;
  color: inherit;
}

.config-hint__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.config-hint__text {
  margin: 0;
}

.config-hint__links {
  display: flex;
  gap: var(--space-4);
  margin: 0;
}

.config-hint__link {
  color: #d97706;
  text-decoration: none;
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
}

.config-hint__link:hover {
  text-decoration: underline;
  color: #b45309;
}

.config-preview-card {
  padding: var(--space-3);
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.config-preview-card__header {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin-bottom: var(--space-2);
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-secondary);
}

.config-preview-card__icon {
  width: 12px;
  height: 12px;
}

.config-preview-card__items {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-1) var(--space-4);
}

.config-preview-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}

.config-preview-item__label {
  font-size: var(--font-size-2xs);
  color: var(--color-text-secondary);
}

.config-preview-item__value {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-primary);
}

.config-preview-item__value.risk--low {
  color: var(--color-success);
}

.config-preview-item__value.risk--medium {
  color: var(--color-warning);
}

.config-preview-item__value.risk--high {
  color: var(--color-danger);
}

.risk-warning-banner {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  padding: var(--space-3);
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
  border: 1px solid #fcd34d;
  border-radius: var(--radius-md);
  margin-top: var(--space-3);
}

.risk-warning-banner__icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fbbf24;
  border-radius: var(--radius-sm);
  color: #fff;
  flex-shrink: 0;
}

.risk-warning-banner__content {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.risk-warning-banner__title {
  font-size: var(--font-size-2xs);
  font-weight: var(--font-weight-semibold);
  color: #92400e;
}

.risk-warning-banner__text {
  font-size: var(--font-size-2xs);
  color: #a16207;
  line-height: 1.4;
}

.login-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  padding: var(--space-10) 0;
}

.login-status__loading,
.login-status__detecting {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
}

.login-status__spinner-wrapper {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, var(--color-primary-lighter) 0%, #dbeafe 100%);
  border-radius: 50%;
}

.login-status__spinner {
  animation: spin 1s linear infinite;
  color: var(--color-primary);
}

.login-status__icon-wrapper {
  width: 80px;
  height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.login-status__icon-wrapper--danger {
  background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
  color: var(--color-danger);
}

.login-status__icon-wrapper--warning {
  background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
  color: var(--color-warning);
}

.login-status__text {
  font-size: var(--font-size-lg);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.login-status__hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.login-status__error {
  font-size: var(--font-size-sm);
  color: var(--color-danger);
  text-align: center;
  max-width: 300px;
  padding: var(--space-2) var(--space-4);
  background: var(--color-danger-light);
  border-radius: var(--radius-md);
}

.login-status__progress {
  width: 240px;
}

.login-status__failed,
.login-status__timeout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.login-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-10) 0;
}

.login-success__icon-wrapper {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
  border-radius: 50%;
  color: var(--color-success);
}

.login-success__title {
  margin: 0;
  font-size: var(--font-size-xl);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
}

.login-success__desc {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}

.browser-login-dialog__footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.smart-config-section {
  margin-top: var(--space-3);
}

.ai-analysis-panel {
  background: var(--color-bg-page);
  border: 1px solid var(--color-border-light);
  border-radius: var(--radius-lg);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.ai-analysis-panel__header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-semibold);
  color: var(--color-primary);
}

.ai-analysis-panel__icon {
  width: 18px;
  height: 18px;
}

.ai-analysis-panel__empty {
  font-size: var(--font-size-sm);
  color: var(--color-text-placeholder);
  text-align: center;
  padding: var(--space-3);
}

.ai-analysis-panel__label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  color: var(--color-text-secondary);
  margin-bottom: var(--space-1);
  display: block;
}

.ai-analysis-panel__risk-level {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ai-analysis-panel__risk-badge {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-semibold);
  padding: 2px 10px;
  border-radius: var(--radius-full);
}

.ai-analysis-panel__risk-badge--low {
  color: var(--color-success);
  background: var(--color-success-light);
}

.ai-analysis-panel__risk-badge--medium {
  color: var(--color-warning);
  background: var(--color-warning-light);
}

.ai-analysis-panel__risk-badge--high {
  color: var(--color-danger);
  background: var(--color-danger-light);
}

.ai-factor-list,
.ai-recommend-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-factor-item,
.ai-recommend-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--font-size-xs);
}

.ai-factor-item__key,
.ai-recommend-item__key {
  color: var(--color-text-placeholder);
}

.ai-factor-item__val {
  color: var(--color-text-primary);
  font-weight: var(--font-weight-medium);
}

.ai-recommend-item__val {
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
}

.ai-analysis-panel__prerequisite {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--font-size-xs);
  color: var(--color-warning);
}

.ai-analysis-panel__actions {
  padding-top: var(--space-2);
  border-top: 1px solid var(--color-border-light);
}
</style>
