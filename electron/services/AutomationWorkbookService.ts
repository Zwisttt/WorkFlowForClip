import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { accountService } from './AccountService';
import { automationTemplateRepo } from '../data/repositories/AutomationRepository';
import type {
  AutomationAccountMatch,
  AutomationRowPreview,
  AutomationSheetPreview,
  AutomationValidationIssue,
  AutomationWorkbookPreview,
} from './types/automation';

const REQUIRED_HEADERS = [
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
] as const;

const HEADER_ALIASES: Record<string, string[]> = {
  模版名: ['模版名', '模板名'],
  脚本: ['脚本'],
  底图: ['底图', '背景素材'],
  星盘图片: ['星盘图片'],
  BGM素材: ['BGM素材', '音频素材'],
  发布文案: ['发布文案'],
  话题: ['话题'],
  发布日期: ['发布日期'],
  当天发布时间: ['当天发布时间', '发布时间'],
  作品名字: ['作品名字', '作品名称'],
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text).join('').trim();
    }
  }
  return String(value).trim();
}

function normalizeTemplateName(value: string): string {
  const raw = value.trim();
  if (raw === 'Stella') return 'Stella纯文案';
  if (raw === 'luna') return 'luna纯文案';
  return raw;
}

function parseTopics(raw: string): string[] {
  const result: string[] = [];
  for (const part of raw.split(/[#＃,，\s]+/)) {
    const topic = part.trim().replace(/^#+/, '');
    if (topic && !result.includes(topic)) result.push(topic);
  }
  return result;
}

function datePart(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, '0'),
      String(value.getDate()).padStart(2, '0'),
    ].join('-');
  }
  const raw = cellText(value);
  const match = raw.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function timePart(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }
  const raw = cellText(value);
  const match = raw.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function combineDateTime(date: ExcelJS.CellValue, time: ExcelJS.CellValue): string | null {
  const dateValue = datePart(date);
  const timeValue = timePart(time);
  if (!dateValue || !timeValue) return null;
  const parsed = new Date(`${dateValue}T${timeValue}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function splitPublishCopy(copy: string): { title: string; description: string } {
  const trimmed = copy.trim();
  return Array.from(trimmed).length < 30
    ? { title: trimmed, description: '' }
    : { title: '', description: trimmed };
}

function normalizeAccountName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN');
}

export class AutomationWorkbookService {
  async analyze(filePath: string): Promise<AutomationWorkbookPreview> {
    const normalizedPath = path.resolve(filePath);
    if (!fs.existsSync(normalizedPath) || path.extname(normalizedPath).toLowerCase() !== '.xlsx') {
      throw new Error('请选择存在的 .xlsx 文件');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(normalizedPath);

    const accounts = (await accountService.getAllAccounts())
      .filter((account) => ['douyin', 'xiaohongshu'].includes(account.platform));
    const templatesPage = await automationTemplateRepo.findAll({ page: 1, pageSize: 100 });
    const templates = new Map(templatesPage.data.map((row) => [row.name, row]));
    const rows: AutomationRowPreview[] = [];
    const sheets: AutomationSheetPreview[] = [];
    const issues: AutomationValidationIssue[] = [];

    for (const worksheet of workbook.worksheets) {
      const headers = new Map<string, number>();
      worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
        const header = cellText(cell.value);
        for (const required of REQUIRED_HEADERS) {
          if (HEADER_ALIASES[required].includes(header)) headers.set(required, column);
        }
      });

      const missing = REQUIRED_HEADERS.filter((header) => !headers.has(header));
      if (missing.length > 0) {
        issues.push({
          sheetName: worksheet.name,
          rowNumber: 1,
          field: '表头',
          severity: 'error',
          message: `缺少表头：${missing.join('、')}`,
        });
        sheets.push({ name: worksheet.name, rowCount: 0, matchedAccounts: [] });
        continue;
      }

      const matchedAccounts: AutomationAccountMatch[] = accounts
        .filter((account) => normalizeAccountName(account.name) === normalizeAccountName(worksheet.name))
        .map((account) => ({
          id: account.id,
          name: account.name,
          platform: account.platform,
          cookieValid: account.cookieValid,
          status: account.status,
        }));

      let rowCount = 0;
      for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        const row = worksheet.getRow(rowNumber);
        const get = (header: typeof REQUIRED_HEADERS[number]) =>
          row.getCell(headers.get(header)!).value;
        const script = cellText(get('脚本'));
        const workName = cellText(get('作品名字'));
        const templateName = normalizeTemplateName(cellText(get('模版名')));
        const publishCopy = cellText(get('发布文案'));
        const scheduledAt = combineDateTime(get('发布日期'), get('当天发布时间'));
        const hasContent = [
          script,
          workName,
          templateName,
          publishCopy,
          cellText(get('底图')),
          cellText(get('星盘图片')),
          cellText(get('BGM素材')),
        ].some(Boolean);
        if (!hasContent) continue;
        rowCount += 1;

        const split = splitPublishCopy(publishCopy);
        const preview: AutomationRowPreview = {
          sheetName: worksheet.name,
          rowNumber,
          templateName,
          script,
          backgroundPath: cellText(get('底图')),
          chartPath: cellText(get('星盘图片')),
          bgmPath: cellText(get('BGM素材')),
          publishCopy,
          topics: parseTopics(cellText(get('话题'))),
          requestedScheduledAt: scheduledAt,
          workName,
          ...split,
        };
        rows.push(preview);

        const addIssue = (
          field: string,
          message: string,
          severity: 'error' | 'warning' = 'error',
        ) => issues.push({ sheetName: worksheet.name, rowNumber, field, message, severity });
        if (!templateName) addIssue('模版名', '模版名不能为空');
        const template = templates.get(templateName);
        if (templateName && !template) addIssue('模版名', `未注册模版“${templateName}”`);
        if (!script) addIssue('脚本', '脚本不能为空');
        if (!publishCopy) addIssue('发布文案', '发布文案不能为空');
        if (!workName) addIssue('作品名字', '作品名字不能为空');
        if (!preview.backgroundPath) addIssue('底图', '底图绝对路径不能为空');
        if (preview.backgroundPath && (!path.isAbsolute(preview.backgroundPath) || !fs.existsSync(preview.backgroundPath))) {
          addIssue('底图', `底图绝对路径不存在：${preview.backgroundPath}`);
        }
        const imageSlots = template ? JSON.parse(template.image_slot_keys) as string[] : [];
        if (imageSlots.length > 1 && !preview.chartPath) {
          addIssue('星盘图片', '双图模版必须填写星盘图片绝对路径');
        }
        if (preview.chartPath && (!path.isAbsolute(preview.chartPath) || !fs.existsSync(preview.chartPath))) {
          addIssue('星盘图片', `星盘图片绝对路径不存在：${preview.chartPath}`);
        }
        if (preview.bgmPath && (!path.isAbsolute(preview.bgmPath) || !fs.existsSync(preview.bgmPath))) {
          addIssue('BGM素材', `BGM 绝对路径不存在：${preview.bgmPath}`);
        }
        if (!preview.bgmPath) {
          addIssue('BGM素材', 'BGM 留空，将在启动时从公共音频目录随机选择', 'warning');
        }
        if (!scheduledAt) addIssue('发布时间', '发布日期或当天发布时间格式无效');
        else if (new Date(scheduledAt).getTime() <= Date.now()) addIssue('发布时间', '发布时间已经过去');
      }

      if (matchedAccounts.length === 0) {
        issues.push({
          sheetName: worksheet.name,
          rowNumber: 1,
          field: '账号匹配',
          severity: 'warning',
          message: '未自动匹配到同昵称账号，请在确认页面手动选择',
        });
      }
      sheets.push({ name: worksheet.name, rowCount, matchedAccounts });
    }

    const invalidRows = new Set(
      issues
        .filter((issue) => issue.severity === 'error' && issue.rowNumber > 1)
        .map((issue) => `${issue.sheetName}:${issue.rowNumber}`),
    );
    const hasHeaderError = issues.some(
      (issue) => issue.severity === 'error' && issue.rowNumber === 1,
    );
    return {
      filePath: normalizedPath,
      sheets,
      rows,
      issues,
      canStart: !hasHeaderError && rows.some(
        (row) => !invalidRows.has(`${row.sheetName}:${row.rowNumber}`),
      ),
    };
  }
}

export const automationWorkbookService = new AutomationWorkbookService();
export { splitPublishCopy, parseTopics };
