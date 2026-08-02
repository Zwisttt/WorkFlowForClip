import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findActive: vi.fn(),
  findByBatch: vi.fn(),
  updateBatch: vi.fn(),
  updateItem: vi.fn(),
  recordEvent: vi.fn(),
  stopWorker: vi.fn(),
}));

vi.mock('../../../electron/services/AutomationWorkbookService', () => ({
  automationWorkbookService: {},
  splitPublishCopy: vi.fn(),
}));

vi.mock('../../../electron/services/JianyingTemplateService', () => ({
  jianyingTemplateService: {},
}));

vi.mock('../../../electron/services/JianyingExportService', () => ({
  jianyingExportService: {
    stop: mocks.stopWorker,
  },
}));

vi.mock('../../../electron/services/AccountService', () => ({
  accountService: {},
}));

vi.mock('../../../electron/services/PublishService', () => ({
  publishService: {},
}));

vi.mock('../../../electron/core/TaskScheduler', () => ({
  taskScheduler: {},
}));

vi.mock('../../../electron/data/repositories/AutomationRepository', () => ({
  automationBatchRepo: {
    findActive: mocks.findActive,
    update: mocks.updateBatch,
  },
  automationItemRepo: {
    findByBatch: mocks.findByBatch,
    update: mocks.updateItem,
    recordEvent: mocks.recordEvent,
  },
  automationTemplateRepo: {},
}));

import { AutomationService } from '../../../electron/services/AutomationService';

describe('AutomationService.stopAllExports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.stopWorker.mockReturnValue(true);
    mocks.findActive.mockResolvedValue([{
      id: 'batch-1',
      status: 'running',
    }]);
    mocks.findByBatch.mockResolvedValue([
      { id: 'item-exporting', batch_id: 'batch-1', status: 'exporting' },
      { id: 'item-ready', batch_id: 'batch-1', status: 'draft_ready' },
    ]);
    mocks.updateBatch.mockResolvedValue({});
    mocks.updateItem.mockResolvedValue({});
    mocks.recordEvent.mockResolvedValue(undefined);
  });

  it('stops the worker and returns exporting items to draft_ready', async () => {
    const service = new AutomationService();

    await expect(service.stopAllExports()).resolves.toEqual({
      stoppedWorker: true,
      pausedBatches: 1,
      pausedItems: 1,
    });
    expect(mocks.stopWorker).toHaveBeenCalledOnce();
    expect(mocks.updateItem).toHaveBeenCalledWith(
      'item-exporting',
      expect.objectContaining({
        status: 'draft_ready',
        error_stage: null,
        error_message: null,
      }),
    );
    expect(mocks.updateItem).not.toHaveBeenCalledWith('item-ready', expect.anything());
    expect(mocks.updateBatch).toHaveBeenCalledWith(
      'batch-1',
      expect.objectContaining({ status: 'paused' }),
    );
  });
});
