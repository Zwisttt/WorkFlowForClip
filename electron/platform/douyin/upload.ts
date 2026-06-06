import fs from 'fs';
import path from 'path';
import type { Page, BrowserContext } from 'patchright';
import { chromium } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS, DOUYIN_URLS } from './selectors';
import { getCookiePath, cookieExists } from './cookie';
import type { UploadContext, UploadResult } from '../base/types';
import { TopicSanitizer } from '../base/TopicSanitizer';
import { PageRiskControl } from '../base/RiskControl';
import { toPlatformError, NetworkError, AuthError, SelectorError, ValidationError, ContentRejectedError } from '../base/PlatformError';
import { getDebugRecorder } from '../base/DebugRecorder';

const logger = new Logger('DouyinUpload');

const CHROME_ARGS = [
  '--disable-gpu',
  '--disable-gpu-sandbox',
  '--disable-software-rasterizer',
  '--disable-dev-shm-usage',
  '--disable-extensions',
  '--no-sandbox',
];

const UPLOAD_TIMEOUT = 120000;
const MAX_RETRIES = 3;

function getUserDataDir(accountId: string): string {
  const baseDir = path.join(process.cwd(), 'data', 'user_data', 'douyin');
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  return path.join(baseDir, accountId);
}

async function waitForUploadComplete(
  page: Page,
  maxWaitMs: number = UPLOAD_TIMEOUT
): Promise<boolean> {
  const startTime = Date.now();
  const debugRecorder = getDebugRecorder();

  try {
    return await debugRecorder.recordStep('wait_upload_complete', async () => {
      while (Date.now() - startTime < maxWaitMs) {
        const processingVisible = await page.getByText('视频上传中').isVisible().catch(() => false);
        const successVisible = await page.getByText('上传成功').isVisible().catch(() => false);
        const failedVisible = await page.getByText('上传失败').isVisible().catch(() => false);

        if (successVisible) {
          logger.info('视频上传成功');
          return true;
        }

        if (failedVisible) {
          logger.error('视频上传失败');
          throw new ContentRejectedError('视频上传失败', undefined, 'douyin');
        }

        if (processingVisible) {
          logger.info('视频处理中...');
        }

        await page.waitForTimeout(2000);
      }

      throw new NetworkError('视频上传超时', undefined, 'douyin');
    }, { page });
  } catch (error) {
    throw toPlatformError(error, 'douyin');
  }
}

async function fillVideoMetadata(
  page: Page,
  title: string,
  description?: string,
  tags?: string[]
): Promise<void> {
  const debugRecorder = getDebugRecorder();
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 100, max: 300 },
    clickDelayMs: { min: 200, max: 500 },
    stepIntervalSec: { min: 2.0, max: 3.0 },
  });

  try {
    await debugRecorder.recordStep('fill_video_metadata', async () => {
      const titleInput = page.locator(UPLOAD_SELECTORS.titleInput).first();
      await titleInput.waitFor({ state: 'visible', timeout: 10000 });
      await rc.humanClick(UPLOAD_SELECTORS.titleInput);
      await rc.humanType(UPLOAD_SELECTORS.titleInput, title);
      logger.info(`标题已填写: ${title}`);

      if (description) {
        try {
          const descInput = page.locator(UPLOAD_SELECTORS.descriptionEditor);
          await descInput.waitFor({ state: 'visible', timeout: 5000 });
          await rc.humanClick(UPLOAD_SELECTORS.descriptionEditor);
          await rc.humanType(UPLOAD_SELECTORS.descriptionEditor, description);
          logger.info('描述已填写');
        } catch (error) {
          logger.warn('描述输入框未找到或填写失败');
        }
      }

      if (tags && tags.length > 0) {
        try {
          const sanitizedTags = TopicSanitizer.cleanTopics(tags, {
            maxTopics: 5,
            platform: 'douyin',
          });

          for (const tag of sanitizedTags) {
            const tagInput = page.locator(UPLOAD_SELECTORS.addTagDropdown);
            await tagInput.waitFor({ state: 'visible', timeout: 5000 });
            await rc.humanClick(UPLOAD_SELECTORS.addTagDropdown);
            await rc.humanType(UPLOAD_SELECTORS.addTagDropdown, tag.replace(/^#/, ''));
            await page.waitForTimeout(500);
            await page.keyboard.press('Enter');
            logger.info(`标签已添加: ${tag}`);
          }
        } catch (error) {
          logger.warn('标签添加失败', { error });
        }
      }
    }, { page });
  } catch (error) {
    throw toPlatformError(error, 'douyin');
  }
}

async function handleCoverPrompt(page: Page): Promise<boolean> {
  const debugRecorder = getDebugRecorder();
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 100, max: 300 },
    clickDelayMs: { min: 200, max: 500 },
  });

  try {
    return await debugRecorder.recordStep('handle_cover_prompt', async () => {
      const coverPrompt = page.getByText('请设置封面后再发布', { exact: false });
      const isVisible = await coverPrompt.isVisible().catch(() => false);

      if (!isVisible) {
        return false;
      }

      logger.info('检测到封面提示，自动选择推荐封面');

      const recommendCover = page.locator(UPLOAD_SELECTORS.recommendCover).first();
      if (await recommendCover.isVisible().catch(() => false)) {
        await rc.humanClick(UPLOAD_SELECTORS.recommendCover);
        await page.waitForTimeout(500);

        const confirmBtn = page.getByRole('button', { name: '确定' });
        if (await confirmBtn.isVisible().catch(() => false)) {
          await rc.humanClick('button:has-text("确定")');
          logger.info('封面已设置');
          return true;
        }
      }

      return false;
    }, { page });
  } catch (error) {
    logger.warn('处理封面提示失败', { error });
    return false;
  }
}

async function clickPublish(page: Page, maxRetries: number = MAX_RETRIES): Promise<boolean> {
  const debugRecorder = getDebugRecorder();
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 100, max: 300 },
    clickDelayMs: { min: 200, max: 500 },
    stepIntervalSec: { min: 2.0, max: 3.0 },
  });

  try {
    return await debugRecorder.recordStep('click_publish', async () => {
      for (let retry = 0; retry < maxRetries; retry++) {
        const publishBtn = page.locator(UPLOAD_SELECTORS.publishButton).first();
        await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
        await rc.humanClick(UPLOAD_SELECTORS.publishButton);
        logger.info(`发布按钮已点击（第 ${retry + 1} 次）`);

        await page.waitForTimeout(2000);

        const currentUrl = page.url();
        if (currentUrl.includes('content/manage')) {
          logger.info('发布成功：已跳转到管理页');
          return true;
        }

        const successText = page.locator('text=/发布成功|提交成功/');
        if (await successText.isVisible().catch(() => false)) {
          logger.info('发布成功：检测到成功文本');
          return true;
        }

        if (await handleCoverPrompt(page)) {
          continue;
        }

        const failedText = page.getByText('发布失败', { exact: false });
        if (await failedText.isVisible().catch(() => false)) {
          logger.warn('发布失败，正在重试...');
          await page.waitForTimeout(1000);
          continue;
        }
      }

      return false;
    }, { page });
  } catch (error) {
    throw toPlatformError(error, 'douyin');
  }
}

function extractVideoId(url: string): string | undefined {
  const match = url.match(/\/content\/manage\?.*item_ids=([^&]+)/);
  return match ? match[1] : undefined;
}

export async function uploadVideo(ctx: UploadContext): Promise<UploadResult> {
  const { videoPath, title, description, tags, accountId, headless = false, slowMo = 200 } = ctx;
  const debugRecorder = getDebugRecorder();

  if (!fs.existsSync(videoPath)) {
    return {
      success: false,
      message: `视频文件不存在: ${videoPath}`,
    };
  }

  const cookiePath = getCookiePath(accountId);
  if (!cookieExists(cookiePath)) {
    return {
      success: false,
      message: `Cookie 文件不存在: ${cookiePath}`,
    };
  }

  const userDataDir = getUserDataDir(accountId);
  const browser = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless,
    slowMo,
    args: CHROME_ARGS,
  });

  try {
    const page = await browser.newPage();
    const pageCtx = { page, accountId };

    debugRecorder.setSessionId(`douyin_upload_${accountId}_${Date.now()}`);

    await debugRecorder.recordStep('goto_upload_page', async () => {
      logger.info('导航到抖音上传页...');
      await page.goto(DOUYIN_URLS.upload, { waitUntil: 'domcontentloaded' });
    }, pageCtx);

    const loginCheck = await debugRecorder.recordStep('check_login_status', async () => {
      const loginButtonVisible = await page.getByText('扫码登录').isVisible().catch(() => false);
      if (loginButtonVisible) {
        throw new AuthError('Cookie 已失效，需要重新登录', undefined, 'douyin');
      }
      return true;
    }, pageCtx);

    if (!loginCheck) {
      return {
        success: false,
        message: '登录状态检查失败',
      };
    }

    await debugRecorder.recordStep('select_video_file', async () => {
      const fileInput = page.locator(UPLOAD_SELECTORS.videoFileInput);
      await fileInput.setInputFiles(videoPath);
      logger.info(`视频文件已选择: ${videoPath}`);
    }, pageCtx);

    const uploadSuccess = await waitForUploadComplete(page);
    if (!uploadSuccess) {
      return {
        success: false,
        message: '视频上传超时或失败',
      };
    }

    await fillVideoMetadata(page, title, description, tags);

    const publishSuccess = await clickPublish(page);

    if (publishSuccess) {
      await debugRecorder.recordStep('extract_video_id', async () => {
        await page.waitForTimeout(3000);
        const currentUrl = page.url();
        const videoId = extractVideoId(currentUrl);
        logger.info(`视频发布成功, videoId: ${videoId}`);
        return videoId;
      }, pageCtx);

      const currentUrl = page.url();
      return {
        success: true,
        message: '视频发布成功',
        videoId: extractVideoId(currentUrl),
      };
    } else {
      return {
        success: false,
        message: '视频发布失败',
      };
    }
  } catch (error) {
    const pErr = toPlatformError(error, 'douyin');
    logger.error('上传过程出错', { error: pErr });
    return { success: false, message: pErr.userMessage };
  } finally {
    await browser.close();
  }
}

export function getCoverRatios(): string[] {
  return ['16:9', '4:3', '3:4'];
}
