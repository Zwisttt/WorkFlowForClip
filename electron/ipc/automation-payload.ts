import type {
  AutomationSheetMapping,
  AutomationStartRequest,
} from '../services/types/automation';

function optionalNumber(value: unknown): number | undefined {
  return value === undefined || value === null || value === ''
    ? undefined
    : Number(value);
}

/**
 * Vue reactive objects are Proxy instances and cannot cross Electron's IPC
 * structured-clone boundary. Rebuild the request from primitives so preload
 * never forwards renderer-owned proxies to ipcRenderer.invoke().
 */
export function createCloneSafeAutomationStartRequest(
  request: AutomationStartRequest,
): AutomationStartRequest {
  const mappings = Array.from(request.sheetMappings ?? [], (mapping): AutomationSheetMapping => ({
    sheetName: String(mapping.sheetName ?? ''),
    accountIds: Array.from(mapping.accountIds ?? [], (accountId) => String(accountId)),
  }));

  return {
    filePath: String(request.filePath ?? ''),
    publicAudioDir: String(request.publicAudioDir ?? ''),
    draftOutputDir: String(request.draftOutputDir ?? ''),
    videoOutputDir: String(request.videoOutputDir ?? ''),
    exportWaitSeconds: Number(request.exportWaitSeconds),
    openWaitSeconds: optionalNumber(request.openWaitSeconds),
    homeWaitSeconds: optionalNumber(request.homeWaitSeconds),
    stepPauseSeconds: optionalNumber(request.stepPauseSeconds),
    sheetMappings: mappings,
  };
}
