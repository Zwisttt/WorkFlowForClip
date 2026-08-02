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
  combineDateTime,
  normalizeWorkName,
  splitPublishCopy,
} from '../../../electron/services/AutomationWorkbookService';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('AutomationWorkbookService', () => {
  it('将发布文案全部放入作品简介并保持标题为空', () => {
    expect(splitPublishCopy('二十九字以内')).toEqual({ title: '', description: '二十九字以内' });
    const longCopy = '星'.repeat(30);
    expect(splitPublishCopy(longCopy)).toEqual({ title: '', description: longCopy });
  });

  it('移除 Excel 作品名中错误的时间分隔字符', () => {
    expect(normalizeWorkName('Stella 2026.7.29_1805')).toBe('Stella 2026.7.29 18:05');
    expect(normalizeWorkName('luna 2026.7.31_1000')).toBe('luna 2026.7.31 10:00');
    expect(normalizeWorkName('Stella 2026.7.29_0:20')).toBe('Stella 2026.7.29 0:20');
    expect(normalizeWorkName('Stella 2026.7.29 09:20')).toBe('Stella 2026.7.29 09:20');
  });

  it('按 Excel UTC 序列时间解析，不受本机时区偏移', () => {
    const dateCell = new Date(Date.UTC(2026, 7, 3));
    const timeCell = new Date(Date.UTC(1899, 11, 30, 17, 32));
    const parsed = combineDateTime(dateCell, timeCell);

    expect(parsed).not.toBeNull();
    const local = new Date(parsed!);
    expect([
      local.getFullYear(),
      local.getMonth() + 1,
      local.getDate(),
      local.getHours(),
      local.getMinutes(),
    ]).toEqual([2026, 8, 3, 17, 32]);
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
      title: '',
      description: '短标题',
      topics: ['星座', '运势', '测试'],
      workName: '测试作品',
    }));
    expect(preview.issues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
  });
});
