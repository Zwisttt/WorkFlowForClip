import fs from 'fs';
import os from 'os';
import path from 'path';
import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../electron/services/AccountService', () => ({
  accountService: {
    getAllAccounts: vi.fn(async () => [{
      id: 'account-1',
      platform: 'douyin',
      name: '星座账号',
      cookieValid: true,
      status: 'active',
    }]),
  },
}));

vi.mock('../../../electron/data/repositories/AutomationRepository', () => ({
  automationTemplateRepo: {
    findAll: vi.fn(async () => ({
      data: [
        { name: 'Luna', image_slot_keys: JSON.stringify(['image-1', 'image-2']) },
        { name: 'Stella纯文案', image_slot_keys: JSON.stringify(['image-1']) },
      ],
    })),
  },
}));

import {
  AutomationWorkbookService,
  splitPublishCopy,
} from '../../../electron/services/AutomationWorkbookService';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('AutomationWorkbookService', () => {
  it('按 30 个 Unicode 字符拆分标题和描述', () => {
    expect(splitPublishCopy('二十九字以内')).toEqual({ title: '二十九字以内', description: '' });
    const longCopy = '星'.repeat(30);
    expect(splitPublishCopy(longCopy)).toEqual({ title: '', description: longCopy });
  });

  it('读取新版表头、规范模板名并精确匹配 Sheet 账号', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'matrixflow-workbook-'));
    temporaryRoots.push(root);
    const imagePath = path.join(root, 'background.png');
    const audioPath = path.join(root, 'music.mp3');
    fs.writeFileSync(imagePath, 'image');
    fs.writeFileSync(audioPath, 'audio');
    const workbookPath = path.join(root, 'automation.xlsx');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('星座账号');
    sheet.addRow([
      '模版名',
      '脚本',
      '底图',
      '星盘图片',
      'BGM素材',
      '发布文案',
      '话题',
      '发布日期',
      '当天发布时间',
      '作品名字',
    ]);
    const future = new Date(Date.now() + 3 * 24 * 60 * 60_000);
    sheet.addRow([
      'Stella',
      '测试脚本',
      imagePath,
      '',
      audioPath,
      '短标题',
      '#星座 #运势，测试',
      future,
      '18:30',
      '测试作品',
    ]);
    await workbook.xlsx.writeFile(workbookPath);

    const preview = await new AutomationWorkbookService().analyze(workbookPath);

    expect(preview.canStart).toBe(true);
    expect(preview.sheets[0].matchedAccounts).toEqual([
      expect.objectContaining({ id: 'account-1', name: '星座账号', platform: 'douyin' }),
    ]);
    expect(preview.rows[0]).toEqual(expect.objectContaining({
      templateName: 'Stella纯文案',
      title: '短标题',
      description: '',
      topics: ['星座', '运势', '测试'],
      workName: '测试作品',
    }));
    expect(preview.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
  });
});
