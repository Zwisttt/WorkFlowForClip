<template>
  <div class="automation-page">
    <nav class="automation-tabs">
      <router-link to="/publish/tasks">任务列表</router-link>
      <router-link to="/publish/drafts">草稿</router-link>
      <router-link to="/publish/video">视频发布</router-link>
      <router-link to="/publish/automation" class="automation-tabs__active">自动剪辑发布</router-link>
    </nav>

    <el-alert
      v-if="!desktopApiAvailable"
      title="当前是浏览器预览页面，无法调用剪映和本地文件"
      description="请关闭此网页，在项目目录执行 npm run dev，并使用自动打开的 MatrixFlow 桌面窗口。"
      type="error"
      show-icon
      :closable="false"
    />

    <header class="hero">
      <div>
        <div class="eyebrow">MATRIXFLOW AUTOMATION</div>
        <h1>自动剪辑发布</h1>
        <p>上传排期表，逐行生成剪映草稿、导出视频，并按账号与平台自动发布。</p>
      </div>
      <div class="hero__status">
        <span class="status-dot" :class="{ 'status-dot--ready': exportSettings.ready }" />
        {{ exportSettings.ready ? '剪映导出已标定' : '剪映导出待标定' }}
      </div>
    </header>

    <section class="flow-strip">
      <div
        v-for="(step, index) in flowSteps"
        :key="step"
        class="flow-step"
        :class="{ 'flow-step--active': index <= activeStep }"
      >
        <span>{{ String(index + 1).padStart(2, '0') }}</span>
        {{ step }}
      </div>
    </section>

    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>模板库</h2>
          <p>模板名对应 Excel 第一列。首期仅支持 1 个文字框、1–2 张图片和 1 段音频。</p>
        </div>
        <el-button type="primary" plain @click="registerTemplate">添加剪映模板</el-button>
      </div>
      <el-table :data="templates" empty-text="尚未登记模板" size="small">
        <el-table-column prop="name" label="模板名" min-width="160" />
        <el-table-column label="结构" width="230">
          <template #default="{ row }">
            文字 × 1 · 图片 × {{ row.imageSlotKeys.length }} · 音频 × 1
          </template>
        </el-table-column>
        <el-table-column prop="draftPath" label="剪映草稿目录" min-width="360" show-overflow-tooltip />
        <el-table-column label="" width="80" align="right">
          <template #default="{ row }">
            <el-button link type="danger" @click="removeTemplate(row)">移除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>任务输入</h2>
          <p>素材必须填写绝对路径；BGM 留空时会从公共音频目录随机选择。</p>
        </div>
        <el-button :loading="analyzing" type="primary" @click="analyzeWorkbook">
          解析并预检
        </el-button>
      </div>

      <div class="form-grid">
        <PathField
          v-model="form.filePath"
          label="Excel 排期表"
          placeholder="请选择 .xlsx 文件"
          button-text="选择表格"
          @browse="chooseExcel"
        />
        <PathField
          v-model="form.publicAudioDir"
          label="公共音频目录"
          placeholder="BGM 留空时使用，可包含子目录"
          @browse="chooseDirectory('publicAudioDir', '选择公共音频目录')"
        />
        <PathField
          v-model="form.draftOutputDir"
          label="剪映草稿输出目录"
          placeholder="请选择剪映草稿根目录"
          @browse="chooseDirectory('draftOutputDir', '选择剪映草稿输出目录')"
        />
        <PathField
          v-model="form.videoOutputDir"
          label="视频导出目录"
          placeholder="须与剪映导出设置一致"
          @browse="chooseDirectory('videoOutputDir', '选择视频导出目录')"
        />
      </div>

      <div class="timing-row">
        <label>
          <span>单条导出等待</span>
          <el-input-number v-model="form.exportWaitSeconds" :min="10" :max="1800" :step="10" />
          <small>秒</small>
        </label>
        <div class="timing-note">
          同账号撞期会自动顺延：抖音间隔 10 分钟，小红书间隔 15 分钟。
        </div>
      </div>
    </section>

    <section v-if="preview" class="panel">
      <div class="panel__header">
        <div>
          <h2>预检与账号映射</h2>
          <p>Sheet 名会自动精确匹配账号昵称，也可以手动改成一对多。</p>
        </div>
        <div class="summary-badges">
          <el-tag type="success">{{ validRowCount }} 行可执行</el-tag>
          <el-tag v-if="errorCount" type="danger">{{ errorCount }} 个错误</el-tag>
          <el-tag v-if="warningCount" type="warning">{{ warningCount }} 个提醒</el-tag>
        </div>
      </div>

      <div class="sheet-map">
        <div v-for="sheet in preview.sheets" :key="sheet.name" class="sheet-map__row">
          <div class="sheet-map__name">
            <strong>{{ sheet.name }}</strong>
            <span>{{ sheet.rowCount }} 行</span>
          </div>
          <el-select
            v-model="sheetMappings[sheet.name]"
            multiple
            collapse-tags
            collapse-tags-tooltip
            filterable
            placeholder="选择抖音/小红书账号"
          >
            <el-option
              v-for="account in eligibleAccounts"
              :key="account.id"
              :label="`${platformLabel(account.platform)} · ${account.name}`"
              :value="account.id"
              :disabled="!account.cookieValid || account.status !== 'active'"
            />
          </el-select>
        </div>
      </div>

      <el-table :data="preview.rows" size="small" max-height="360" class="preview-table">
        <el-table-column prop="sheetName" label="账号 Sheet" width="130" fixed />
        <el-table-column prop="rowNumber" label="行" width="60" />
        <el-table-column prop="templateName" label="模板" width="140" />
        <el-table-column prop="workName" label="作品名字" min-width="150" show-overflow-tooltip />
        <el-table-column prop="script" label="脚本" min-width="220" show-overflow-tooltip />
        <el-table-column label="发布时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.requestedScheduledAt) }}</template>
        </el-table-column>
        <el-table-column label="预检" width="90" align="center">
          <template #default="{ row }">
            <el-tag :type="rowIssues(row).some((item) => item.severity === 'error') ? 'danger' : 'success'">
              {{ rowIssues(row).some((item) => item.severity === 'error') ? '需处理' : '通过' }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="preview.issues.length" class="issue-list">
        <div
          v-for="(issue, index) in preview.issues"
          :key="`${issue.sheetName}-${issue.rowNumber}-${issue.field}-${index}`"
          class="issue"
          :class="`issue--${issue.severity}`"
        >
          <span>{{ issue.severity === 'error' ? '错误' : '提醒' }}</span>
          <strong>{{ issue.sheetName }} · 第 {{ issue.rowNumber }} 行 · {{ issue.field }}</strong>
          <p>{{ issue.message }}</p>
        </div>
      </div>

      <div class="start-bar">
        <div>
          <strong>逐行容错已开启</strong>
          <span>有问题的行会保存错误与发生时间，其余行继续执行。</span>
        </div>
        <el-button
          type="primary"
          size="large"
          :loading="starting"
          :disabled="validRowCount === 0"
          @click="startBatch"
        >
          确认并启动
        </el-button>
      </div>
    </section>

    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>剪映导出标定</h2>
          <p>依次定位 6 个控件。点击记录后有 3 秒时间把鼠标移到目标中心。</p>
        </div>
        <el-tag :type="exportSettings.ready ? 'success' : 'warning'">
          {{ exportSettings.ready ? '已完成' : '未完成' }}
        </el-tag>
      </div>
      <div class="coordinate-grid">
        <button
          v-for="coordinate in exportSettings.coordinates"
          :key="coordinate.key"
          class="coordinate-card"
          :class="{ 'coordinate-card--done': coordinate.x !== undefined }"
          :disabled="capturingCoordinate !== ''"
          @click="captureCoordinate(coordinate)"
        >
          <span>{{ coordinate.x === undefined ? '待记录' : `${coordinate.x}, ${coordinate.y}` }}</span>
          <strong>{{ coordinate.label }}</strong>
        </button>
      </div>
      <el-alert
        title="导出时请保持剪映在前台，不要移动鼠标或操作键盘；Windows 与 macOS 均可标定，正式交付以 Windows 为主。"
        type="warning"
        :closable="false"
        show-icon
      />
    </section>

    <section class="panel">
      <div class="panel__header">
        <div>
          <h2>批次与进度</h2>
          <p>任务状态和逐行错误会持久保存，应用重启后仍可查看与恢复。</p>
        </div>
        <el-button plain @click="refreshBatches">刷新</el-button>
      </div>

      <div v-if="liveProgress.visible" class="live-progress">
        <div>
          <strong>{{ liveProgress.message }}</strong>
          <span>{{ liveProgress.stage }}</span>
        </div>
        <el-progress :percentage="liveProgress.percent" :stroke-width="10" />
        <div class="progress-track"><i /></div>
      </div>

      <el-table :data="batches" size="small" empty-text="尚无自动化批次">
        <el-table-column label="创建时间" width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="sourceFile" label="Excel" min-width="230" show-overflow-tooltip />
        <el-table-column label="状态" width="140">
          <template #default="{ row }">
            <el-tag :type="batchStatusType(row.status)">{{ batchStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="进度" width="190">
          <template #default="{ row }"><el-progress :percentage="row.progress" /></template>
        </el-table-column>
        <el-table-column label="完成 / 失败" width="110">
          <template #default="{ row }">{{ row.completedItems }} / {{ row.failedItems }}</template>
        </el-table-column>
        <el-table-column label="" width="180" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="showBatch(row.id)">详情</el-button>
            <el-button
              v-if="row.status === 'awaiting_export_setup' || row.status === 'partial_failed'"
              link
              type="success"
              @click="resumeBatch(row.id)"
            >
              继续
            </el-button>
            <el-button
              v-if="row.status === 'running' || row.status === 'awaiting_export_setup'"
              link
              type="danger"
              @click="cancelBatch(row.id)"
            >
              取消
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="detailVisible" title="自动化批次详情" width="86%" destroy-on-close>
      <div v-if="batchDetail" class="detail-summary">
        <el-progress :percentage="batchDetail.batch.progress" />
        <span>{{ batchDetail.batch.completedItems }} 完成 · {{ batchDetail.batch.failedItems }} 失败</span>
      </div>
      <el-table v-if="batchDetail" :data="batchDetail.items" size="small" max-height="520">
        <el-table-column prop="sheetName" label="账号 Sheet" width="120" />
        <el-table-column prop="rowNumber" label="行" width="60" />
        <el-table-column prop="resolvedWorkName" label="作品名字" min-width="160" show-overflow-tooltip />
        <el-table-column prop="templateName" label="模板" width="130" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="itemStatusType(row.status)">{{ itemStatusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="账号计划" min-width="260">
          <template #default="{ row }">
            <div v-for="plan in row.accountPlans" :key="plan.accountId" class="account-plan">
              <span>{{ platformLabel(plan.platform) }} · {{ plan.accountName }}</span>
              <small>{{ formatTime(plan.scheduledAt) }} · {{ itemStatusLabel(plan.status) }}</small>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="报错 / 提醒" min-width="260">
          <template #default="{ row }">
            <div v-if="row.errorMessage" class="row-error">
              {{ row.errorMessage }}
              <small>{{ formatTime(row.errorAt) }}</small>
            </div>
            <div v-else-if="row.warningMessage" class="row-warning">{{ row.warningMessage }}</div>
            <span v-else>—</span>
          </template>
        </el-table-column>
        <el-table-column label="" width="80" align="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'failed'"
              link
              type="primary"
              @click="retryItem(row.id)"
            >
              重试
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ElButton, ElInput, ElMessage, ElMessageBox } from 'element-plus';

type CoordinateKey = 'search' | 'result' | 'export' | 'confirm' | 'close' | 'home';

interface Template {
  id: string;
  name: string;
  draftPath: string;
  imageSlotKeys: string[];
}

interface Account {
  id: string;
  name: string;
  platform: string;
  cookieValid: boolean;
  status: string;
}

interface Issue {
  sheetName: string;
  rowNumber: number;
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

interface Preview {
  sheets: Array<{ name: string; rowCount: number; matchedAccounts: Account[] }>;
  rows: any[];
  issues: Issue[];
  canStart: boolean;
}

interface Coordinate {
  key: CoordinateKey;
  label: string;
  x?: number;
  y?: number;
}

const PathField = defineComponent({
  props: {
    modelValue: { type: String, default: '' },
    label: { type: String, required: true },
    placeholder: { type: String, default: '' },
    buttonText: { type: String, default: '选择目录' },
  },
  emits: ['update:modelValue', 'browse'],
  setup(props, { emit }) {
    return () => h('label', { class: 'path-field' }, [
      h('span', props.label),
      h('div', { class: 'path-field__control' }, [
        h(ElInput, {
          modelValue: props.modelValue,
          placeholder: props.placeholder,
          'onUpdate:modelValue': (value: string) => emit('update:modelValue', value),
        }),
        h(ElButton, { onClick: () => emit('browse') }, () => props.buttonText),
      ]),
    ]);
  },
});

const flowSteps = ['导入表格', '校验排期', '生成草稿', '剪映导出', '自动发布'];
const activeStep = ref(0);
const desktopApiAvailable = ref(Boolean(window.matrixflow));
const templates = ref<Template[]>([]);
const eligibleAccounts = ref<Account[]>([]);
const preview = ref<Preview | null>(null);
const sheetMappings = reactive<Record<string, string[]>>({});
const analyzing = ref(false);
const starting = ref(false);
const capturingCoordinate = ref('');
const batches = ref<any[]>([]);
const batchDetail = ref<any | null>(null);
const detailVisible = ref(false);
const exportSettings = reactive<{ coordinates: Coordinate[]; ready: boolean }>({
  coordinates: [],
  ready: false,
});
const liveProgress = reactive({
  visible: false,
  batchId: '',
  stage: '',
  message: '等待任务',
  percent: 0,
});
const form = reactive({
  filePath: '',
  publicAudioDir: '',
  draftOutputDir: '/Users/mac/Movies/JianyingPro/User Data/Projects/com.lveditor.draft',
  videoOutputDir: '',
  exportWaitSeconds: 90,
});
let pollingTimer: ReturnType<typeof setInterval> | undefined;
let unsubscribeProgress: (() => void) | undefined;

const errorCount = computed(() =>
  preview.value?.issues.filter((issue) => issue.severity === 'error').length ?? 0
);
const warningCount = computed(() =>
  preview.value?.issues.filter((issue) => issue.severity === 'warning').length ?? 0
);
const validRowCount = computed(() =>
  preview.value?.rows.filter((row) =>
    !preview.value?.issues.some((issue) =>
      issue.severity === 'error'
      && issue.sheetName === row.sheetName
      && issue.rowNumber === row.rowNumber
    )
  ).length ?? 0
);

function unwrap<T>(result: { success: boolean; data?: T; message?: string }, fallback: T): T {
  if (!result.success) throw new Error(result.message || '操作失败');
  return result.data ?? fallback;
}

function getMatrixFlow() {
  if (!window.matrixflow) {
    throw new Error('当前页面未连接 MatrixFlow 桌面主进程，请使用 npm run dev 自动打开的桌面窗口');
  }
  return window.matrixflow;
}

async function loadTemplates(showError = false): Promise<boolean> {
  try {
    templates.value = unwrap(await getMatrixFlow().automation.listTemplates(), []);
    return true;
  } catch (error) {
    templates.value = [];
    if (showError) {
      ElMessage.error(`模板加载失败：${error instanceof Error ? error.message : String(error)}`);
    }
    return false;
  }
}

async function loadAccounts() {
  const result = await getMatrixFlow().account.list();
  eligibleAccounts.value = unwrap(result, []).filter((account: Account) =>
    ['douyin', 'xiaohongshu'].includes(account.platform)
  );
}

async function loadExportSettings() {
  const value = unwrap(await getMatrixFlow().automation.getExportSettings(), {
    coordinates: [],
    ready: false,
  });
  exportSettings.coordinates = value.coordinates;
  exportSettings.ready = value.ready;
}

async function chooseExcel() {
  const value = await getMatrixFlow().dialog.openFile({
    title: '选择自动化剪辑发布表格',
    properties: ['openFile'],
    filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
  });
  if (typeof value === 'string') form.filePath = value;
}

async function chooseDirectory(key: 'publicAudioDir' | 'draftOutputDir' | 'videoOutputDir', title: string) {
  const value = await getMatrixFlow().dialog.openFile({
    title,
    properties: ['openDirectory', 'createDirectory'],
  });
  if (typeof value === 'string') form[key] = value;
}

async function registerTemplate() {
  try {
    const template = unwrap(await getMatrixFlow().automation.chooseTemplate(), null);
    if (!template) return;
    const loaded = await loadTemplates(true);
    if (!loaded) return;
    ElMessage.success('模板已解析并登记');
  } catch (error) {
    ElMessage.error(`模板导入失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function removeTemplate(template: Template) {
  await ElMessageBox.confirm(`移除模板“${template.name}”？不会删除原剪映草稿。`, '移除模板');
  unwrap(await getMatrixFlow().automation.deleteTemplate(template.id), false);
  await loadTemplates();
}

async function analyzeWorkbook() {
  if (!form.filePath) {
    ElMessage.warning('请先选择 Excel 排期表');
    return;
  }
  analyzing.value = true;
  try {
    const result = unwrap<Preview>(await getMatrixFlow().automation.analyze(form.filePath), null as never);
    preview.value = result;
    activeStep.value = 1;
    for (const sheet of result.sheets) {
      sheetMappings[sheet.name] = sheet.matchedAccounts.map((account) => account.id);
    }
    ElMessage.success(`已读取 ${result.sheets.length} 个 Sheet、${result.rows.length} 行任务`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    analyzing.value = false;
  }
}

async function startBatch() {
  if (!preview.value) return;
  const unmapped = preview.value.sheets.filter((sheet) => !sheetMappings[sheet.name]?.length);
  if (unmapped.length) {
    ElMessage.error(`请为 Sheet“${unmapped.map((item) => item.name).join('、')}”选择账号`);
    return;
  }
  if (!form.videoOutputDir) {
    ElMessage.error('请选择视频导出目录，并确保与剪映导出设置一致');
    return;
  }
  await ElMessageBox.confirm(
    `将逐行执行 ${validRowCount.value} 条可用任务。执行剪映导出期间，程序会占用鼠标和键盘；请保持剪映在前台、电脑不休眠、账号登录有效。是否启动？`,
    '启动自动剪辑发布',
    { type: 'warning', confirmButtonText: '确认启动', cancelButtonText: '再检查一下' },
  );
  starting.value = true;
  try {
    const detail = unwrap(await getMatrixFlow().automation.start({
      filePath: form.filePath,
      publicAudioDir: form.publicAudioDir,
      draftOutputDir: form.draftOutputDir,
      videoOutputDir: form.videoOutputDir,
      exportWaitSeconds: form.exportWaitSeconds,
      sheetMappings: preview.value.sheets.map((sheet) => ({
        sheetName: sheet.name,
        accountIds: [...(sheetMappings[sheet.name] ?? [])],
      })),
    }), null);
    liveProgress.visible = true;
    liveProgress.batchId = detail?.batch?.id ?? '';
    liveProgress.percent = detail?.batch?.progress ?? 0;
    liveProgress.stage = 'queued';
    liveProgress.message = '批次已启动，正在逐行生成剪映草稿';
    activeStep.value = 2;
    await refreshBatches();
    ElMessage.success('自动化批次已启动');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    starting.value = false;
  }
}

async function captureCoordinate(coordinate: Coordinate) {
  await ElMessageBox.alert(
    `关闭提示后有 3 秒，请把鼠标移动到“${coordinate.label}”中心并保持不动。`,
    '记录剪映坐标',
    { confirmButtonText: '开始倒计时' },
  );
  capturingCoordinate.value = coordinate.key;
  try {
    const value = unwrap(await getMatrixFlow().automation.captureCoordinate(coordinate.key), null as never);
    exportSettings.coordinates = value.coordinates;
    exportSettings.ready = value.ready;
    ElMessage.success(`已记录：${coordinate.label}`);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : String(error));
  } finally {
    capturingCoordinate.value = '';
  }
}

async function refreshBatches() {
  try {
    batches.value = unwrap(await getMatrixFlow().automation.listBatches(), []);
    const active = batches.value.find((batch) => batch.id === liveProgress.batchId);
    if (active) liveProgress.percent = active.progress;
    if (detailVisible.value && batchDetail.value?.batch?.id) {
      await showBatch(batchDetail.value.batch.id, false);
    }
  } catch {
    // Polling is best effort while the app is shutting down.
  }
}

async function showBatch(id: string, open = true) {
  batchDetail.value = unwrap(await getMatrixFlow().automation.getBatch(id), null);
  if (open) detailVisible.value = true;
}

async function resumeBatch(id: string) {
  unwrap(await getMatrixFlow().automation.resumeBatch(id), null);
  liveProgress.visible = true;
  liveProgress.batchId = id;
  liveProgress.message = '批次已继续';
  await refreshBatches();
}

async function retryItem(id: string) {
  unwrap(await getMatrixFlow().automation.retryItem(id), null);
  ElMessage.success('已重新加入处理队列');
  await refreshBatches();
}

async function cancelBatch(id: string) {
  await ElMessageBox.confirm('确定取消该批次？已生成的草稿与视频不会删除。', '取消批次', {
    type: 'warning',
  });
  unwrap(await getMatrixFlow().automation.cancelBatch(id), null);
  await refreshBatches();
}

function rowIssues(row: any): Issue[] {
  return preview.value?.issues.filter((issue) =>
    issue.sheetName === row.sheetName && issue.rowNumber === row.rowNumber
  ) ?? [];
}

function platformLabel(platform: string): string {
  return platform === 'douyin' ? '抖音' : platform === 'xiaohongshu' ? '小红书' : platform;
}

function formatTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false });
}

const itemLabels: Record<string, string> = {
  validation_failed: '校验失败',
  ready: '待处理',
  generating: '生成草稿',
  draft_ready: '草稿就绪',
  exporting: '剪映导出',
  video_ready: '视频就绪',
  scheduling: '设置排期',
  scheduled: '已排期',
  publishing: '发布中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

function itemStatusLabel(status: string): string {
  return itemLabels[status] ?? status;
}

function itemStatusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'completed') return 'success';
  if (status === 'failed' || status === 'validation_failed') return 'danger';
  if (status === 'cancelled') return 'info';
  return 'warning';
}

function batchStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    validated: '已校验',
    running: '执行中',
    awaiting_export_setup: '等待标定',
    completed: '已完成',
    partial_failed: '部分失败',
    cancelled: '已取消',
  };
  return labels[status] ?? status;
}

function batchStatusType(status: string): '' | 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'completed') return 'success';
  if (status === 'partial_failed') return 'danger';
  if (status === 'cancelled') return 'info';
  return 'warning';
}

onMounted(async () => {
  if (!window.matrixflow) {
    desktopApiAvailable.value = false;
    return;
  }
  desktopApiAvailable.value = true;
  await Promise.allSettled([loadTemplates(true), loadAccounts(), loadExportSettings(), refreshBatches()]);
  unsubscribeProgress = getMatrixFlow().on('automation:progress', (payload: any) => {
    liveProgress.visible = true;
    liveProgress.batchId = payload.batchId;
    liveProgress.stage = payload.stage;
    liveProgress.message = payload.message;
    if (payload.stage === 'generate') activeStep.value = 2;
    if (payload.stage === 'export') activeStep.value = 3;
    if (payload.stage === 'publish') activeStep.value = 4;
    void refreshBatches();
  });
  pollingTimer = setInterval(refreshBatches, 4_000);
});

onBeforeUnmount(() => {
  if (pollingTimer) clearInterval(pollingTimer);
  unsubscribeProgress?.();
});
</script>

<style scoped>
.automation-page {
  --blue: #2563eb;
  --ink: #172033;
  --muted: #667085;
  display: grid;
  gap: 18px;
  padding: 22px 26px 48px;
  color: var(--ink);
}

.automation-tabs {
  display: flex;
  gap: 6px;
  padding: 4px;
  justify-self: start;
  background: #eef2f7;
  border-radius: 9px;
}

.automation-tabs a {
  padding: 7px 12px;
  color: #667085;
  font-size: 13px;
  text-decoration: none;
  border-radius: 7px;
}

.automation-tabs__active {
  color: #1d4ed8 !important;
  font-weight: 650;
  background: white;
  box-shadow: 0 1px 3px rgba(16, 24, 40, .08);
}

.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  min-height: 148px;
  padding: 30px 34px;
  overflow: hidden;
  color: white;
  border-radius: 16px;
  background:
    radial-gradient(circle at 88% 20%, rgba(255, 255, 255, .22), transparent 24%),
    linear-gradient(125deg, #1d4ed8, #2563eb 52%, #3b82f6);
  box-shadow: 0 18px 40px rgba(37, 99, 235, .2);
}

.eyebrow {
  margin-bottom: 9px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .18em;
  opacity: .75;
}

.hero h1 {
  margin: 0;
  font-size: 31px;
}

.hero p {
  margin: 9px 0 0;
  opacity: .82;
}

.hero__status {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 10px 14px;
  font-size: 13px;
  background: rgba(9, 30, 66, .2);
  border: 1px solid rgba(255, 255, 255, .22);
  border-radius: 999px;
  backdrop-filter: blur(8px);
}

.status-dot {
  width: 8px;
  height: 8px;
  background: #fbbf24;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(251, 191, 36, .18);
}

.status-dot--ready {
  background: #34d399;
  box-shadow: 0 0 0 4px rgba(52, 211, 153, .18);
}

.flow-strip {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  padding: 14px 18px;
  background: white;
  border: 1px solid #e7eaf0;
  border-radius: 14px;
}

.flow-step {
  position: relative;
  display: flex;
  gap: 9px;
  align-items: center;
  justify-content: center;
  color: #98a2b3;
  font-size: 13px;
}

.flow-step:not(:last-child)::after {
  position: absolute;
  right: -10px;
  width: 20px;
  height: 1px;
  content: '';
  background: #d0d5dd;
}

.flow-step span {
  color: #98a2b3;
  font-size: 10px;
  font-weight: 800;
}

.flow-step--active {
  color: var(--blue);
  font-weight: 650;
}

.flow-step--active span {
  color: var(--blue);
}

.panel {
  padding: 22px;
  background: white;
  border: 1px solid #e7eaf0;
  border-radius: 14px;
  box-shadow: 0 8px 26px rgba(16, 24, 40, .04);
}

.panel__header {
  display: flex;
  gap: 24px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 18px;
}

.panel h2 {
  margin: 0 0 5px;
  font-size: 18px;
}

.panel p {
  margin: 0;
  color: var(--muted);
  font-size: 13px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px 22px;
}

:deep(.path-field) {
  display: grid;
  gap: 7px;
  color: #344054;
  font-size: 13px;
  font-weight: 600;
}

:deep(.path-field__control) {
  display: flex;
  gap: 8px;
}

.timing-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid #eef0f4;
}

.timing-row label {
  display: flex;
  gap: 10px;
  align-items: center;
  color: #344054;
  font-size: 13px;
  font-weight: 600;
}

.timing-row small,
.timing-note {
  color: var(--muted);
  font-size: 12px;
}

.summary-badges {
  display: flex;
  gap: 8px;
}

.sheet-map {
  display: grid;
  gap: 10px;
  margin-bottom: 18px;
}

.sheet-map__row {
  display: grid;
  grid-template-columns: 200px minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  padding: 13px 15px;
  background: #f8fafc;
  border: 1px solid #edf0f5;
  border-radius: 10px;
}

.sheet-map__name {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.sheet-map__name span {
  color: var(--muted);
  font-size: 12px;
}

.issue-list {
  display: grid;
  gap: 8px;
  max-height: 230px;
  margin-top: 16px;
  overflow: auto;
}

.issue {
  display: grid;
  grid-template-columns: 46px 250px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 9px 12px;
  border-left: 3px solid;
  border-radius: 6px;
  font-size: 12px;
}

.issue p {
  font-size: 12px;
}

.issue--error {
  background: #fff6f5;
  border-color: #f04438;
}

.issue--warning {
  background: #fffaeb;
  border-color: #f79009;
}

.start-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20px;
  padding: 17px 18px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
}

.start-bar div {
  display: grid;
  gap: 4px;
}

.start-bar span {
  color: var(--muted);
  font-size: 12px;
}

.coordinate-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.coordinate-card {
  display: grid;
  gap: 4px;
  padding: 14px;
  color: #344054;
  text-align: left;
  cursor: pointer;
  background: #f8fafc;
  border: 1px solid #e4e7ec;
  border-radius: 10px;
}

.coordinate-card:hover {
  border-color: #93c5fd;
}

.coordinate-card span {
  color: #98a2b3;
  font-size: 11px;
}

.coordinate-card--done {
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.coordinate-card--done span {
  color: #16a34a;
}

.live-progress {
  display: grid;
  grid-template-columns: 250px minmax(220px, 1fr) 90px;
  gap: 20px;
  align-items: center;
  margin-bottom: 16px;
  padding: 15px;
  overflow: hidden;
  background: #f8fafc;
  border-radius: 10px;
}

.live-progress > div:first-child {
  display: grid;
  gap: 3px;
}

.live-progress span {
  color: var(--muted);
  font-size: 11px;
}

.progress-track {
  height: 4px;
  overflow: hidden;
  background: #dbeafe;
  border-radius: 999px;
}

.progress-track i {
  display: block;
  width: 44%;
  height: 100%;
  background: linear-gradient(90deg, transparent, #3b82f6, transparent);
  animation: progress-scan 1.35s linear infinite;
}

@keyframes progress-scan {
  from { transform: translateX(-110%); }
  to { transform: translateX(250%); }
}

.detail-summary {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 20px;
  align-items: center;
  margin-bottom: 16px;
}

.account-plan {
  display: grid;
  gap: 2px;
  margin: 3px 0;
}

.account-plan small,
.row-error small {
  display: block;
  color: #98a2b3;
}

.row-error {
  color: #d92d20;
  white-space: pre-line;
}

.row-warning {
  color: #b54708;
  white-space: pre-line;
}

@media (max-width: 980px) {
  .form-grid,
  .coordinate-grid {
    grid-template-columns: 1fr;
  }

  .hero {
    align-items: flex-start;
    flex-direction: column;
    gap: 20px;
  }
}
</style>
