import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS, DOUYIN_URLS } from './selectors';
import { fillVideoMetadata } from './publish';
import type { ScheduleContext, ScheduleResult } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { toPlatformError, ValidationError } from '../base/PlatformError';
import { getDebugRecorder } from '../base/DebugRecorder';

const logger = new Logger('DouyinSchedule');

const MAX_SCHEDULE_DAYS = 30;
const MIN_SCHEDULE_HOURS = 2;

export interface ScheduleValidationResult {
  valid: boolean;
  message?: string;
}

export function validateScheduleDate(scheduledTime: Date): ScheduleValidationResult {
  const now = new Date();

  if (scheduledTime <= now) {
    return {
      valid: false,
      message: '定时发布时间必须晚于当前时间',
    };
  }

  const minScheduleTime = new Date(now.getTime() + MIN_SCHEDULE_HOURS * 60 * 60 * 1000);
  if (scheduledTime < minScheduleTime) {
    return {
      valid: false,
      message: `定时发布时间必须至少提前 ${MIN_SCHEDULE_HOURS} 小时`,
    };
  }

  const maxScheduleDate = new Date(now.getTime() + MAX_SCHEDULE_DAYS * 24 * 60 * 60 * 1000);
  if (scheduledTime > maxScheduleDate) {
    return {
      valid: false,
      message: `抖音定时发布最多支持 ${MAX_SCHEDULE_DAYS} 天`,
    };
  }

  return { valid: true };
}

async function setScheduledTime(page: Page, scheduledTime: Date): Promise<boolean> {
  const debugRecorder = getDebugRecorder();
  const rc = new PageRiskControl(page, {
    typingDelayMs: { min: 100, max: 300 },
    clickDelayMs: { min: 200, max: 500 },
    stepIntervalSec: { min: 2.0, max: 3.0 },
  });

  try {
    return await debugRecorder.recordStep('set_scheduled_time', async () => {
      const scheduleTab = page.getByText('定时发布', { exact: true });
      const hasScheduleTab = await scheduleTab.isVisible().catch(() => false);

      if (!hasScheduleTab) {
        logger.error('未找到"定时发布"选项');
        return false;
      }

      await rc.humanClick('text="定时发布"');
      await page.waitForTimeout(500);

      const dateInput = page.locator(UPLOAD_SELECTORS.scheduleDatePicker || 'input[placeholder*="日期"]');
      if (await dateInput.isVisible().catch(() => false)) {
        const year = scheduledTime.getFullYear();
        const month = String(scheduledTime.getMonth() + 1).padStart(2, '0');
        const day = String(scheduledTime.getDate()).padStart(2, '0');
        const hours = String(scheduledTime.getHours()).padStart(2, '0');
        const minutes = String(scheduledTime.getMinutes()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day} ${hours}:${minutes}`;

        await rc.humanClick(UPLOAD_SELECTORS.scheduleDatePicker);
        await rc.humanType(UPLOAD_SELECTORS.scheduleDatePicker, dateStr);
        await page.keyboard.press('Enter');
        logger.info(`定时发布时间已设置: ${dateStr}`);
        return true;
      }

      return false;
    }, { page });
  } catch (error) {
    logger.error('设置定时发布时间失败', { error });
    return false;
  }
}

export async function schedule(ctx: ScheduleContext): Promise<ScheduleResult> {
  const { page, title, description, tags, scheduledTime } = ctx;
  const debugRecorder = getDebugRecorder();

  if (!page) {
    return { success: false, message: '定时发布需要 page 参数' };
  }

  if (!scheduledTime) {
    return { success: false, message: '定时发布需要指定发布时间' };
  }

  const validation = validateScheduleDate(scheduledTime);
  if (!validation.valid) {
    return { success: false, message: validation.message ?? '校验失败' };
  }

  try {
    await debugRecorder.recordStep('fill_metadata_for_schedule', async () => {
      await fillVideoMetadata(page, title, description, tags);
    }, { page });

    const scheduleSet = await setScheduledTime(page, scheduledTime);
    if (!scheduleSet) {
      return { success: false, message: '设置定时发布时间失败' };
    }

    await debugRecorder.recordStep('confirm_schedule_publish', async () => {
      const rc = new PageRiskControl(page, {
        clickDelayMs: { min: 200, max: 500 },
      });

      const confirmBtn = page.getByRole('button', { name: '确认定时', exact: false });
      if (await confirmBtn.isVisible().catch(() => false)) {
        await rc.humanClick('button:has-text("确认定时")');
      } else {
        const publishBtn = page.getByRole('button', { name: '发布', exact: true });
        await rc.humanClick('button:has-text("发布")');
      }
    }, { page });

    await page.waitForTimeout(2000);

    const successCheck = await debugRecorder.recordStep('verify_schedule_success', async () => {
      const successText = page.locator('text=/定时发布设置成功|已设置定时发布/');
      if (await successText.isVisible().catch(() => false)) {
        logger.info('定时发布设置成功');
        return true;
      }

      const currentUrl = page.url();
      if (currentUrl.includes('content/manage')) {
        logger.info('定时发布设置成功（已跳转管理页）');
        return true;
      }

      return false;
    }, { page });

    if (successCheck) {
      return { success: true, message: '定时发布设置成功', scheduledTime };
    }

    return { success: false, message: '定时发布设置可能失败，未检测到成功标志' };
  } catch (error) {
    const pErr = toPlatformError(error, 'douyin');
    logger.error(`定时发布设置出错: ${pErr.message}`);
    return { success: false, message: `定时发布设置出错: ${pErr.userMessage}` };
  }
}
