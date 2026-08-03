import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../electron/services/AutomationWorkbookService', () => ({
  automationWorkbookService: {},
  splitPublishCopy: vi.fn(),
}));
vi.mock('../../../electron/services/JianyingTemplateService', () => ({
  jianyingTemplateService: {},
}));
vi.mock('../../../electron/services/JianyingExportService', () => ({
  jianyingExportService: {},
}));
vi.mock('../../../electron/services/AccountService', () => ({ accountService: {} }));
vi.mock('../../../electron/services/PublishService', () => ({ publishService: {} }));
vi.mock('../../../electron/core/TaskScheduler', () => ({ taskScheduler: {} }));
vi.mock('../../../electron/data/repositories/AutomationRepository', () => ({
  automationBatchRepo: {},
  automationItemRepo: {},
  automationTemplateRepo: {},
}));

import {
  earliestNativeScheduleTime,
  resolveJianyingSearchName,
} from '../../../electron/services/AutomationService';

describe('AutomationService schedule planning', () => {
  it('为全部导出和抖音的两小时提前量预留时间', () => {
    const startedAt = new Date('2026-08-02T00:00:00.000Z').getTime();

    expect(earliestNativeScheduleTime(startedAt, 3, 12, 10, 5, 1)).toBe(
      startedAt + 3 * 35_000 + 10 * 60_000 + 2 * 60 * 60_000,
    );
  });

  it('导出等待不会低于每条 10 秒', () => {
    const startedAt = 1_000;
    expect(earliestNativeScheduleTime(startedAt, 0, 1, 1, 1, 0.1)).toBe(
      startedAt + 12_800 + 10 * 60_000 + 2 * 60 * 60_000,
    );
  });

  it('uses the Windows-safe draft name when searching Jianying', () => {
    expect(resolveJianyingSearchName(
      'luna 2026.7.31 20:00',
      'luna 2026.7.31 20_00',
    )).toBe('luna 2026.7.31 20_00');
  });

  it('derives a Windows-safe search name for older items without a resolved name', () => {
    expect(resolveJianyingSearchName('luna 2026.7.31 20:00')).toBe('luna 2026.7.31 20_00');
  });
});
