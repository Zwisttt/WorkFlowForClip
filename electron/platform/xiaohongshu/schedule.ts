import type { Page } from 'patchright';
import { Logger } from '../../core/Logger';
import { fillVideoMetadata } from './publish';
import type { ScheduleContext, ScheduleResult } from '../base/types';
import { ValidationError, toPlatformError } from '../base/PlatformError';
import { getDebugRecorder } from '../base/DebugRecorder';

const logger = new Logger('XiaohongshuSchedule');

export const XIAOHONGSHU_CONFIG = {
  maxScheduleDays: 0,
  supportsScheduledPublish: false,
} as const;

export function validateScheduleDate(scheduledTime?: Date): void {
  if (scheduledTime) {
    throw new ValidationError(
      '小红书不支持定时发布',
      { platform: 'xiaohongshu', maxScheduleDays: 0 },
      'xiaohongshu'
    );
  }
}

export async function schedule(ctx: ScheduleContext): Promise<ScheduleResult> {
  const { page, title, description, tags, scheduledTime, accountId } = ctx;

  const debugRecorder = getDebugRecorder();
  debugRecorder.setSessionId(`xiaohongshu_schedule_${accountId ?? 'unknown'}_${Date.now()}`);

  try {
    await debugRecorder.recordStep('validate_schedule_capability', async () => {
      validateScheduleDate(scheduledTime);
    }, { accountId });

    if (!page) {
      throw new ValidationError('定时发布需要 page 参数', { accountId }, 'xiaohongshu');
    }

    await fillVideoMetadata(page, title, description, tags);

    logger.info('小红书不支持服务端定时发布，将立即发布');

    return {
      success: false,
      message: '小红书不支持定时发布，内容将立即发布',
    };
  } catch (error) {
    const pErr = toPlatformError(error, 'xiaohongshu');
    logger.error(`定时发布验证失败: ${pErr.message}`);
    return {
      success: false,
      message: `小红书不支持定时发布: ${pErr.message}`,
    };
  }
}

export function isScheduledPublishSupported(): boolean {
  return XIAOHONGSHU_CONFIG.supportsScheduledPublish;
}

export function getScheduleConfig(): typeof XIAOHONGSHU_CONFIG {
  return { ...XIAOHONGSHU_CONFIG };
}
