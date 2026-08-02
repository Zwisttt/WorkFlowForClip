import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  JianyingExportService,
  jianyingSystemLifecycle,
} from '../../../electron/services/JianyingExportService';

describe.runIf(process.platform === 'darwin')('JianyingExportService lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('生成草稿前优雅关闭剪映', async () => {
    const running = vi.spyOn(jianyingSystemLifecycle, 'isEditorRunning')
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    const close = vi.spyOn(jianyingSystemLifecycle, 'closeEditor').mockReturnValue(true);

    const service = new JianyingExportService();
    await service.prepareForDraftGeneration();

    expect(close).toHaveBeenCalledOnce();
    expect(running).toHaveBeenCalledTimes(2);
  });

  it('启动剪映后等待 10 秒才允许搜索', async () => {
    vi.spyOn(jianyingSystemLifecycle, 'isEditorRunning')
      .mockReturnValueOnce(false)
      .mockReturnValue(true);
    const launchEditor = vi.spyOn(jianyingSystemLifecycle, 'launchEditor').mockReturnValue(true);

    const service = new JianyingExportService();
    let completed = false;
    const launch = service.launchEditorAndWait(10).then(() => { completed = true; });
    await vi.advanceTimersByTimeAsync(9_999);
    expect(completed).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await launch;
    expect(completed).toBe(true);
    expect(launchEditor).toHaveBeenCalledOnce();
  });
});
