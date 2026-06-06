import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS } from './selectors';
import type { PublishContext, PublishResult } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { TopicSanitizer } from '../base/TopicSanitizer';
import { getDebugRecorder } from '../base/DebugRecorder';
import { toPlatformError, ContentRejectedError, ValidationError } from '../base/PlatformError';

const logger = new Logger('ChannelsPublish');

const SHORT_TITLE_MAX_LEN = 16;
const SCHEDULE_POLL_INTERVAL_MS = 1000;
const SCHEDULE_POLL_MAX = 30;

function formatShortTitle(originTitle: string): string {
  const allowedSpecialChars = '\u300a\u300b\u201c\u201d\u2018\u2019:+?%°';
  const filtered: string[] = [];
  for (const ch of originTitle) {
    if (ch.match(/[a-zA-Z0-9\u4e00-\u9fa5]/) || allowedSpecialChars.includes(ch)) {
      filtered.push(ch);
    } else if (ch === ',' || ch === '，') {
      filtered.push(' ');
    }
  }
  let result = filtered.join('');
  if (result.length > SHORT_TITLE_MAX_LEN) {
    result = result.slice(0, SHORT_TITLE_MAX_LEN);
  } else if (result.length < 6) {
    result = result.padEnd(6, ' ');
  }
  return result;
}

export async function fillVideoMetadata(
  page: Page,
  title: string,
  description?: string,
  tags?: string[]
): Promise<void> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
    stepIntervalSec: { min: 1.0, max: 2.0 },
  });

  try {
    const editor = page.locator('div.input-editor').first();
    if (!(await editor.count())) {
      logger.warn('未找到视频号描述输入框 (div.input-editor)');
      return;
    }
    await editor.waitFor({ state: 'visible', timeout: 10000 });
    await rc.humanClick('div.input-editor');

    await page.keyboard.type(title);
    logger.info(`视频号内容已填写: ${title}`);

    if (description && description.trim().length > 0) {
      await page.keyboard.press('Enter');
      await page.keyboard.type(description);
      logger.info(`视频号描述已换行填写: ${description.slice(0, 30)}${description.length > 30 ? '...' : ''}`);
    }

    if (tags && tags.length > 0) {
      const sanitizedTags = TopicSanitizer.limitTopics(
        TopicSanitizer.cleanTopics(tags, { maxTopics: 10, platform: 'channels' }),
        10,
      );
      for (const tag of sanitizedTags) {
        const tagText = tag.startsWith('#') ? tag.slice(1) : tag;
        if (!tagText) continue;
        await page.keyboard.press('Enter');
        await page.keyboard.type(`#${tagText}`);
        await page.keyboard.press('Space');
        await page.waitForTimeout(800);

        const suggestion = page.locator('div[role="listbox"] [role="option"], ul[role="listbox"] li, .topic-suggestion, [class*="topic-suggest"] li').first();
        if (await suggestion.count() && await suggestion.isVisible().catch(() => false)) {
          await suggestion.click();
          logger.info(`视频号话题已选择（建议）: #${tagText}`);
        } else {
          logger.info(`视频号话题已键入（无建议）: #${tagText}`);
        }
        await page.waitForTimeout(300);
      }
    }
  } catch (error) {
    throw toPlatformError(error, 'channels', { step: 'fillVideoMetadata', title });
  }
}

export async function setShortTitle(
  page: Page,
  title: string,
  overrideShortTitle?: string
): Promise<void> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const shortTitleInput = page.locator(UPLOAD_SELECTORS.shortTitleInput).first();
    if (!(await shortTitleInput.count()) || !(await shortTitleInput.isVisible().catch(() => false))) {
      logger.info('当前页面无短标题输入框，跳过');
      return;
    }

    const value = (overrideShortTitle && overrideShortTitle.length > 0)
      ? overrideShortTitle.slice(0, SHORT_TITLE_MAX_LEN)
      : formatShortTitle(title);
    await rc.humanClick(UPLOAD_SELECTORS.shortTitleInput);
    await rc.humanType(UPLOAD_SELECTORS.shortTitleInput, value);
    logger.info(`短标题已设置: ${value}`);
  } catch (error) {
    logger.warn('设置短标题失败，继续发布:', error);
  }
}

export async function applyLocation(
  page: Page,
  location?: string
): Promise<void> {
  if (location === undefined) {
    logger.info('位置字段未提供，跳过');
    return;
  }
  if (location === '') {
    logger.info('位置显式为空，跳过位置设置');
    return;
  }

  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const input = page.locator(UPLOAD_SELECTORS.locationInput).first();
    if (!(await input.count()) || !(await input.isVisible().catch(() => false))) {
      logger.warn('未找到位置输入框');
      return;
    }

    await rc.humanClick(UPLOAD_SELECTORS.locationInput);
    await rc.humanType(UPLOAD_SELECTORS.locationInput, location);
    await page.waitForTimeout(800);

    const optionPattern = UPLOAD_SELECTORS.locationOption.replace('{location}', location);
    const option = page.locator(optionPattern).first();
    if (await option.isVisible().catch(() => false)) {
      await rc.humanClick(optionPattern);
      logger.info(`已选择位置: ${location}`);
    } else {
      logger.warn(`位置选项未找到: ${location}，已输入但未确认`);
    }
  } catch (error) {
    logger.warn('应用位置失败，继续发布:', error);
  }
}

export async function applyCollection(
  page: Page,
  collectionName?: string
): Promise<void> {
  if (!collectionName) {
    logger.info('未提供合集，跳过');
    return;
  }

  const rc = new PageRiskControl(page, {
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const selectPattern = UPLOAD_SELECTORS.collectionSelect;
    const select = page.locator(selectPattern).first();
    if (!(await select.count()) || !(await select.isVisible().catch(() => false))) {
      logger.warn('未找到添加到合集入口');
      return;
    }
    await rc.humanClick(selectPattern);
    await page.waitForTimeout(500);

    const optionPattern = UPLOAD_SELECTORS.collectionOption;
    const options = page.locator(optionPattern);
    if ((await options.count()) < 1) {
      logger.warn('合集选项列表为空');
      return;
    }
    const firstOption = options.first();
    await rc.humanClick(optionPattern + ' >> nth=0');
    logger.info('已选择第一个合集选项（视频号 API 不按名称筛选）');
  } catch (error) {
    logger.warn('应用合集失败，继续发布:', error);
  }
}

export async function applyProductLink(
  page: Page,
  productLink?: string,
  productTitle?: string
): Promise<void> {
  if (!productLink) {
    logger.info('未提供商品链接，跳过');
    return;
  }

  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const addBtn = page.locator(UPLOAD_SELECTORS.productLinkAddBtn).first();
    if (!(await addBtn.count()) || !(await addBtn.isVisible().catch(() => false))) {
      logger.warn('未找到添加链接按钮');
      return;
    }
    await rc.humanClick(UPLOAD_SELECTORS.productLinkAddBtn);
    await page.waitForTimeout(500);

    const input = page.locator(UPLOAD_SELECTORS.productLinkInput).first();
    if (!(await input.count()) || !(await input.isVisible().catch(() => false))) {
      logger.warn('链接弹窗中未找到输入框');
      return;
    }
    await rc.humanClick(UPLOAD_SELECTORS.productLinkInput);
    await rc.humanType(UPLOAD_SELECTORS.productLinkInput, productLink);
    logger.info(`商品链接已填写: ${productLink}`);
  } catch (error) {
    logger.warn('应用商品链接失败，继续发布:', error);
  }
}

export async function applySchedule(
  page: Page,
  scheduledTime?: Date
): Promise<boolean> {
  if (!scheduledTime) {
    return false;
  }
  const now = new Date();
  if (scheduledTime.getTime() <= now.getTime() + 15 * 60 * 1000) {
    throw new ValidationError(
      '视频号定时发布时间需晚于当前时间 15 分钟',
      { scheduledTime, now },
      'channels'
    );
  }
  if (scheduledTime.getTime() > now.getTime() + 7 * 24 * 60 * 60 * 1000) {
    throw new ValidationError(
      '视频号定时发布不能超过 7 天',
      { maxDays: 7 },
      'channels'
    );
  }

  const rc = new PageRiskControl(page, {
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const labels = page.locator(UPLOAD_SELECTORS.scheduleLabel);
    if (!(await labels.count())) {
      logger.warn('未找到定时 label');
      return false;
    }
    await labels.nth(1).click();
    await page.waitForTimeout(300);

    const dateInput = page.locator(UPLOAD_SELECTORS.scheduleDateInput).first();
    if (!(await dateInput.count())) {
      logger.warn('未找到日期输入框');
      return false;
    }
    await dateInput.click();
    await page.waitForTimeout(300);

    const targetMonth = scheduledTime.getMonth() + 1;
    for (let i = 0; i < SCHEDULE_POLL_MAX; i++) {
      const monthLabel = page.locator(UPLOAD_SELECTORS.scheduleMonthLabel).first();
      const currentMonthText = await monthLabel.innerText().catch(() => '');
      if (currentMonthText === `${targetMonth}月`) {
        break;
      }
      const nextBtn = page.locator(UPLOAD_SELECTORS.scheduleMonthNext).first();
      if (!(await nextBtn.count())) {
        logger.warn('未找到月份切换按钮');
        return false;
      }
      await rc.humanClick(UPLOAD_SELECTORS.scheduleMonthNext);
      await page.waitForTimeout(SCHEDULE_POLL_INTERVAL_MS);
    }

    const dayTable = page.locator(UPLOAD_SELECTORS.scheduleDayTable);
    const dayCount = await dayTable.count();
    for (let i = 0; i < dayCount; i++) {
      const el = dayTable.nth(i);
      const cls = (await el.getAttribute('class')) ?? '';
      if (cls.includes(UPLOAD_SELECTORS.scheduleDisabledClass)) continue;
      const text = (await el.innerText()).trim();
      if (text === String(scheduledTime.getDate())) {
        await el.click();
        break;
      }
    }

    const timeInput = page.locator(UPLOAD_SELECTORS.scheduleTimeInput).first();
    if (!(await timeInput.count())) {
      logger.warn('未找到时间输入框');
      return false;
    }
    await timeInput.click();
    await page.keyboard.press('Control+A');
    const hourStr = scheduledTime.getHours().toString().padStart(2, '0');
    await page.keyboard.type(hourStr);
    await page.locator('div.input-editor').first().click();
    logger.info(`定时发表已设置: ${scheduledTime.toISOString()}`);
    return true;
  } catch (error) {
    logger.warn('应用定时发表失败，继续发布:', error);
    return false;
  }
}

export async function applyOriginalStatement(
  page: Page,
  isOriginal: boolean = true,
  originalCategory?: string
): Promise<void> {
  if (!isOriginal) {
    logger.info('未声明原创，跳过');
    return;
  }

  const rc = new PageRiskControl(page, {
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const labelLocator = page.getByLabel('视频为原创');
    let originalChecked = false;
    if (await labelLocator.count()) {
      const beforeChecked = await labelLocator.isChecked().catch(() => false);
      if (!beforeChecked) {
        await labelLocator.check();
      }
      originalChecked = await labelLocator.isChecked().catch(() => false);
    } else {
      const checkbox = page.locator(UPLOAD_SELECTORS.originalStatement).first();
      if ((await checkbox.count()) && (await checkbox.isVisible().catch(() => false))) {
        const isChecked = await checkbox.isChecked().catch(() => false);
        if (!isChecked) {
          await rc.humanClick(UPLOAD_SELECTORS.originalStatement);
        }
        originalChecked = !isChecked;
      }
    }

    if (!originalChecked) {
      logger.warn('原创复选框未勾选成功，跳过原创声明');
      return;
    }

    await page.waitForTimeout(800);

    const agreementCheckbox = page.locator('label:has-text("我已阅读并同意"):visible input[type="checkbox"]').first();
    if (await agreementCheckbox.count()) {
      const isAgreementChecked = await agreementCheckbox.isChecked().catch(() => false);
      if (!isAgreementChecked) {
        await agreementCheckbox.check();
        logger.info('已勾选原创声明条款');
      }
    } else {
      const agreementLabel = page.locator(UPLOAD_SELECTORS.originalAgreement).first();
      if (await agreementLabel.isVisible().catch(() => false)) {
        await rc.humanClick(UPLOAD_SELECTORS.originalAgreement);
      }
    }

    const confirmBtn = page.locator('div.declare-original-dialog button:has-text("确定"), div.declare-original-dialog button:has-text("确认"), button.primary:has-text("确定")').first();
    if (await confirmBtn.count()) {
      await confirmBtn.click();
      await page.waitForTimeout(500);
      logger.info('原创声明弹窗已点击确认');
    } else {
      const anyConfirm = page.locator('button:has-text("确定"), button:has-text("确认"), button:has-text("完成")').first();
      if (await anyConfirm.isVisible().catch(() => false)) {
        await anyConfirm.click();
        await page.waitForTimeout(500);
        logger.info('原创声明弹窗通用确认按钮已点击');
      }
    }

    if (!originalCategory) {
      return;
    }

    const categoryForm = page.locator(UPLOAD_SELECTORS.originalCategoryForm).first();
    if (!(await categoryForm.count())) {
      return;
    }
    await page.locator('div.form-content:visible').first().click();
    await page.waitForTimeout(300);
    const optionPattern = UPLOAD_SELECTORS.originalCategoryOption.replace('{category}', originalCategory);
    const option = page.locator(optionPattern).first();
    if (await option.isVisible().catch(() => false)) {
      await option.click();
      logger.info(`原创类型已选择: ${originalCategory}`);
    }
  } catch (error) {
    logger.warn('应用原创声明失败，继续发布:', error);
  }
}

async function handleCoverPrompt(page: Page): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
  });

  try {
    const coverBtn = page.locator(UPLOAD_SELECTORS.coverSelectBtn).first();
    if (!(await coverBtn.isVisible().catch(() => false))) {
      return false;
    }

    logger.info('检测到封面设置选项');
    await rc.humanClick(UPLOAD_SELECTORS.coverSelectBtn);
    await page.waitForTimeout(1000);

    const confirmBtn = page.locator(UPLOAD_SELECTORS.coverConfirmBtn).first();
    if (await confirmBtn.isVisible().catch(() => false)) {
      await rc.humanClick(UPLOAD_SELECTORS.coverConfirmBtn);
      logger.info('封面已设置');
      return true;
    }

    return false;
  } catch (error) {
    logger.warn('处理封面提示失败:', error);
    return false;
  }
}

async function executePublish(page: Page, maxRetries: number = 3): Promise<boolean> {
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 50, max: 200 },
    clickDelayMs: { min: 100, max: 300 },
    stepIntervalSec: { min: 1.0, max: 2.0 },
  });

  for (let retry = 0; retry < maxRetries; retry++) {
    try {
      const publishBtn = page.locator(UPLOAD_SELECTORS.publishButton).first();
      await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
      await rc.humanClick(UPLOAD_SELECTORS.publishButton);
      logger.info(`发布按钮已点击（第 ${retry + 1} 次）`);

      await page.waitForTimeout(2000);

      const successToast = page.locator(UPLOAD_SELECTORS.publishSuccessToast);
      if (await successToast.isVisible().catch(() => false)) {
        logger.info('发布成功：检测到成功提示');
        return true;
      }

      const currentUrl = page.url();
      if (currentUrl.includes('/platform/post/manage')) {
        logger.info('发布成功：已跳转到管理页');
        return true;
      }

      if (await handleCoverPrompt(page)) {
        continue;
      }

      const failedToast = page.locator(UPLOAD_SELECTORS.publishFailedToast);
      if (await failedToast.isVisible().catch(() => false)) {
        logger.warn('发布失败，正在重试...');
        await page.waitForTimeout(1000);
        continue;
      }
    } catch (error) {
        logger.warn(`发布尝试 ${retry + 1} 失败:`, error);
        if (retry === maxRetries - 1) {
          throw toPlatformError(error, 'channels', { step: 'executePublish', retry });
        }
      }
  }

  return false;
}

export async function publish(ctx: PublishContext): Promise<PublishResult> {
  const {
    page: existingPage,
    title,
    description,
    tags,
    accountId,
    shortTitle,
    location,
    collection,
    productLink,
    isOriginal,
    scheduledTime,
  } = ctx;

  if (!existingPage) {
    return { success: false, message: '发布需要 page 参数' };
  }

  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`channels_${accountId ?? 'unknown'}_${Date.now()}`);
  const pageCtx = { page: existingPage, accountId };

  try {
    const page = existingPage;
    const sanitizedTags = TopicSanitizer.limitTopics(
      TopicSanitizer.cleanTopics(tags ?? [], { maxTopics: 0, platform: 'channels' }),
      0,
    );

    await debugRecorder.recordStep('fill_video_metadata', async () => {
      await fillVideoMetadata(page, title, description, sanitizedTags);
    }, pageCtx);

    await debugRecorder.recordStep('set_short_title', async () => {
      await setShortTitle(page, title, shortTitle);
    }, pageCtx);

    await debugRecorder.recordStep('apply_location', async () => {
      await applyLocation(page, location);
    }, pageCtx);

    await debugRecorder.recordStep('apply_collection', async () => {
      await applyCollection(page, collection);
    }, pageCtx);

    await debugRecorder.recordStep('apply_product_link', async () => {
      await applyProductLink(page, productLink, ctx.productTitle);
    }, pageCtx);

    await debugRecorder.recordStep('apply_schedule', async () => {
      await applySchedule(page, scheduledTime);
    }, pageCtx);

    await debugRecorder.recordStep('apply_original_statement', async () => {
      await applyOriginalStatement(page, isOriginal ?? true, (ctx as { category?: string }).category);
    }, pageCtx);

    if (ctx.dryRun) {
      logger.info(`[DRY RUN] Skipping final publish for ${ctx.accountId}`);
      return {
        success: true,
        message: '[DEBUG] 预发布模式：已跳过最终发布按钮',
        videoId: ctx.videoId,
      };
    }

    const success = await debugRecorder.recordStep('execute_publish', async () => {
      return await executePublish(page);
    }, pageCtx);

    if (success) {
      const currentUrl = page.url();
      const videoId = extractVideoId(currentUrl);

      return {
        success: true,
        message: '视频发布成功',
        videoId,
      };
    } else {
      throw new ContentRejectedError('视频发布失败，请检查是否有未填写的必填项', undefined, 'channels');
    }
  } catch (error) {
    const platformError = toPlatformError(error, 'channels', {
      step: 'publish',
      accountId,
      title,
    });
    logger.error(`发布过程出错: ${platformError.message}`);
    return {
      success: false,
      message: platformError.userMessage,
    };
  }
}

function extractVideoId(url: string): string | undefined {
  const match = url.match(/\/post\/manage\?.*id=([^&]+)/);
  return match ? match[1] : undefined;
}

export function getCoverRatios(): string[] {
  return ['3:4', '4:3'];
}
