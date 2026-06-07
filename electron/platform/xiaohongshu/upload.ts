import fs from 'fs';
import path from 'path';
import type { Page, BrowserContext } from 'patchright';
import { chromium } from 'patchright';
import type { WebContents } from 'electron';
import { Logger } from '../../core/Logger';
import { XHS_URLS, UPLOAD_SELECTORS } from './selectors';
import { getCookiePath, saveCookie, cookieExists } from './cookie';
import type { UploadContext, UploadResult } from '../base/types';
import { TopicSanitizer } from '../base/TopicSanitizer';
import { PageRiskControl, EmbeddedRiskControl } from '../base/RiskControl';
import { toPlatformError, AuthError, SelectorError, ValidationError, NetworkError, ContentRejectedError } from '../base/PlatformError';
import { getDebugRecorder } from '../base/DebugRecorder';
import { browserManager } from '../../services/embedded-browser/browser-manager';
import { createBrowserLauncher } from '../../services/browser-launcher';
import type { BrowserConfig, IBrowserLauncher } from '../../services/types';

const logger = new Logger('XhsUpload');

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

type NormalizedBrowserMode = 'embedded' | 'chrome' | 'fingerprint';

interface EmbeddedUploadStatus {
  success: boolean;
  message?: string;
}

type EmbeddedPublishState = 'success' | 'failed' | 'timeout';

type TextPattern = string | RegExp;

const EMBEDDED_DOM_HELPERS = `
  const collectRoots = () => {
    const roots = [];
    const push = (root) => {
      if (root && !roots.includes(root)) roots.push(root);
    };
    const scan = (root) => {
      if (!root || typeof root.querySelectorAll !== 'function') return;
      for (const element of Array.from(root.querySelectorAll('*'))) {
        try {
          if (element.shadowRoot) push(element.shadowRoot);
          if (element.tagName === 'IFRAME' && element.contentDocument) {
            push(element.contentDocument);
          }
        } catch {}
      }
    };

    push(document);
    for (let i = 0; i < roots.length; i += 1) {
      scan(roots[i]);
    }
    return roots;
  };

  const queryAll = (selector) => {
    const nodes = [];
    for (const root of collectRoots()) {
      try {
        nodes.push(...Array.from(root.querySelectorAll(selector)));
      } catch {}
    }
    return Array.from(new Set(nodes));
  };

  const rootText = () => collectRoots()
    .map((root) => root.body?.innerText || root.host?.innerText || root.textContent || '')
    .join('\\n');

  const textOf = (el) => (el?.innerText || el?.textContent || '').trim();

  const isVisible = (el) => {
    if (!el || typeof el.getBoundingClientRect !== 'function') return false;
    const rect = el.getBoundingClientRect();
    const view = el.ownerDocument?.defaultView || window;
    const style = view.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
  };

  const closestClickable = (el) => {
    if (!el) return null;
    return el.closest?.('button, [role="button"], label, a') || el;
  };

  const clickElement = (el) => {
    const target = closestClickable(el);
    if (!target || typeof target.click !== 'function') return false;
    target.scrollIntoView?.({ block: 'center', inline: 'nearest' });
    const view = target.ownerDocument?.defaultView || window;
    target.dispatchEvent(new view.MouseEvent('mouseover', { bubbles: true }));
    target.dispatchEvent(new view.MouseEvent('mousedown', { bubbles: true }));
    target.dispatchEvent(new view.MouseEvent('mouseup', { bubbles: true }));
    target.click();
    return true;
  };

  const pickFileInput = (kind) => {
    const selectors = kind === 'image'
      ? ['input[type="file"][accept*="image"]', 'input[type="file"]']
      : ['input[type="file"][accept*="video"]', 'input[type="file"][accept*="mp4"]', 'input[type="file"][accept*=".mp4"]', 'input[type="file"]'];
    const inputs = selectors.flatMap((selector) => queryAll(selector));
    const uniqueInputs = Array.from(new Set(inputs));
    return uniqueInputs.find((input) => {
      const accept = String(input.getAttribute?.('accept') || '').toLowerCase();
      return kind === 'image'
        ? /image|png|jpe?g|webp/.test(accept)
        : /video|mp4|mov|quicktime|mpeg/.test(accept);
    }) || uniqueInputs[0] || null;
  };
`;

function normalizeBrowserMode(mode?: UploadContext['browserMode']): NormalizedBrowserMode {
  if (mode === 'external_chrome' || mode === 'chrome') return 'chrome';
  if (mode === 'external_fingerprint' || mode === 'fingerprint') return 'fingerprint';
  return 'embedded';
}

function normalizeLocalFilePath(value?: string | null): string | undefined {
  if (!value) return undefined;
  return value.replace(/^local-file:\/\//, '');
}

function shouldDebugSteps(ctx: UploadContext): boolean {
  return ctx.debugSteps === true && process.env.NODE_ENV !== 'production';
}

function shouldKeepBrowserOnPublishFailure(): boolean {
  return process.env.MATRIXFLOW_KEEP_BROWSER_ON_FAIL === '1'
    || process.env.MATRIXFLOW_KEEP_BROWSER_ON_FAIL === 'true';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExpText(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function patternToSource(pattern: TextPattern): { source: string; flags: string } {
  return typeof pattern === 'string'
    ? { source: escapeRegExpText(pattern), flags: '' }
    : { source: pattern.source, flags: pattern.flags };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runEmbeddedDebugStep<T>(
  wc: WebContents,
  ctx: UploadContext,
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  if (!shouldDebugSteps(ctx)) {
    return action();
  }

  logger.info(`[XhsDebug] 开始: ${label}`);
  await showEmbeddedDebugStep(wc, label, 'running');
  try {
    const result = await action();
    logger.info(`[XhsDebug] 完成: ${label}`);
    await showEmbeddedDebugStep(wc, label, 'done');
    await sleep(500);
    return result;
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`[XhsDebug] 失败: ${label} - ${message}`);
    await showEmbeddedDebugStep(wc, label, 'failed', message);
    await sleep(800);
    throw error;
  }
}

async function showEmbeddedDebugStep(
  wc: WebContents,
  label: string,
  status: 'running' | 'done' | 'failed',
  detail = '',
): Promise<void> {
  if (wc.isDestroyed()) return;
  await wc.executeJavaScript(`
    (() => {
      const payload = ${JSON.stringify({ label, status, detail })};
      const color = payload.status === 'failed' ? '#d93025' : payload.status === 'done' ? '#188038' : '#1a73e8';
      let box = document.getElementById('matrixflow-xhs-debug');
      if (!box) {
        box = document.createElement('div');
        box.id = 'matrixflow-xhs-debug';
        box.style.cssText = [
          'position:fixed',
          'right:16px',
          'bottom:16px',
          'z-index:2147483647',
          'max-width:360px',
          'padding:12px 14px',
          'border-radius:8px',
          'box-shadow:0 8px 24px rgba(0,0,0,.18)',
          'font:13px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
          'color:#202124',
          'background:#fff',
          'border:1px solid rgba(0,0,0,.12)'
        ].join(';');
        document.body.appendChild(box);
      }
      box.textContent = '';
      const title = document.createElement('div');
      title.textContent = 'MatrixFlow 小红书发布调试';
      title.style.cssText = 'font-weight:600;color:' + color;
      const step = document.createElement('div');
      step.textContent = payload.label;
      step.style.marginTop = '4px';
      box.appendChild(title);
      box.appendChild(step);
      if (payload.detail) {
        const detail = document.createElement('div');
        detail.textContent = payload.detail;
        detail.style.cssText = 'margin-top:4px;color:#5f6368;word-break:break-all';
        box.appendChild(detail);
      }
    })()
  `, true).catch(() => undefined);
}

async function runPageDebugStep<T>(
  page: Page,
  ctx: UploadContext,
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  if (!shouldDebugSteps(ctx)) {
    return action();
  }

  logger.info(`[XhsDebug] 开始: ${label}`);
  await showPageDebugStep(page, label, 'running');
  try {
    const result = await action();
    logger.info(`[XhsDebug] 完成: ${label}`);
    await showPageDebugStep(page, label, 'done');
    await page.waitForTimeout(500).catch(() => undefined);
    return result;
  } catch (error) {
    const message = errorMessage(error);
    logger.error(`[XhsDebug] 失败: ${label} - ${message}`);
    await showPageDebugStep(page, label, 'failed', message);
    await page.waitForTimeout(800).catch(() => undefined);
    throw error;
  }
}

async function showPageDebugStep(
  page: Page,
  label: string,
  status: 'running' | 'done' | 'failed',
  detail = '',
): Promise<void> {
  await page.evaluate((payload: { label: string; status: string; detail: string }) => {
    const doc = (globalThis as any).document;
    const color = payload.status === 'failed' ? '#d93025' : payload.status === 'done' ? '#188038' : '#1a73e8';
    let box = doc.getElementById('matrixflow-xhs-debug');
    if (!box) {
      box = doc.createElement('div');
      box.id = 'matrixflow-xhs-debug';
      box.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:2147483647',
        'max-width:360px',
        'padding:12px 14px',
        'border-radius:8px',
        'box-shadow:0 8px 24px rgba(0,0,0,.18)',
        'font:13px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
        'color:#202124',
        'background:#fff',
        'border:1px solid rgba(0,0,0,.12)',
      ].join(';');
      doc.body.appendChild(box);
    }
    box.textContent = '';
    const title = doc.createElement('div');
    title.textContent = 'MatrixFlow 小红书发布调试';
    title.style.cssText = 'font-weight:600;color:' + color;
    const step = doc.createElement('div');
    step.textContent = payload.label;
    step.style.marginTop = '4px';
    box.appendChild(title);
    box.appendChild(step);
    if (payload.detail) {
      const detail = doc.createElement('div');
      detail.textContent = payload.detail;
      detail.style.cssText = 'margin-top:4px;color:#5f6368;word-break:break-all';
      box.appendChild(detail);
    }
  }, { label, status, detail }).catch(() => undefined);
}

async function launchPatchrightContext(
  ctx: UploadContext,
  userDataDir: string,
  browserMode: NormalizedBrowserMode,
  headless: boolean,
  slowMo: number,
): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  let launcher: IBrowserLauncher | null = null;

  if (browserMode === 'fingerprint') {
    if (!ctx.fingerprintId) {
      throw new ValidationError('账号未绑定指纹浏览器配置', undefined, 'xiaohongshu');
    }
    const config: BrowserConfig = { type: 'fingerprint', fingerprintId: ctx.fingerprintId, headless };
    launcher = createBrowserLauncher(config);
    const context = await launcher.launch(config, ctx.accountId);
    return { context, close: () => launcher!.close() };
  }

  if (browserMode === 'chrome') {
    const config: BrowserConfig = {
      type: 'chrome',
      executablePath: ctx.chromePath || undefined,
      headless,
    };
    launcher = createBrowserLauncher(config);
    const context = await launcher.launch(config, ctx.accountId);
    return { context, close: () => launcher!.close() };
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless,
    slowMo,
    args: CHROME_ARGS,
  });
  return { context, close: () => context.close() };
}

async function uploadVideoInStandaloneBrowser(ctx: UploadContext): Promise<UploadResult> {
  const { videoPath, title, description, tags, accountId } = ctx;
  logger.info('使用账号独立弹窗执行小红书发布任务');
  let publishSucceeded = false;
  let failureMessage = '';
  let debugWebContents: WebContents | undefined;

  try {
    if (browserManager.hasTab(accountId) && !browserManager.hasStandaloneTab(accountId)) {
      await browserManager.closeTab(accountId);
    }

    const view = browserManager.hasStandaloneTab(accountId)
      ? browserManager.getView(accountId)
      : await browserManager.createTab(accountId, 'xiaohongshu', XHS_URLS.publish);

    if (!view) {
      return { success: false, message: '账号浏览器弹窗不存在' };
    }

    browserManager.switchTab(accountId);

    const wc = view.webContents;
    debugWebContents = wc;
    const recorder = getDebugRecorder();

    await runEmbeddedDebugStep(wc, ctx, '加载小红书发布页', async () => {
      if (!wc.getURL().includes('/publish/publish')) {
        await wc.loadURL(XHS_URLS.publish);
      }
      await waitForEmbeddedReady(wc, 30000);
      await waitForEmbeddedUploadSurface(wc, 60000);
    });

    await recorder.recordStep('发布页加载完成', async () => {
      return { url: wc.getURL() };
    });

    const isOnUploadPage = wc.getURL().includes('/publish/publish');
    if (!isOnUploadPage) {
      failureMessage = '账号浏览器弹窗未进入小红书发布页，请先完成账号登录';
      return { success: false, message: '账号浏览器弹窗未进入小红书发布页，请先完成账号登录' };
    }

    await runEmbeddedDebugStep(wc, ctx, '选择视频文件', async () => {
      await setEmbeddedFileInput(wc, videoPath);
      logger.info(`账号浏览器弹窗已选择视频文件: ${videoPath}`);
      await sleep(2000);
    });

    await recorder.recordStep('账号浏览器文件选择完成', async () => {
      return { videoPath };
    });

    const uploadComplete = await runEmbeddedDebugStep(wc, ctx, '等待视频上传完成', async () => (
      waitForEmbeddedUploadComplete(wc, 180000)
    ));
    if (!uploadComplete.success) {
      failureMessage = uploadComplete.message || '视频上传失败';
      return { success: false, message: failureMessage };
    }

    await runEmbeddedDebugStep(wc, ctx, '填写标题、正文和话题', async () => {
      await closeEmbeddedGuide(wc);
      await fillEmbeddedDescriptionAndTags(wc, title, description, tags);
    });

    await recorder.recordStep('账号浏览器填写描述话题完成', async () => {
      return true;
    });

    await runEmbeddedDebugStep(wc, ctx, '设置封面', async () => {
      await setEmbeddedCover(wc, ctx.coverPath);
    });

    await recorder.recordStep('账号浏览器封面设置完成', async () => {
      return true;
    });

    const publishState = await runEmbeddedDebugStep(wc, ctx, '提交发布', async () => {
      logger.info('所有元素设置完成，等待10秒后发布...');
      await sleep(10000);
      return clickEmbeddedPublish(wc, 30000);
    });
    if (publishState === 'success') {
      publishSucceeded = true;
      logger.info('账号浏览器弹窗小红书发布成功');
      return { success: true, message: '视频发布成功', videoId: extractVideoId(wc.getURL()) };
    }

    failureMessage = publishState === 'failed' ? '视频发布失败' : '视频发布超时';
    return { success: false, message: failureMessage };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failureMessage = message;
    logger.error(`账号浏览器弹窗发布过程出错: ${message}`);
    return { success: false, message: `账号浏览器弹窗发布过程出错: ${message}` };
  } finally {
    if (!publishSucceeded && debugWebContents && !debugWebContents.isDestroyed()) {
      await logEmbeddedPublishDiagnostics(debugWebContents, failureMessage || '未知失败原因');
    }
    if (!publishSucceeded && shouldKeepBrowserOnPublishFailure()) {
      logger.warn(`已保留小红书发布失败浏览器现场: accountId=${accountId} reason=${failureMessage || '未知失败原因'}`);
    } else if (browserManager.hasStandaloneTab(accountId)) {
      await browserManager.closeTab(accountId).catch((closeError) => {
        const reason = publishSucceeded ? '成功' : '失败';
        logger.warn(`关闭小红书发布${reason}弹窗失败: ${closeError}`);
      });
    }
  }
}

async function waitForEmbeddedReady(wc: WebContents, timeoutMs: number): Promise<void> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (wc.isDestroyed()) {
      throw new SelectorError('内嵌浏览器页面已关闭', undefined, 'xiaohongshu');
    }

    const ready = await wc.executeJavaScript('document.readyState !== "loading"').catch(() => false);
    if (!wc.isLoadingMainFrame() && ready) {
      return;
    }

    await sleep(500);
  }

  throw new SelectorError('等待内嵌浏览器页面加载超时', undefined, 'xiaohongshu');
}

async function waitForEmbeddedUploadSurface(wc: WebContents, timeoutMs: number): Promise<void> {
  logger.info('等待小红书发布页上传控件渲染...');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (wc.isDestroyed()) {
      throw new SelectorError('账号浏览器弹窗页面已关闭', undefined, 'xiaohongshu');
    }

    const state = await wc.executeJavaScript(`
      (() => {
        const isVisible = (el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
        };
        const bodyText = document.body?.innerText || '';
        const fileInputs = document.querySelectorAll('input[type="file"]');
        const uploadButtons = Array.from(document.querySelectorAll('button, [role="button"], label'))
          .filter((el) => isVisible(el) && /上传视频|选择视频|上传/.test((el.innerText || el.textContent || '').trim()));
        return {
          url: location.href,
          fileInputCount: fileInputs.length,
          uploadButtonCount: uploadButtons.length,
          loginVisible: /扫码登录|登录后|请登录/.test(bodyText),
          publishPageVisible: /上传视频|选择视频|发布作品|作品描述|封面设置|标题/.test(bodyText),
        };
      })()
    `, true).catch(() => ({
      url: wc.getURL(),
      fileInputCount: 0,
      uploadButtonCount: 0,
      loginVisible: false,
      publishPageVisible: false,
    })) as {
      url: string;
      fileInputCount: number;
      uploadButtonCount: number;
      loginVisible: boolean;
      publishPageVisible: boolean;
    };

    if (!state.url.includes('/publish/publish') && Date.now() - start > 3000) {
      await wc.loadURL(XHS_URLS.publish).catch(() => undefined);
      await waitForEmbeddedReady(wc, 30000).catch(() => undefined);
    }

    if (state.loginVisible) {
      throw new AuthError('账号浏览器弹窗显示登录页，请先完成小红书账号登录', undefined, 'xiaohongshu');
    }

    if (state.fileInputCount > 0 || state.uploadButtonCount > 0 || state.publishPageVisible) {
      logger.info(`小红书发布页上传区域已就绪: inputs=${state.fileInputCount} buttons=${state.uploadButtonCount}`);
      return;
    }

    await sleep(1000);
  }

  throw new SelectorError(`等待小红书发布页上传控件超时: url=${wc.getURL()}`, undefined, 'xiaohongshu');
}

async function attachDebuggerIfNeeded(wc: WebContents): Promise<boolean> {
  if (wc.debugger.isAttached()) {
    return false;
  }

  wc.debugger.attach('1.3');
  return true;
}

interface EmbeddedFileInputHandle {
  nodeId?: number;
  backendNodeId?: number;
  objectId?: string;
}

async function releaseEmbeddedFileInputHandle(wc: WebContents, handle: EmbeddedFileInputHandle | null): Promise<void> {
  if (handle?.objectId) {
    await wc.debugger.sendCommand('Runtime.releaseObject', { objectId: handle.objectId }).catch(() => undefined);
  }
}

async function findEmbeddedFileInputHandle(wc: WebContents, kind: 'video' | 'image' = 'video'): Promise<EmbeddedFileInputHandle | null> {
  const expression = `
    (() => {
      ${EMBEDDED_DOM_HELPERS}
      return pickFileInput(${JSON.stringify(kind)});
    })()
  `;

  const evalResult = await wc.debugger.sendCommand('Runtime.evaluate', {
    expression,
    objectGroup: 'matrixflow-xhs-upload',
    returnByValue: false,
  }) as {
    result?: {
      objectId?: string;
      subtype?: string;
      type?: string;
    };
    exceptionDetails?: unknown;
  };

  if (evalResult.exceptionDetails || !evalResult.result?.objectId || evalResult.result.subtype === 'null') {
    return null;
  }

  const objectId = evalResult.result.objectId;
  const nodeResult = await wc.debugger.sendCommand('DOM.requestNode', { objectId })
    .catch(() => null) as { nodeId?: number } | null;
  const describeResult = await wc.debugger.sendCommand('DOM.describeNode', { objectId })
    .catch(() => null) as { node?: { backendNodeId?: number } } | null;

  const handle: EmbeddedFileInputHandle = { objectId };
  if (nodeResult?.nodeId && nodeResult.nodeId > 0) {
    handle.nodeId = nodeResult.nodeId;
  }
  if (describeResult?.node?.backendNodeId && describeResult.node.backendNodeId > 0) {
    handle.backendNodeId = describeResult.node.backendNodeId;
  }

  return handle.nodeId || handle.backendNodeId || handle.objectId ? handle : null;
}

async function setEmbeddedFilesByHandle(
  wc: WebContents,
  handle: EmbeddedFileInputHandle,
  files: string[],
): Promise<void> {
  const params: {
    files: string[];
    nodeId?: number;
    backendNodeId?: number;
    objectId?: string;
  } = { files };

  if (handle.nodeId) {
    params.nodeId = handle.nodeId;
  } else if (handle.backendNodeId) {
    params.backendNodeId = handle.backendNodeId;
  } else if (handle.objectId) {
    params.objectId = handle.objectId;
  }

  await wc.debugger.sendCommand('DOM.setFileInputFiles', params);
}

async function setEmbeddedFileInput(wc: WebContents, videoPath: string): Promise<void> {
  const resolvedPath = path.resolve(videoPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new ValidationError(`视频文件不存在: ${resolvedPath}`, undefined, 'xiaohongshu');
  }

  const shouldDetach = await attachDebuggerIfNeeded(wc);
  try {
    const start = Date.now();
    let handle: EmbeddedFileInputHandle | null = null;
    while (Date.now() - start < 30000) {
      if (wc.isDestroyed()) {
        throw new SelectorError('账号浏览器弹窗页面已关闭', undefined, 'xiaohongshu');
      }
      handle = await findEmbeddedFileInputHandle(wc, 'video').catch(() => null);
      if (handle) break;
      await clickEmbeddedUploadEntry(wc).catch(() => false);
      await sleep(1000);
    }

    if (handle) {
      try {
        await setEmbeddedFilesByHandle(wc, handle, [resolvedPath]);
        await notifyEmbeddedFileInputChanged(wc, 'video');
        return;
      } catch (error) {
        logger.warn(`小红书通过 DOM 句柄设置文件失败，尝试拦截文件选择器: ${error}`);
      } finally {
        await releaseEmbeddedFileInputHandle(wc, handle);
      }
    }

    const intercepted = await setFileThroughInterceptedChooser(wc, resolvedPath);
    if (intercepted) {
      await notifyEmbeddedFileInputChanged(wc, 'video');
      return;
    }

    const diagnostics = await getEmbeddedUploadDiagnostics(wc);
    throw new SelectorError(`未找到小红书视频上传控件: ${diagnostics}`, undefined, 'xiaohongshu');
  } finally {
    if (shouldDetach && wc.debugger.isAttached()) {
      wc.debugger.detach();
    }
  }
}

async function notifyEmbeddedFileInputChanged(wc: WebContents, kind: 'video' | 'image'): Promise<void> {
  await wc.executeJavaScript(`
    (() => {
      ${EMBEDDED_DOM_HELPERS}
      const input = pickFileInput(${JSON.stringify(kind)});
      if (!input) return false;
      const view = input.ownerDocument?.defaultView || window;
      input.dispatchEvent(new view.Event('input', { bubbles: true }));
      input.dispatchEvent(new view.Event('change', { bubbles: true }));
      return true;
    })()
  `, true).catch(() => false);
}

async function clickEmbeddedUploadEntry(wc: WebContents): Promise<boolean> {
  return await wc.executeJavaScript(`
    (() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const selectorCandidates = [
        'button[class*="upload"]',
        'button[class*="Upload"]',
        '[class*="upload-btn"]',
        '[class*="upload"] button',
        '.upload-btn',
      ];

      for (const selector of selectorCandidates) {
        const el = Array.from(document.querySelectorAll(selector)).find((node) => isVisible(node));
        const clickable = el?.closest?.('button, [role="button"], label') || el;
        if (clickable instanceof HTMLElement) {
          clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
          clickable.click();
          return true;
        }
      }

      const candidates = Array.from(document.querySelectorAll('button, [role="button"], label, div, span'))
        .filter((el) => isVisible(el) && /上传视频|选择视频|上传/.test(textOf(el)));
      const target = candidates.find((el) => /上传视频|选择视频/.test(textOf(el))) || candidates[0];
      const clickable = target?.closest('button, [role="button"], label') || target;
      if (clickable instanceof HTMLElement) {
        clickable.click();
        return true;
      }
      const input = document.querySelector('input[type="file"]');
      if (input instanceof HTMLElement) {
        input.click();
        return true;
      }
      return false;
    })()
  `, true).catch(() => false);
}

async function setFileThroughInterceptedChooser(wc: WebContents, resolvedPath: string): Promise<boolean> {
  await wc.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: true }).catch(() => undefined);

  return await new Promise<boolean>((resolve) => {
    let settled = false;
    let timeout: NodeJS.Timeout | null = null;

    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      wc.debugger.off('message', onMessage);
      wc.debugger.sendCommand('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => undefined);
      resolve(success);
    };

    const trySetByExistingNode = async () => {
      const handle = await findEmbeddedFileInputHandle(wc, 'video').catch(() => null);
      if (!handle) return false;
      try {
        await setEmbeddedFilesByHandle(wc, handle, [resolvedPath]);
        return true;
      } catch (error) {
        logger.warn(`小红书通过已存在文件控件设置文件失败: ${error}`);
        return false;
      } finally {
        await releaseEmbeddedFileInputHandle(wc, handle);
      }
    };

    const onMessage = async (_event: unknown, method: string, params: { backendNodeId?: number } = {}) => {
      if (method !== 'Page.fileChooserOpened') return;

      try {
        if (params.backendNodeId) {
          await wc.debugger.sendCommand('DOM.setFileInputFiles', {
            backendNodeId: params.backendNodeId,
            files: [resolvedPath],
          });
          finish(true);
          return;
        }

        finish(await trySetByExistingNode());
      } catch (error) {
        logger.warn(`小红书文件选择器拦截设置文件失败: ${error}`);
        finish(false);
      }
    };

    wc.debugger.on('message', onMessage);

    clickEmbeddedUploadEntry(wc)
      .then(async (clicked) => {
        if (!clicked) {
          finish(await trySetByExistingNode().catch(() => false));
        }
      })
      .catch(() => finish(false));

    timeout = setTimeout(async () => {
      finish(await trySetByExistingNode().catch(() => false));
    }, 10000);
  });
}

async function getEmbeddedUploadDiagnostics(wc: WebContents): Promise<string> {
  const diagnostic = await wc.executeJavaScript(`
    (() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const buttons = Array.from(document.querySelectorAll('button, [role="button"], label, [class*="upload"], [class*="Upload"]'))
        .filter(isVisible)
        .slice(0, 8)
        .map((el) => (el.innerText || el.textContent || el.className || '').trim().slice(0, 40))
        .filter(Boolean);
      return {
        url: location.href,
        title: document.title,
        ready: document.readyState,
        fileInputCount: document.querySelectorAll('input[type="file"]').length,
        uploadClassCount: document.querySelectorAll('[class*="upload"], [class*="Upload"]').length,
        buttons,
      };
    })()
  `, true).catch(() => null) as {
    url?: string;
    title?: string;
    ready?: string;
    fileInputCount?: number;
    uploadClassCount?: number;
    buttons?: string[];
  } | null;

  if (!diagnostic) return `url=${wc.getURL()}`;
  return `url=${diagnostic.url || wc.getURL()}, title=${diagnostic.title || ''}, ready=${diagnostic.ready || ''}, fileInputs=${diagnostic.fileInputCount ?? 0}, uploadNodes=${diagnostic.uploadClassCount ?? 0}, buttons=${(diagnostic.buttons || []).join('|')}`;
}

async function logEmbeddedPublishDiagnostics(wc: WebContents, reason: string): Promise<void> {
  const diagnostic = await wc.executeJavaScript(`
    (() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim().replace(/\\s+/g, ' ');
      const visibleTexts = Array.from(document.querySelectorAll('button, [role="button"], label, [class*="edit-form-item"]'))
        .filter((el) => el instanceof HTMLElement && isVisible(el))
        .map(textOf)
        .filter(Boolean)
        .slice(0, 40);
      const sectionLabels = ['作品描述', '封面设置', '标题'];
      const sections = {};
      for (const label of sectionLabels) {
        const node = Array.from(document.querySelectorAll('label, span, div, p'))
          .find((el) => el instanceof HTMLElement && isVisible(el) && textOf(el).includes(label));
        const container = node?.closest?.('[class*="edit-form-item"], [class*="form-item"]') || node?.parentElement;
        sections[label] = container ? textOf(container).slice(0, 500) : '';
      }
      return {
        url: location.href,
        title: document.title,
        ready: document.readyState,
        bodyLength: document.body?.innerText?.length || 0,
        visibleTexts,
        sections,
      };
    })()
  `, true).catch((error) => ({ error: error instanceof Error ? error.message : String(error), url: wc.getURL() })) as unknown;

  logger.warn(`[XhsDebug] 发布失败页面诊断: reason=${reason} data=${JSON.stringify(diagnostic)}`);
}

async function closeEmbeddedGuide(wc: WebContents): Promise<void> {
  await wc.executeJavaScript(`
    (() => {
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const clickByText = (patterns) => {
        const candidates = Array.from(document.querySelectorAll('button, [role="button"], span, div'))
          .filter((el) => isVisible(el));
        for (const el of candidates) {
          const text = (el.innerText || el.textContent || '').trim();
          if (patterns.some((pattern) => pattern.test(text))) {
            const clickable = el.closest('button, [role="button"]') || el;
            if (clickable instanceof HTMLElement) {
              clickable.click();
              return true;
            }
          }
        }
        return false;
      };

      if (clickByText([/^我知道了$/, /^知道了$/, /^跳过$/, /^Skip$/i])) {
        return true;
      }

      const closeSelectors = [
        '[aria-label="Skip"]',
        '[data-action="skip"]',
        'button[title="Skip"]',
        '[class*="close"]',
        '[class*="Close"]',
      ];
      for (const selector of closeSelectors) {
        const el = document.querySelector(selector);
        if (el instanceof HTMLElement && isVisible(el)) {
          el.click();
          return true;
        }
      }
      return false;
    })()
  `, true).catch(() => false);
}

async function setEmbeddedTextFieldByLabel(
  wc: WebContents,
  labelPatterns: TextPattern[],
  placeholderPatterns: TextPattern[],
  value: string,
  options: { preferMultiline?: boolean; allowFallback?: boolean } = {},
): Promise<boolean> {
  const payload = {
    labels: labelPatterns.map(patternToSource),
    placeholders: placeholderPatterns.map(patternToSource),
    value,
    preferMultiline: options.preferMultiline === true,
    allowFallback: options.allowFallback === true,
  };

  return await wc.executeJavaScript(`
    (() => {
      const payload = ${JSON.stringify(payload)};
      const labelRegexes = payload.labels.map((p) => new RegExp(p.source, p.flags));
      const placeholderRegexes = payload.placeholders.map((p) => new RegExp(p.source, p.flags));
      const editableSelector = 'textarea, input[type="text"], input:not([type]), [contenteditable="true"], [role="textbox"], .ql-editor, .ProseMirror';
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const textOf = (el) => (el.innerText || el.textContent || '').trim();
      const isMultiline = (el) => el instanceof HTMLTextAreaElement
        || el.getAttribute('contenteditable') === 'true'
        || el.getAttribute('role') === 'textbox'
        || el.classList.contains('ql-editor')
        || el.classList.contains('ProseMirror');
      const editables = Array.from(document.querySelectorAll(editableSelector))
        .filter((el) => el instanceof HTMLElement && isVisible(el) && !el.matches('[disabled], [readonly], [type="hidden"]'));
      const matchesEditable = (el) => {
        if (payload.preferMultiline && !isMultiline(el)) return false;
        const attrs = [
          el.getAttribute('placeholder') || '',
          el.getAttribute('aria-label') || '',
          el.getAttribute('data-placeholder') || '',
          el.getAttribute('name') || '',
          el.getAttribute('class') || '',
        ].join(' ');
        return placeholderRegexes.some((pattern) => pattern.test(attrs));
      };
      const setText = (target) => {
        if (!(target instanceof HTMLElement)) return false;
        target.scrollIntoView({ block: 'center', inline: 'nearest' });
        target.focus();

        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
          const prototype = target instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
          if (setter) {
            setter.call(target, payload.value);
          } else {
            target.value = payload.value;
          }
          target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: payload.value }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(target);
        selection?.removeAllRanges();
        selection?.addRange(range);
        document.execCommand('delete');
        target.innerText = payload.value;
        target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: payload.value }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };

      const placeholderTarget = editables.find(matchesEditable);
      if (placeholderTarget) return setText(placeholderTarget);

      const labels = Array.from(document.querySelectorAll('label, span, div, p'))
        .filter((el) => {
          if (!(el instanceof HTMLElement) || !isVisible(el)) return false;
          const text = textOf(el);
          return text.length > 0 && text.length <= 80 && labelRegexes.some((pattern) => pattern.test(text));
        })
        .sort((a, b) => textOf(a).length - textOf(b).length);

      for (const label of labels) {
        let node = label;
        for (let depth = 0; node && depth < 7; depth += 1) {
          const candidates = Array.from(node.querySelectorAll(editableSelector))
            .filter((el) => el instanceof HTMLElement && isVisible(el) && (!payload.preferMultiline || isMultiline(el)));
          if (candidates.length > 0) {
            return setText(candidates[0]);
          }
          node = node.parentElement;
        }
      }

      if (payload.allowFallback) {
        const fallback = editables.find((el) => !payload.preferMultiline || isMultiline(el));
        if (fallback) return setText(fallback);
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;
}

async function fillEmbeddedDescriptionAndTags(
  wc: WebContents,
  title: string,
  description?: string,
  tags?: string[],
): Promise<void> {
  logger.info('在内嵌浏览器中填写小红书视频标题、正文和话题...');

  const titleText = (title || '未命名视频').trim();
  const normalizedTags = TopicSanitizer.cleanTopics(tags ?? [], { maxTopics: 10, platform: 'xiaohongshu' });
  const descriptionText = description?.trim() ?? '';
  const riskControl = new EmbeddedRiskControl(wc);

  const titleSet = await setEmbeddedTextFieldByLabel(
    wc,
    [/^标题$/, /标题/],
    [/标题/, /填写标题/, /输入标题/],
    titleText,
  );
  if (!titleSet) {
    logger.warn('未找到小红书标题输入框');
  }

  const descContent = descriptionText;
  const descSet = await riskControl.humanizedFillField({
    labelPatterns: [/作品描述/, /^描述$/, /正文/, /说点什么/],
    placeholderPatterns: [/作品描述/, /描述/, /正文/, /说点什么/, /输入内容/],
    preferMultiline: true,
    allowFallback: true,
  }, descContent);

  if (!descSet) {
    throw new SelectorError('未找到小红书正文输入框', undefined, 'xiaohongshu');
  }

  await riskControl.humanizedAppendTags(normalizedTags, {
    newlineBeforeFirst: descContent.length > 0,
    maxTags: 10,
  });
  for (const tag of normalizedTags) {
    logger.info(`小红书话题已回车确认: #${tag}`);
  }
}

async function setEmbeddedCover(wc: WebContents, coverPath?: string): Promise<void> {
  const normalizedCoverPath = normalizeLocalFilePath(coverPath);
  if (!normalizedCoverPath || !fs.existsSync(normalizedCoverPath)) {
    return;
  }

  logger.info('在内嵌浏览器中设置小红书封面...');
  const opened = await clickEmbeddedText(wc, [/封面/, /设置封面/]);
  if (!opened) {
    logger.warn('未找到小红书封面设置入口，跳过封面设置');
    return;
  }
  await sleep(1000);

  await clickEmbeddedText(wc, [/上传封面/, /本地上传/]);
  await sleep(500);

  const shouldDetach = await attachDebuggerIfNeeded(wc);
  try {
    const handle = await findEmbeddedFileInputHandle(wc, 'image');
    if (!handle) {
      logger.warn('未找到封面上传控件，跳过封面设置');
      return;
    }
    await setEmbeddedFilesByHandle(wc, handle, [normalizedCoverPath]);
    await notifyEmbeddedFileInputChanged(wc, 'image');
  } finally {
    if (shouldDetach && wc.debugger.isAttached()) {
      wc.debugger.detach();
    }
  }

  await sleep(1000);
  await clickEmbeddedText(wc, [/^确认$/, /^确定$/, /^完成$/]);
}

async function clickEmbeddedText(wc: WebContents, patterns: TextPattern[]): Promise<boolean> {
  const serializedPatterns = patterns.map(patternToSource);
  return await wc.executeJavaScript(`
    (() => {
      const patterns = ${JSON.stringify(serializedPatterns)}.map((p) => new RegExp(p.source, p.flags));
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], label, span, div, li, p'))
        .filter((el) => {
          if (!isVisible(el)) return false;
          const text = (el.innerText || el.textContent || '').trim();
          return text.length > 0 && text.length <= 80;
        })
        .sort((a, b) => {
          const at = (a.innerText || a.textContent || '').trim();
          const bt = (b.innerText || b.textContent || '').trim();
          return at.length - bt.length;
        });
      for (const el of candidates) {
        const text = (el.innerText || el.textContent || '').trim();
        if (!patterns.some((pattern) => pattern.test(text))) continue;
        const clickable = el.closest('button, [role="button"], label, li') || el;
        if (!(clickable instanceof HTMLElement)) continue;
        if (clickable.hasAttribute('disabled') || clickable.getAttribute('aria-disabled') === 'true') continue;
        clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
        clickable.click();
        return true;
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;
}

async function waitForEmbeddedUploadComplete(
  wc: WebContents,
  timeoutMs: number,
): Promise<EmbeddedUploadStatus> {
  logger.info('等待内嵌浏览器视频上传完成...');
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const state = await wc.executeJavaScript(`
      (() => {
        const bodyText = document.body?.innerText || '';
        return {
          failed: /上传失败|上传出错|文件异常|格式不支持/.test(bodyText),
          uploading: /上传中|正在上传|处理中|转码中/.test(bodyText),
          success: /上传成功/.test(bodyText),
          hasPublishArea: /发布|发布作品|标题|正文|话题|封面/.test(bodyText),
        };
      })()
    `).catch(() => ({ failed: false, uploading: true, success: false, hasPublishArea: false })) as {
      failed: boolean;
      uploading: boolean;
      success: boolean;
      hasPublishArea: boolean;
    };

    if (state.failed) {
      return { success: false, message: '视频上传失败' };
    }

    if (state.success) {
      logger.info('内嵌浏览器视频上传完成');
      return { success: true };
    }

    if (!state.uploading && Date.now() - start > 4000) {
      logger.info('内嵌浏览器视频上传完成');
      return { success: true };
    }

    await sleep(2000);
  }

  return { success: false, message: '视频上传超时' };
}

async function clickEmbeddedPublish(wc: WebContents, timeoutMs: number): Promise<EmbeddedPublishState> {
  const start = Date.now();
  let clicked = false;

  while (Date.now() - start < timeoutMs) {
    const currentState = await getEmbeddedPublishState(wc);
    if (currentState !== 'timeout') {
      return currentState;
    }

    if (!clicked) {
      clicked = await clickEmbeddedButtonByText(wc, /^发布$/) || await clickEmbeddedButtonByText(wc, /^发表$/);
      if (clicked) {
        logger.info('已在内嵌浏览器点击小红书发布按钮');
        await sleep(1000);
      }
    }

    await clickEmbeddedButtonByText(wc, /确认发布|确定发布|确认/);
    const stateAfterConfirm = await getEmbeddedPublishState(wc);
    if (stateAfterConfirm !== 'timeout') {
      return stateAfterConfirm;
    }

    await sleep(1000);
  }

  return 'timeout';
}

async function clickEmbeddedButtonByText(wc: WebContents, pattern: RegExp): Promise<boolean> {
  const source = pattern.source;
  const flags = pattern.flags;
  return await wc.executeJavaScript(`
    (() => {
      const pattern = new RegExp(${JSON.stringify(source)}, ${JSON.stringify(flags)});
      const isVisible = (el) => {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      };
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], span, div')).filter(isVisible);
      for (const el of candidates) {
        const text = (el.innerText || el.textContent || '').trim();
        if (!pattern.test(text)) continue;
        const clickable = el.closest('button, [role="button"]') || el;
        if (!(clickable instanceof HTMLElement)) continue;
        if (clickable.hasAttribute('disabled') || clickable.getAttribute('aria-disabled') === 'true') continue;
        clickable.scrollIntoView({ block: 'center', inline: 'nearest' });
        clickable.click();
        return true;
      }
      return false;
    })()
  `, true).catch(() => false) as boolean;
}

async function getEmbeddedPublishState(wc: WebContents): Promise<EmbeddedPublishState> {
  if (wc.getURL().includes('/content/manage')) {
    return 'success';
  }

  const state = await wc.executeJavaScript(`
    (() => {
      const bodyText = document.body?.innerText || '';
      if (/发布成功|作品发布成功|提交成功/.test(bodyText)) return 'success';
      if (/发布失败|提交失败|发布出错|审核失败|上传失败/.test(bodyText)) return 'failed';
      return 'timeout';
    })()
  `).catch(() => 'timeout') as EmbeddedPublishState;

  return state;
}

async function waitForUploadComplete(page: Page, maxWaitMs: number = 180000): Promise<boolean> {
  const startTime = Date.now();
  const debugRecorder = getDebugRecorder();

  try {
    while (Date.now() - startTime < maxWaitMs) {
      const successVisible = await page
        .getByText('上传成功', { exact: false })
        .isVisible()
        .catch(() => false);
      const failedVisible = await page
        .getByText('上传失败', { exact: false })
        .isVisible()
        .catch(() => false);
      const processingVisible = await page
        .getByText('处理中', { exact: false })
        .isVisible()
        .catch(() => false);

      if (successVisible) {
        logger.info('视频上传成功');
        return true;
      }

      if (failedVisible) {
        logger.error('视频上传失败');
        return false;
      }

      if (processingVisible) {
        logger.info('视频处理中...');
      }

      await page.waitForTimeout(2000);
    }

    logger.error('视频上传超时');
    return false;
  } catch (error) {
    throw toPlatformError(error, 'xiaohongshu', { step: 'wait_upload_complete' });
  }
}

async function fillTitle(page: Page, title: string): Promise<boolean> {
  try {
    const rc = new PageRiskControl(page, {
      typingDelayMs: { min: 80, max: 250 },
      clickDelayMs: { min: 150, max: 400 },
    });

    const titleInput = page.locator(UPLOAD_SELECTORS.titleInput).first();
    let hasTitle = await titleInput.count();

    if (!hasTitle) {
      const fallback = page.locator(UPLOAD_SELECTORS.titleInputFallback).first();
      hasTitle = await fallback.count();
      if (hasTitle) {
        await rc.humanClick(UPLOAD_SELECTORS.titleInputFallback);
        await rc.humanType(UPLOAD_SELECTORS.titleInputFallback, title);
        logger.info(`标题已填写（fallback）: ${title}`);
        return true;
      }
      return false;
    }

    await rc.humanClick(UPLOAD_SELECTORS.titleInput);
    await rc.humanType(UPLOAD_SELECTORS.titleInput, title);
    logger.info(`标题已填写: ${title}`);
    return true;
  } catch (error) {
    throw toPlatformError(error, 'xiaohongshu', { step: 'fill_title' });
  }
}

async function fillDescription(page: Page, description?: string): Promise<void> {
  if (!description) return;

  try {
    const rc = new PageRiskControl(page, {
      typingDelayMs: { min: 80, max: 250 },
      clickDelayMs: { min: 150, max: 400 },
    });

    const descEditor = page.locator(UPLOAD_SELECTORS.descEditor).first();
    let hasDesc = await descEditor.count();

    if (!hasDesc) {
      const fallback = page.locator(UPLOAD_SELECTORS.descEditorFallback).first();
      hasDesc = await fallback.count();
      if (!hasDesc) {
        logger.warn('未找到描述输入框');
        return;
      }
      await rc.humanClick(UPLOAD_SELECTORS.descEditorFallback);
      await rc.humanType(UPLOAD_SELECTORS.descEditorFallback, description);
      logger.info('描述已填写（fallback）');
      return;
    }

    await rc.humanClick(UPLOAD_SELECTORS.descEditor);
    await rc.humanType(UPLOAD_SELECTORS.descEditor, description);
    logger.info('描述已填写');
  } catch (error) {
    throw toPlatformError(error, 'xiaohongshu', { step: 'fill_description' });
  }
}

async function addTopics(page: Page, tags?: string[]): Promise<void> {
  if (!tags || tags.length === 0) return;

  try {
    const rc = new PageRiskControl(page, {
      typingDelayMs: { min: 80, max: 250 },
      clickDelayMs: { min: 150, max: 400 },
    });

    const topicInput = page.locator(UPLOAD_SELECTORS.topicInput).first();
    const hasInput = await topicInput.count();

    if (!hasInput) {
      logger.warn('未找到话题输入框');
      return;
    }

    for (const tag of tags) {
      await rc.humanClick(UPLOAD_SELECTORS.topicInput);
      await rc.humanType(UPLOAD_SELECTORS.topicInput, `#${tag}`);
      await page.waitForTimeout(800);

      const suggestion = page.locator(UPLOAD_SELECTORS.topicSuggestion).first();
      if ((await suggestion.count()) && (await suggestion.isVisible().catch(() => false))) {
        await rc.humanClick(UPLOAD_SELECTORS.topicSuggestion);
        logger.info(`话题已选择: ${tag}`);
      } else {
        await page.keyboard.press('Enter');
        logger.info(`话题已输入: ${tag}`);
      }

      await page.waitForTimeout(500);
    }
  } catch (error) {
    throw toPlatformError(error, 'xiaohongshu', { step: 'add_topics' });
  }
}

async function setCover(page: Page, coverPath?: string): Promise<void> {
  if (!coverPath || !fs.existsSync(coverPath)) return;

  try {
    const rc = new PageRiskControl(page, {
      typingDelayMs: { min: 80, max: 250 },
      clickDelayMs: { min: 150, max: 400 },
    });

    const coverBtn = page.locator(UPLOAD_SELECTORS.coverSelectBtn).first();
    if (!(await coverBtn.count())) {
      logger.warn('未找到封面设置按钮');
      return;
    }

    await rc.humanClick(UPLOAD_SELECTORS.coverSelectBtn);
    logger.info('已打开封面设置');

    const coverModal = page.locator(UPLOAD_SELECTORS.coverModal).first();
    if ((await coverModal.count())) {
      await coverModal.waitFor({ state: 'visible', timeout: 5000 });
    }

    const coverInput = page.locator(UPLOAD_SELECTORS.coverUploadInput).first();
    if ((await coverInput.count())) {
      await rc.humanUpload(UPLOAD_SELECTORS.coverUploadInput, coverPath);
      logger.info(`封面已上传: ${coverPath}`);

      const confirmBtn = page.locator(UPLOAD_SELECTORS.coverConfirmBtn).first();
      if ((await confirmBtn.count())) {
        await rc.humanClick(UPLOAD_SELECTORS.coverConfirmBtn);
        logger.info('封面已确认');
      }
    }
  } catch (error) {
    throw toPlatformError(error, 'xiaohongshu', { step: 'set_cover' });
  }
}

async function clickPublish(page: Page): Promise<boolean> {
  try {
    const rc = new PageRiskControl(page, {
      typingDelayMs: { min: 80, max: 250 },
      clickDelayMs: { min: 150, max: 400 },
    });

    const publishBtn = page.locator(UPLOAD_SELECTORS.publishButton).first();
    if (!(await publishBtn.count())) {
      const primary = page.locator(UPLOAD_SELECTORS.publishButtonPrimary).first();
      if (!(await primary.count())) {
        logger.error('未找到发布按钮');
        return false;
      }
      await rc.humanClick(UPLOAD_SELECTORS.publishButtonPrimary);
    } else {
      await rc.humanClick(UPLOAD_SELECTORS.publishButton);
    }

    logger.info('已点击发布按钮');

    try {
      const successToast = page.getByText('发布成功', { exact: false });
      const failedToast = page.getByText('发布失败', { exact: false });

      await Promise.race([
        successToast.waitFor({ timeout: 30000 }),
        failedToast.waitFor({ timeout: 30000 }),
      ]);

      return await successToast.isVisible().catch(() => false);
    } catch {
      logger.warn('未检测到发布结果提示');
      return false;
    }
  } catch (error) {
    throw toPlatformError(error, 'xiaohongshu', { step: 'click_publish' });
  }
}

export async function uploadVideo(ctx: UploadContext): Promise<UploadResult> {
  const { videoPath, title, description, tags, accountId, coverPath } = ctx;
  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`xiaohongshu_upload_${accountId ?? 'unknown'}_${Date.now()}`);

  if (!fs.existsSync(videoPath)) {
    return { success: false, message: `视频文件不存在: ${videoPath}` };
  }

  const cookiePath = getCookiePath(accountId);
  if (!cookieExists(cookiePath)) {
    return { success: false, message: `Cookie 文件不存在，请先登录: ${cookiePath}` };
  }

  const browserMode = normalizeBrowserMode(ctx.browserMode);
  const headless = ctx.headless ?? false;
  const slowMo = ctx.slowMo ?? 200;

  if (browserMode === 'embedded' && !headless) {
    return uploadVideoInStandaloneBrowser(ctx);
  }

  logger.info(`启动小红书自动化浏览器: mode=${browserMode} headless=${headless} slowMo=${slowMo}`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless,
    slowMo,
    args: CHROME_ARGS,
  });

  let context: BrowserContext | undefined;
  let uploadSucceeded = false;
  let failureMessage = '';

  try {
    context = await browser.newContext({ storageState: cookiePath });

    const result = await debugRecorder.recordStep('upload_flow', async () => {
      if (!context) throw new Error('context not initialized');
      const page = await context.newPage();

      await debugRecorder.recordStep('navigate_to_publish', async () => {
        logger.info('导航到小红书发布页...');
        await page.goto(XHS_URLS.publish);
      }, { page });

      const loginVisible = await page
        .getByText('扫码登录', { exact: true })
        .isVisible()
        .catch(() => false);
      if (loginVisible) {
        throw new AuthError('Cookie 已失效，需要重新登录', { accountId }, 'xiaohongshu');
      }

      await debugRecorder.recordStep('select_video_file', async () => {
        const fileInput = page.locator(UPLOAD_SELECTORS.videoFileInput).first();
        await fileInput.waitFor({ state: 'attached', timeout: 10000 });
        await fileInput.setInputFiles(videoPath);
        logger.info(`视频文件已选择: ${videoPath}`);
      }, { page });

      const uploadSuccess = await debugRecorder.recordStep('wait_upload_complete', async () => {
        return await waitForUploadComplete(page);
      }, { page });

      if (!uploadSuccess) {
        throw new NetworkError('视频上传超时或失败', { videoPath }, 'xiaohongshu');
      }

      await debugRecorder.recordStep('fill_metadata', async () => {
        await fillTitle(page, title);
        await fillDescription(page, description);
        await addTopics(page, tags);
        await setCover(page, coverPath);
      }, { page });

      const publishSuccess = await debugRecorder.recordStep('execute_publish', async () => {
        return await clickPublish(page);
      }, { page });

      if (publishSuccess) {
        await page.waitForTimeout(3000);
        return { success: true, message: '视频发布成功' };
      } else {
        throw new ValidationError('视频发布失败', { step: 'click_publish' }, 'xiaohongshu');
      }
    }, { accountId, videoPath });

    return result;
  } catch (error) {
    const pErr = toPlatformError(error, 'xiaohongshu');
    logger.error(`上传过程出错: ${pErr.message}`);
    return { success: false, message: `上传过程出错: ${pErr.message}` };
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }
}

function extractVideoId(url: string): string | undefined {
  try {
    const match = url.match(/\/content\/manage\/detail\/([a-zA-Z0-9]+)/);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}