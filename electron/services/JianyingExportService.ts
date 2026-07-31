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
  openWaitSeconds: number;
  exportWaitSeconds: number;
  homeWaitSeconds: number;
  stepPauseSeconds: number;
}

function settingsFile(): string {
  return path.join(app.getPath('userData'), 'automation-export-settings.json');
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
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        this.activeProcess = child;
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
          if (code === 0) resolve();
          else reject(new Error(stderr.trim() || `剪映导出 worker 退出码 ${code}`));
        });
      });
    } finally {
      fs.rmSync(payloadFile, { force: true });
    }
  }

  stop(): void {
    this.activeProcess?.kill();
    this.activeProcess = null;
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
