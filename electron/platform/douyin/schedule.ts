import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS, DOUYIN_URLS } from './selectors';
import { fillVideoMetadata } from './publish';
import type { ScheduleContext, ScheduleResult } from '../base/types';
import { PageRiskControl } from '../base/RiskControl';
import { toPlatformError, ValidationError } from '../base/PlatformError';
import { getDebugRecorder } from '../base/DebugRecorder';
import { formatScheduleDateTime } from '../base/utils/schedule';

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

  try {
    return await debugRecorder.recordStep('set_scheduled_time', async () => {
      // 1. 点击「定时发布」radio
      const scheduleRadio = page.locator(UPLOAD_SELECTORS.scheduleRadio);
      if (!(await scheduleRadio.isVisible().catch(() => false))) {
        logger.error('未找到"定时发布"选项');
        return false;
      }
      await scheduleRadio.click();
      await page.waitForTimeout(1000);

      // 2. 点击日期输入框，弹出 Semi Design DatePicker 弹层
      const dateInput = page.locator(UPLOAD_SELECTORS.scheduleDatePicker);
      if (!(await dateInput.isVisible().catch(() => false))) {
        logger.error('未找到日期时间输入框');
        return false;
      }
      await dateInput.click();
      await page.waitForTimeout(800);

      // 3. 等待日历面板出现（Semi Design: .semi-datepicker）
      const panel = page.locator('.semi-datepicker').first();
      await panel.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      if (!(await panel.isVisible().catch(() => false))) {
        logger.warn('日历面板未出现，回退 fill');
        const dateStr = formatScheduleDateTime(scheduledTime);
        if (dateStr) { await dateInput.fill(dateStr); await page.keyboard.press('Enter'); }
        return true;
      }

      const day = scheduledTime.getDate();
      const month = scheduledTime.getMonth() + 1;
      const year = scheduledTime.getFullYear();
      const hour = String(scheduledTime.getHours()).padStart(2, '0');
      const minute = String(scheduledTime.getMinutes()).padStart(2, '0');
      const dateIso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      // 4. 翻到目标月份（用 aria-label="Next month"/"Previous month"）
      const nextBtn = () => page.locator('.semi-datepicker-navigation [aria-label="Next month"]').first();
      const prevBtn = () => page.locator('.semi-datepicker-navigation [aria-label="Previous month"]').first();
      const monthLabel = () => panel.locator('.semi-datepicker-navigation-month span').first();

      for (let i = 0; i < 24; i++) {
        const text = (await monthLabel().textContent().catch(() => '')) || '';
        const y = Number(text.match(/\d{4}/)?.[0]);
        const m = (() => {
          const cn = text.match(/(\d{1,2})\s*月/)?.[1];
          if (cn) return Number(cn);
          const en = ['january','february','march','april','may','june','july','august','september','october','november','december'];
          return en.indexOf(text.toLowerCase().match(/[a-z]+/g)?.[0] ?? '') + 1;
        })();
        if (y === year && m === month) break;
        const btn = (y && y * 12 + m < year * 12 + month) ? nextBtn() : prevBtn();
        if (!(await btn.isVisible().catch(() => false))) break;
        await btn.click();
        await page.waitForTimeout(300);
      }

      // 5. 点击目标日期 — aria-label 是 "YYYY-MM-DD"
      const dayCell = panel.locator(
        `[role="gridcell"][aria-label="${dateIso}"]:not([aria-disabled="true"])`
      ).first();
      if (!(await dayCell.isVisible().catch(() => false))) {
        logger.warn(`日期 ${dateIso} 不可点击`);
        return false;
      }
      await dayCell.click();
      logger.info(`已点击日期: ${dateIso}`);
      await page.waitForTimeout(500);

      // 6. 切换到时间面板（aria-label="Switch to time panel"）
      const switchBtn = panel.locator('[aria-label="Switch to time panel"]').first();
      if (await switchBtn.isVisible().catch(() => false)) {
        await switchBtn.click();
        await page.waitForTimeout(500);

        // 点小时
        const hourOpt = panel.locator('.semi-timepicker-list-hour ul[role="listbox"] [role="option"]')
          .filter({ hasText: new RegExp(`^${hour}`) }).first();
        if (await hourOpt.count() > 0) { await hourOpt.click(); await page.waitForTimeout(300); }

        // 点分钟
        const minOpt = panel.locator('.semi-timepicker-list-minute ul[role="listbox"] [role="option"]')
          .filter({ hasText: new RegExp(`^${minute}`) }).first();
        if (await minOpt.count() > 0) { await minOpt.click(); await page.waitForTimeout(300); }
      }

      // 7. 确认 — footer 有确定按钮则点，否则 Escape 关闭
      const confirmBtn = panel.locator(
        '.semi-datepicker-footer button.semi-button-solid'
      ).first();
      if (await confirmBtn.isVisible().catch(() => false)) {
        await confirmBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
      await page.waitForTimeout(500);

      // 8. 回读校验
      const actual = await dateInput.inputValue().catch(() => '');
      logger.info(`定时发布: 期望=${formatScheduleDateTime(scheduledTime)} 回读=${actual}`);
      if (!actual.includes(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)) {
        logger.warn(`回读值不匹配: ${actual}`);
        return false;
      }

      return true;
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

      logger.info('⏸ 发布前等待 5 秒...');
      await page.waitForTimeout(5000);

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
