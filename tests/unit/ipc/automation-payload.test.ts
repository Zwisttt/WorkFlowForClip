import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { createCloneSafeAutomationStartRequest } from '../../../electron/ipc/automation-payload';
import type { AutomationStartRequest } from '../../../electron/services/types/automation';

describe('createCloneSafeAutomationStartRequest', () => {
  it('把 Vue Proxy 请求转换为 Electron IPC 可克隆的普通对象', () => {
    const request = reactive<AutomationStartRequest>({
      filePath: '/tmp/tasks.xlsx',
      publicAudioDir: '/tmp/audio',
      draftOutputDir: '/tmp/drafts',
      videoOutputDir: '/tmp/videos',
      openWaitSeconds: 10,
      exportWaitSeconds: 12,
      homeWaitSeconds: 5,
      stepPauseSeconds: 1,
      sheetMappings: [{
        sheetName: '测试账号',
        accountIds: ['account-1', 'account-2'],
      }],
    });

    expect(() => structuredClone(request)).toThrow();

    const cloneSafe = createCloneSafeAutomationStartRequest(request);

    expect(() => structuredClone(cloneSafe)).not.toThrow();
    expect(cloneSafe).toEqual({
      filePath: '/tmp/tasks.xlsx',
      publicAudioDir: '/tmp/audio',
      draftOutputDir: '/tmp/drafts',
      videoOutputDir: '/tmp/videos',
      exportWaitSeconds: 12,
      openWaitSeconds: 10,
      homeWaitSeconds: 5,
      stepPauseSeconds: 1,
      sheetMappings: [{
        sheetName: '测试账号',
        accountIds: ['account-1', 'account-2'],
      }],
    });
  });
});
