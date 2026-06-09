import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { UPLOAD_SELECTORS } from './selectors';
import { fillVideoMetadata } from './publish';
import type { ScheduleContext, ScheduleResult } from '../base/types';
import { formatScheduleDateTime } from '../base/utils/schedule';

const logger = new Logger('KuaishouSchedule');

/**
 * 快手服务端定时发布
 *
 * 竞品验证（social-auto-upload/ks_uploader/main.py:311-321）：
 * - 快手使用 Ant Design Radio（非 checkbox），需点击 `.ant-radio-input:nth-child(2)` 选"定时"
 * - 日期格式必须带秒：`YYYY-MM-DD HH:mm:ss`
 * - 使用 `Ctrl+A → keyboard.type → Enter` 方式输入，不用逐字符 humanType
 */
export async function schedule(ctx: ScheduleContext): Promise<ScheduleResult> {
  const { page, title, description, tags, scheduledTime } = ctx;

  if (!page) {
    return { success: false, message: '定时发布需要 page 参数' };
  }

  if (!scheduledTime) {
    return { success: false, message: '定时发布需要指定发布时间' };
  }

  const now = new Date();
  const minScheduleDate = new Date(now.getTime() + 1 * 60 * 60 * 1000);
  if (scheduledTime < minScheduleDate) {
    return { success: false, message: '快手定时发布时间必须在当前时间1小时之后' };
  }

  const maxScheduleDate = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  if (scheduledTime > maxScheduleDate) {
    return { success: false, message: '快手定时发布最多支持14天' };
  }

  try {
    await fillVideoMetadata(page, title, description, tags);

    // 1. 选择「定时发布」Radio（Ant Design Radio.Group，第2个 radio 是"定时"）
    const scheduleRadio = page.locator(UPLOAD_SELECTORS.scheduleRadio).first();
    if (!(await scheduleRadio.isVisible().catch(() => false))) {
      return { success: false, message: '未找到定时发布选项' };
    }
    await scheduleRadio.click();
    await page.waitForTimeout(800);

    // 2. 点击 DatePicker 输入框，evaluate 直接设置 React 受控值 + dispatch 事件
    const datePicker = page.locator(UPLOAD_SELECTORS.scheduleDatePicker).first();
    if (await datePicker.isVisible().catch(() => false)) {
      const dateStr = formatScheduleDateTime(scheduledTime, { withSeconds: true });
      if (!dateStr) {
        return { success: false, message: '无法格式化定时发布时间' };
      }

      await datePicker.click();
      await page.waitForTimeout(300);
      // Ant Design DatePicker 是 React 受控组件，需要原生 value setter + dispatch input/change 事件
      await datePicker.evaluate((el, value) => {
        const input = el as HTMLInputElement;
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set;
        nativeSetter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, dateStr);
      await page.waitForTimeout(500);

      const pickerOk = page.locator(UPLOAD_SELECTORS.scheduleConfirmBtn).first();
      if (await pickerOk.isVisible().catch(() => false)) {
        await pickerOk.click();
      } else {
        await page.keyboard.press('Enter');
      }
      await page.waitForTimeout(500);
      logger.info(`定时发布时间已设置: ${dateStr}`);
    }

    // 3. 点击发布按钮
    logger.info('⏸ 发布前等待 5 秒...');
    await page.waitForTimeout(5000);

    const publishBtn = page.locator(UPLOAD_SELECTORS.publishButton).first();
    await publishBtn.waitFor({ state: 'visible', timeout: 10000 });
    await publishBtn.click();

    await page.waitForTimeout(2000);

    const successToast = page.locator(UPLOAD_SELECTORS.publishSuccessToast);
    if (await successToast.isVisible().catch(() => false)) {
      logger.info('定时发布设置成功');
      return { success: true, message: '定时发布设置成功', scheduledTime };
    }

    const currentUrl = page.url();
    if (currentUrl.includes('/article/manage/video')) {
      logger.info('定时发布设置成功（已跳转管理页）');
      return { success: true, message: '定时发布设置成功', scheduledTime };
    }

    return { success: false, message: '定时发布设置可能失败，未检测到成功标志' };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`定时发布设置出错: ${errorMessage}`);
    return { success: false, message: `定时发布设置出错: ${errorMessage}` };
  }
}
