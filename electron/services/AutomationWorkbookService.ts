import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
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
    // 忽略DISPIMG公式，返回空字符串（因为图片内容应该通过extractEmbeddedImage提取）
    if ('formula' in value && typeof value.formula === 'string' && value.formula.includes('DISPIMG')) {
      return '';
    }
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

function normalizeWorkName(value: string): string {
  return value.trim();
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
      value.getUTCFullYear(),
      String(value.getUTCMonth() + 1).padStart(2, '0'),
      String(value.getUTCDate()).padStart(2, '0'),
    ].join('-');
  }
  const raw = cellText(value);
  const match = raw.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
}

function timePart(value: ExcelJS.CellValue): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Excel stores a time-only cell as a fraction of a UTC-based serial day.
    // Local getters add the machine timezone (e.g. +8 hours in China), which
    // can also roll the value into the following day.
    return `${String(value.getUTCHours()).padStart(2, '0')}:${String(value.getUTCMinutes()).padStart(2, '0')}`;
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
  return { title: '', description: trimmed };
}

function normalizeAccountName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN');
}

/**
 * 从Excel工作表中提取嵌入的图片
 * @param worksheet Excel工作表
 * @param rowNumber 行号（从1开始）
 * @param columnNumber 列号（从1开始）
 * @param workbook Excel工作簿（用于获取图片数据）
 * @returns 提取并保存的图片绝对路径，如果没有图片则返回null
 */
function extractEmbeddedImage(
  worksheet: ExcelJS.Worksheet,
  rowNumber: number,
  columnNumber: number,
  workbook: ExcelJS.Workbook,
): string | null {
  // 方法1: 检查单元格是否包含DISPIMG公式（Excel 365的单元格图片）
  const row = worksheet.getRow(rowNumber);
  const cell = row.getCell(columnNumber);

  if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
    const formula = String((cell.value as any).formula || '');
    if (formula.includes('DISPIMG')) {
      console.log('[AutomationWorkbook] 检测到DISPIMG公式:', formula);

      // DISPIMG类型的图片存储在workbook.model.media中
      const media = workbook.model.media as any[];
      if (media && media.length > 0) {
        // 提取DISPIMG公式中的ID
        const idMatch = formula.match(/DISPIMG\s*\(\s*["']([^"']+)["']/);
        const dispimgId = idMatch ? idMatch[1] : null;

        console.log('[AutomationWorkbook] DISPIMG ID:', dispimgId);

        // 策略1: 尝试通过ID在媒体资源的name中查找匹配
        let image = null;
        if (dispimgId) {
          image = media.find((m: any) => m.name && m.name.includes(dispimgId));
        }

        // 策略2: 如果找不到匹配，且只有一个媒体资源，直接使用它
        // (Excel中多个DISPIMG可能引用同一个图片)
        if (!image && media.length === 1) {
          console.log('[AutomationWorkbook] 未找到ID匹配，使用唯一的媒体资源');
          image = media[0];
        }

        // 策略3: 如果有多个媒体资源，计算当前DISPIMG在工作表中的出现顺序索引
        if (!image && media.length > 1) {
          let dispimgIndex = 0;
          let found = false;

          for (let r = 1; r <= rowNumber && !found; r++) {
            for (let c = 1; c <= worksheet.columnCount && !found; c++) {
              const testCell = worksheet.getRow(r).getCell(c);
              if (testCell.value && typeof testCell.value === 'object' && 'formula' in testCell.value) {
                const testFormula = String((testCell.value as any).formula || '');
                if (testFormula.includes('DISPIMG')) {
                  if (r === rowNumber && c === columnNumber) {
                    // 找到当前单元格
                    found = true;
                  } else {
                    dispimgIndex++;
                  }
                }
              }
            }
          }

          console.log('[AutomationWorkbook] 计算的DISPIMG索引:', dispimgIndex);
          if (dispimgIndex < media.length) {
            image = media[dispimgIndex];
          }
        }

        // 提取图片
        if (image) {
          try {
            // 确定图片扩展名
            let extension = '.png';
            if (image.extension) {
              extension = image.extension.startsWith('.') ? image.extension : `.${image.extension}`;
            }

            // 创建临时目录
            const tempDir = path.join(os.tmpdir(), 'matrixflow-excel-images');
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true });
            }

            // 生成唯一的文件名
            const fileName = `excel-image-${randomUUID()}${extension}`;
            const filePath = path.join(tempDir, fileName);

            // 保存图片到临时文件
            const buffer = image.buffer as Buffer;
            if (!buffer || buffer.length === 0) {
              console.error('[AutomationWorkbook] 图片buffer为空');
              return null;
            }
            fs.writeFileSync(filePath, buffer);

            // 验证文件是否成功创建
            if (!fs.existsSync(filePath)) {
              console.error('[AutomationWorkbook] 文件创建失败:', filePath);
              return null;
            }

            console.log('[AutomationWorkbook] 提取DISPIMG图片成功:', {
              row: rowNumber,
              column: columnNumber,
              dispimgId,
              mediaIndex: image.index,
              mediaName: image.name,
              extension,
              path: filePath,
              isAbsolute: path.isAbsolute(filePath),
              exists: fs.existsSync(filePath),
              size: buffer.length,
              platform: os.platform()
            });

            return filePath;
          } catch (error) {
            console.error('[AutomationWorkbook] 提取DISPIMG图片失败:', {
              row: rowNumber,
              column: columnNumber,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            });
            return null;
          }
        } else {
          console.warn('[AutomationWorkbook] 未找到匹配的DISPIMG媒体资源:', {
            dispimgId,
            mediaLength: media.length
          });
        }
      }
    }
  }

  // 方法2: 检查传统的嵌入图片
  const images = worksheet.getImages();

  for (const imageData of images) {
    // ExcelJS的图片位置可能在range.tl或直接在tl属性
    const tl = imageData.range?.tl || (imageData as any).tl;

    if (!tl) continue;

    // 检查图片是否位于目标单元格（ExcelJS的行列号从0开始）
    // nativeCol和nativeRow是Anchor对象的属性
    const imageRow = (tl.nativeRow ?? tl.row) + 1;
    const imageCol = (tl.nativeCol ?? tl.col) + 1;

    if (imageRow === rowNumber && imageCol === columnNumber) {
      try {
        // 获取图片数据（使用any类型绕过ExcelJS的类型限制）
        const media = workbook.model.media as any[];
        const image = media?.find((m: any) => m.index === imageData.imageId);
        if (!image) continue;

        // 确定图片扩展名
        let extension = '.png';
        if (image.extension) {
          extension = image.extension.startsWith('.') ? image.extension : `.${image.extension}`;
        }

        // 创建临时目录
        const tempDir = path.join(os.tmpdir(), 'matrixflow-excel-images');
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        // 生成唯一的文件名
        const fileName = `excel-image-${randomUUID()}${extension}`;
        const filePath = path.join(tempDir, fileName);

        // 保存图片到临时文件（image.buffer是Buffer类型）
        const buffer = image.buffer as Buffer;
        if (!buffer || buffer.length === 0) {
          console.error('[AutomationWorkbook] 传统图片buffer为空');
          return null;
        }
        fs.writeFileSync(filePath, buffer);

        // 验证文件是否成功创建
        if (!fs.existsSync(filePath)) {
          console.error('[AutomationWorkbook] 文件创建失败:', filePath);
          return null;
        }

        console.log('[AutomationWorkbook] 提取传统嵌入图片成功:', {
          row: rowNumber,
          column: columnNumber,
          extension,
          path: filePath,
          isAbsolute: path.isAbsolute(filePath),
          exists: fs.existsSync(filePath),
          size: buffer.length,
          platform: os.platform()
        });

        return filePath;
      } catch (error) {
        console.error('[AutomationWorkbook] 提取传统图片失败:', {
          row: rowNumber,
          column: columnNumber,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        return null;
      }
    }
  }

  return null;
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
        const workName = normalizeWorkName(cellText(get('作品名字')));
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

        // 处理底图：优先使用文本路径，如果没有则尝试提取嵌入图片
        let backgroundPath = cellText(get('底图'));
        if (!backgroundPath) {
          const embeddedBg = extractEmbeddedImage(worksheet, rowNumber, headers.get('底图')!, workbook);
          if (embeddedBg) {
            backgroundPath = embeddedBg;
            console.log(`[AutomationWorkbook] 行${rowNumber}：使用嵌入的底图`, {
              path: embeddedBg,
              isAbsolute: path.isAbsolute(embeddedBg),
              exists: fs.existsSync(embeddedBg),
              platform: os.platform()
            });
          } else {
            console.log(`[AutomationWorkbook] 行${rowNumber}：底图单元格为空且未检测到嵌入图片`);
          }
        }

        // 处理星盘图片：优先使用文本路径，如果没有则尝试提取嵌入图片
        let chartPath = cellText(get('星盘图片'));
        if (!chartPath) {
          const embeddedChart = extractEmbeddedImage(worksheet, rowNumber, headers.get('星盘图片')!, workbook);
          if (embeddedChart) {
            chartPath = embeddedChart;
            console.log(`[AutomationWorkbook] 行${rowNumber}：使用嵌入的星盘图片`, {
              path: embeddedChart,
              isAbsolute: path.isAbsolute(embeddedChart),
              exists: fs.existsSync(embeddedChart),
              platform: os.platform()
            });
          } else {
            console.log(`[AutomationWorkbook] 行${rowNumber}：星盘图片单元格为空且未检测到嵌入图片`);
          }
        }

        const split = splitPublishCopy(publishCopy);
        const preview: AutomationRowPreview = {
          sheetName: worksheet.name,
          rowNumber,
          templateName,
          script,
          backgroundPath,
          chartPath,
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
        if (!preview.backgroundPath) addIssue('底图', '底图不能为空（需要填写绝对路径或在单元格中插入图片）');
        if (preview.backgroundPath) {
          if (!path.isAbsolute(preview.backgroundPath)) {
            addIssue('底图', `底图路径必须是绝对路径：${preview.backgroundPath}`);
          } else if (!fs.existsSync(preview.backgroundPath)) {
            addIssue('底图', `底图文件不存在：${preview.backgroundPath}`);
          }
        }
        const imageSlots = template ? JSON.parse(template.image_slot_keys) as string[] : [];
        if (imageSlots.length > 1 && !preview.chartPath) {
          addIssue('星盘图片', '双图模版必须提供星盘图片（填写绝对路径或在单元格中插入图片）');
        }
        if (preview.chartPath) {
          if (!path.isAbsolute(preview.chartPath)) {
            addIssue('星盘图片', `星盘图片路径必须是绝对路径：${preview.chartPath}`);
          } else if (!fs.existsSync(preview.chartPath)) {
            addIssue('星盘图片', `星盘图片文件不存在：${preview.chartPath}`);
          }
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
export { combineDateTime, splitPublishCopy, parseTopics, normalizeWorkName };
