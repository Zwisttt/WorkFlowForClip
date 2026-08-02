import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import type {
  AutomationCoordinate,
  AutomationExportSettings,
} from './types/automation';

const COORDINATES: Array<{ key: AutomationCoordinate['key']; label: string }> = [
  { key: 'search', label: '主页搜索框' },
  { key: 'result', label: '搜索结果中的草稿卡片' },
  { key: 'export', label: '剪辑页右上角“导出”按钮' },
  { key: 'confirm', label: '导出窗口“导出”确认按钮' },
  { key: 'close', label: '导出完成后的“关闭”按钮' },
  { key: 'home', label: '返回剪映首页按钮' },
];

interface PythonCommand {
  executable: string;
  prefixArgs: string[];
}

interface ExportOneOptions {
  draftName: string;
  clearPreviousSearch?: boolean;
  openWaitSeconds: number;
  exportWaitSeconds: number;
  homeWaitSeconds: number;
  stepPauseSeconds: number;
}

interface ExportWorkerRecord {
  pid: number;
  workerPath: string;
  startedAt: string;
}

const JIANYING_PROCESS_NAME_MAC = 'VideoFusion-macOS';
const JIANYING_PROCESS_NAME_WINDOWS = 'JianyingPro.exe';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findWindowsEditorExecutable(): string | undefined {
  const candidates = [
    path.join(process.env.LOCALAPPDATA ?? '', 'JianyingPro', 'Apps', 'JianyingPro.exe'),
    path.join(process.env.LOCALAPPDATA ?? '', 'JianyingPro', 'JianyingPro.exe'),
    path.join(process.env.ProgramFiles ?? '', 'JianyingPro', 'JianyingPro.exe'),
  ].filter(Boolean);
  const appsDirectory = path.join(process.env.LOCALAPPDATA ?? '', 'JianyingPro', 'Apps');
  if (fs.existsSync(appsDirectory)) {
    for (const entry of fs.readdirSync(appsDirectory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      candidates.push(path.join(appsDirectory, entry.name, 'JianyingPro.exe'));
    }
  }
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export const jianyingSystemLifecycle = {
  isEditorRunning(): boolean {
    if (process.platform === 'darwin') {
      return spawnSync('pgrep', ['-x', JIANYING_PROCESS_NAME_MAC], {
        stdio: 'ignore',
        timeout: 5_000,
      }).status === 0;
    }
    if (process.platform === 'win32') {
      const result = spawnSync(
        'tasklist.exe',
        ['/FI', `IMAGENAME eq ${JIANYING_PROCESS_NAME_WINDOWS}`, '/NH'],
        { encoding: 'utf8', timeout: 5_000, windowsHide: true },
      );
      return result.status === 0
        && String(result.stdout).toLocaleLowerCase().includes(JIANYING_PROCESS_NAME_WINDOWS.toLocaleLowerCase());
    }
    return false;
  },

  closeEditor(): boolean {
    if (process.platform === 'darwin') {
      const result = spawnSync(
        'osascript',
        ['-e', 'tell application id "com.lemon.lvpro" to quit'],
        { encoding: 'utf8', timeout: 10_000 },
      );
      return !result.error && result.status === 0;
    }
    if (process.platform === 'win32') {
      const script = '$process = Get-Process JianyingPro -ErrorAction SilentlyContinue; '
        + 'if ($process) { $null = $process.CloseMainWindow() }';
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { encoding: 'utf8', timeout: 10_000, windowsHide: true },
      );
      return !result.error && result.status === 0;
    }
    return false;
  },

  launchEditor(): boolean {
    if (process.platform === 'darwin') {
      const applicationPath = '/Applications/VideoFusion-macOS.app';
      const result = spawnSync(
        'open',
        fs.existsSync(applicationPath) ? ['-a', applicationPath] : ['-b', 'com.lemon.lvpro'],
        { encoding: 'utf8', timeout: 10_000 },
      );
      return !result.error && result.status === 0;
    }
    if (process.platform === 'win32') {
      const executable = findWindowsEditorExecutable();
      if (!executable) return false;
      const child = spawn(executable, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      child.unref();
      return true;
    }
    return false;
  },
};

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'automation-export-settings.json');
}

function workerRecordFile(): string {
  return path.join(app.getPath('userData'), 'automation-export-worker.json');
}

function workerFile(): string {
  const development = path.join(process.cwd(), 'electron', 'automation', 'python', 'export_worker.py');
  if (fs.existsSync(development)) return development;
  return path.join(__dirname, '..', 'automation', 'python', 'export_worker.py');
}

function parseLastJsonLine(output: string): Record<string, any> {
  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]) as Record<string, any>;
    } catch {
      // continue
    }
  }
  throw new Error(output.trim() || '自动化 worker 未返回结果');
}

export class JianyingExportService {
  private activeProcess: ChildProcess | null = null;

  isEditorRunning(): boolean {
    return jianyingSystemLifecycle.isEditorRunning();
  }

  async prepareForDraftGeneration(): Promise<void> {
    this.stop();
    if (!this.isEditorRunning()) return;

    if (!jianyingSystemLifecycle.closeEditor()) {
      throw new Error('无法关闭剪映，请保存当前项目并手动退出剪映后重试');
    }

    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (!this.isEditorRunning()) return;
      await delay(500);
    }
    throw new Error('剪映仍在运行，可能有未保存项目；请保存并退出剪映后点击继续');
  }

  async launchEditorAndWait(waitSeconds = 10): Promise<void> {
    if (!this.isEditorRunning() && !jianyingSystemLifecycle.launchEditor()) {
      throw new Error('没有找到剪映专业版，请手动打开剪映后点击继续');
    }
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (this.isEditorRunning()) {
        await delay(Math.max(0, waitSeconds) * 1_000);
        return;
      }
      await delay(500);
    }
    throw new Error('剪映启动失败，请手动打开剪映后点击继续');
  }

  getSettings(): AutomationExportSettings {
    let saved: Record<string, { x: number; y: number }> = {};
    try {
      saved = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as Record<string, { x: number; y: number }>;
    } catch {
      saved = {};
    }
    const coordinates = COORDINATES.map(({ key, label }) => ({
      key,
      label,
      x: saved[key]?.x,
      y: saved[key]?.y,
    }));
    return {
      coordinates,
      ready: coordinates.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y)),
    };
  }

  async captureCoordinate(key: AutomationCoordinate['key']): Promise<AutomationExportSettings> {
    if (!COORDINATES.some((item) => item.key === key)) throw new Error(`未知坐标项：${key}`);
    const python = this.findPython();
    const result = spawnSync(
      python.executable,
      [...python.prefixArgs, workerFile(), 'capture', '3'],
      { encoding: 'utf8', timeout: 15_000 },
    );
    if (result.error) throw result.error;
    const payload = parseLastJsonLine(result.stdout || result.stderr);
    if (payload.event !== 'captured') {
      throw new Error(String(payload.message || result.stderr || '坐标记录失败'));
    }

    const current = this.getSettings();
    const saved = Object.fromEntries(
      current.coordinates
        .filter((item) => item.x !== undefined && item.y !== undefined)
        .map((item) => [item.key, { x: item.x!, y: item.y! }]),
    );
    saved[key] = { x: Number(payload.x), y: Number(payload.y) };
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(saved, null, 2), 'utf8');
    return this.getSettings();
  }

  async checkReady(): Promise<void> {
    if (!this.getSettings().ready) throw new Error('请先完成 6 个剪映坐标标定');
    const python = this.findPython();
    const result = spawnSync(
      python.executable,
      [...python.prefixArgs, workerFile(), 'check'],
      { encoding: 'utf8', timeout: 15_000 },
    );
    if (result.status !== 0) {
      const payload = parseLastJsonLine(`${result.stdout}\n${result.stderr}`);
      throw new Error(String(payload.message || 'Python 自动化环境不可用'));
    }
  }

  async exportOne(
    options: ExportOneOptions,
    onProgress?: (stage: string, message: string) => void,
  ): Promise<void> {
    await this.checkReady();
    const coordinates = Object.fromEntries(
      this.getSettings().coordinates.map((item) => [
        item.key,
        { x: item.x, y: item.y },
      ]),
    );
    const payloadFile = path.join(
      os.tmpdir(),
      `matrixflow-export-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    fs.writeFileSync(payloadFile, JSON.stringify({ ...options, coordinates }), 'utf8');

    const python = this.findPython();
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn(
          python.executable,
          [...python.prefixArgs, workerFile(), 'export-one', payloadFile],
          {
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: process.platform !== 'win32',
          },
        );
        this.activeProcess = child;
        if (child.pid) this.writeWorkerRecord(child.pid);
        let buffer = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            try {
              const event = JSON.parse(line) as { event: string; stage?: string; message?: string };
              if (event.event === 'progress') onProgress?.(event.stage ?? 'export', event.message ?? '');
              if (event.event === 'error') reject(new Error(event.message || '剪映导出失败'));
            } catch {
              // Ignore non-JSON diagnostics from Python dependencies.
            }
          }
        });
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.on('error', reject);
        child.on('close', (code) => {
          this.activeProcess = null;
          if (child.pid) this.clearWorkerRecord(child.pid);
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || `剪映导出 worker 退出码 ${code}`));
        });
      });
    } finally {
      fs.rmSync(payloadFile, { force: true });
    }
  }

  stop(): boolean {
    const pids = new Set<number>(this.findWorkerPids());
    if (this.activeProcess?.pid) pids.add(this.activeProcess.pid);
    const tracked = this.readWorkerRecord();
    if (tracked && this.isWorkerProcess(tracked)) pids.add(tracked.pid);

    let stopped = false;
    for (const pid of pids) {
      stopped = this.killProcessTree(pid) || stopped;
    }
    this.activeProcess = null;
    this.clearWorkerRecord();
    return stopped;
  }

  private findWorkerPids(): number[] {
    const targetWorker = workerFile();
    if (process.platform === 'win32') {
      const escapedPath = targetWorker.replace(/'/g, "''");
      const command = `$workerPath = '${escapedPath}'; `
        + 'Get-CimInstance Win32_Process | '
        + "Where-Object { $_.CommandLine -and $_.CommandLine.Contains($workerPath) -and $_.CommandLine.Contains('export-one') } | "
        + 'ForEach-Object { $_.ProcessId }';
      const result = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', command],
        { encoding: 'utf8', timeout: 10_000, windowsHide: true },
      );
      if (result.status !== 0) return [];
      return String(result.stdout)
        .split(/\r?\n/)
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
    }

    const result = spawnSync(
      'ps',
      ['-ax', '-o', 'pid=,command='],
      { encoding: 'utf8', timeout: 5_000 },
    );
    if (result.status !== 0) return [];
    return String(result.stdout)
      .split(/\r?\n/)
      .flatMap((line) => {
        const match = line.match(/^\s*(\d+)\s+(.+)$/);
        if (!match || !match[2].includes(targetWorker) || !match[2].includes('export-one')) {
          return [];
        }
        return [Number(match[1])];
      });
  }

  private writeWorkerRecord(pid: number): void {
    const record: ExportWorkerRecord = {
      pid,
      workerPath: workerFile(),
      startedAt: new Date().toISOString(),
    };
    fs.mkdirSync(path.dirname(workerRecordFile()), { recursive: true });
    fs.writeFileSync(workerRecordFile(), JSON.stringify(record, null, 2), 'utf8');
  }

  private readWorkerRecord(): ExportWorkerRecord | null {
    try {
      const value = JSON.parse(fs.readFileSync(workerRecordFile(), 'utf8')) as ExportWorkerRecord;
      return Number.isInteger(value.pid) && value.pid > 0 && typeof value.workerPath === 'string'
        ? value
        : null;
    } catch {
      return null;
    }
  }

  private clearWorkerRecord(expectedPid?: number): void {
    if (expectedPid !== undefined) {
      const current = this.readWorkerRecord();
      if (current && current.pid !== expectedPid) return;
    }
    fs.rmSync(workerRecordFile(), { force: true });
  }

  private isWorkerProcess(record: ExportWorkerRecord): boolean {
    if (record.workerPath !== workerFile()) return false;
    if (this.activeProcess?.pid === record.pid) return true;
    if (process.platform === 'win32') {
      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId = ${record.pid}").CommandLine`,
        ],
        { encoding: 'utf8', timeout: 5_000, windowsHide: true },
      );
      return result.status === 0
        && String(result.stdout).includes(record.workerPath)
        && String(result.stdout).includes('export-one');
    }
    const result = spawnSync(
      'ps',
      ['-p', String(record.pid), '-o', 'command='],
      { encoding: 'utf8', timeout: 5_000 },
    );
    return result.status === 0
      && String(result.stdout).includes(record.workerPath)
      && String(result.stdout).includes('export-one');
  }

  private killProcessTree(pid: number): boolean {
    if (process.platform === 'win32') {
      const result = spawnSync(
        'taskkill',
        ['/PID', String(pid), '/T', '/F'],
        { encoding: 'utf8', timeout: 10_000, windowsHide: true },
      );
      return result.status === 0;
    }
    try {
      process.kill(-pid, 'SIGTERM');
      return true;
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
        return true;
      } catch {
        return false;
      }
    }
  }

  private findPython(): PythonCommand {
    const candidates: PythonCommand[] = process.platform === 'win32'
      ? [
          { executable: 'py', prefixArgs: ['-3'] },
          { executable: 'python', prefixArgs: [] },
          { executable: 'python3', prefixArgs: [] },
        ]
      : [
          { executable: 'python3', prefixArgs: [] },
          { executable: 'python', prefixArgs: [] },
        ];
    for (const candidate of candidates) {
      const result = spawnSync(
        candidate.executable,
        [...candidate.prefixArgs, '--version'],
        { encoding: 'utf8', timeout: 5_000 },
      );
      if (!result.error && result.status === 0) return candidate;
    }
    throw new Error('未找到 Python 3，无法控制剪映自动导出');
  }
}

export const jianyingExportService = new JianyingExportService();
