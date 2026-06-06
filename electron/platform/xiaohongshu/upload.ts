import fs from 'fs';
import type { Page } from 'patchright';
import { chromium } from 'patchright';
import { Logger } from '../../core/Logger';
import { XHS_URLS, UPLOAD_SELECTORS } from './selectors';
import { getCookiePath, cookieExists } from './cookie';
import type { UploadContext, UploadResult } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { toPlatformError, ValidationError, AuthError, NetworkError, SelectorError } from '../base/PlatformError';
import { getDebugRecorder } from '../base/DebugRecorder';

const logger = new Logger('XhsUpload');

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

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

  const pageCtx = { accountId, videoPath };

  let browser: import('patchright').Browser | undefined;
  let context: import('patchright').BrowserContext | undefined;

  try {
    browser = await chromium.launch({
      channel: 'chrome',
      headless: ctx.headless ?? false,
      slowMo: ctx.slowMo ?? 200,
      args: CHROME_ARGS,
    });
    context = await browser.newContext({ storageState: cookiePath });

    const result = await debugRecorder.recordStep('upload_flow', async () => {
      if (!context) throw new Error('context not initialized');
      const page = await context.newPage();
      const pageCtxWithPage = { ...pageCtx, page };

      await debugRecorder.recordStep('navigate_to_publish', async () => {
        logger.info('导航到小红书发布页...');
        await page.goto(XHS_URLS.publish);
      }, pageCtxWithPage);

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
      }, pageCtxWithPage);

      const uploadSuccess = await debugRecorder.recordStep('wait_upload_complete', async () => {
        return await waitForUploadComplete(page);
      }, pageCtxWithPage);

      if (!uploadSuccess) {
        throw new NetworkError('视频上传超时或失败', { videoPath }, 'xiaohongshu');
      }

      await debugRecorder.recordStep('fill_metadata', async () => {
        await fillTitle(page, title);
        await fillDescription(page, description);
        await addTopics(page, tags);
        await setCover(page, coverPath);
      }, pageCtxWithPage);

      const publishSuccess = await debugRecorder.recordStep('execute_publish', async () => {
        return await clickPublish(page);
      }, pageCtxWithPage);

      if (publishSuccess) {
        await page.waitForTimeout(3000);
        return { success: true, message: '视频发布成功' };
      } else {
        throw new ValidationError('视频发布失败', { step: 'click_publish' }, 'xiaohongshu');
      }
    }, pageCtx);

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
