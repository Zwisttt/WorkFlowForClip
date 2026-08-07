/**
 * 测试DISPIMG图片提取（模拟AutomationWorkbookService的逻辑）
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if ('text' in value && typeof value.text === 'string') return value.text.trim();
    // 忽略DISPIMG公式
    if ('formula' in value && typeof value.formula === 'string' && value.formula.includes('DISPIMG')) {
      return '';
    }
    if ('result' in value) return cellText(value.result);
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((item) => item.text).join('').trim();
    }
  }
  return String(value).trim();
}

function extractEmbeddedImage(worksheet, rowNumber, columnNumber, workbook) {
  const row = worksheet.getRow(rowNumber);
  const cell = row.getCell(columnNumber);

  // 检查DISPIMG公式
  if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
    const formula = String(cell.value.formula || '');
    if (formula.includes('DISPIMG')) {
      console.log(`  [DISPIMG] 检测到公式: ${formula}`);

      const media = workbook.model.media;
      if (media && media.length > 0) {
        // 计算DISPIMG索引
        let dispimgIndex = 0;
        for (let r = 2; r <= rowNumber; r++) {
          for (let c = 1; c <= worksheet.columnCount; c++) {
            const testCell = worksheet.getRow(r).getCell(c);
            if (testCell.value && typeof testCell.value === 'object' && 'formula' in testCell.value) {
              const testFormula = String(testCell.value.formula || '');
              if (testFormula.includes('DISPIMG')) {
                if (r === rowNumber && c === columnNumber) {
                  break;
                }
                dispimgIndex++;
              }
            }
          }
        }

        console.log(`  [DISPIMG] 计算索引: ${dispimgIndex} (媒体总数: ${media.length})`);

        if (dispimgIndex < media.length) {
          const image = media[dispimgIndex];
          try {
            let extension = '.png';
            if (image.extension) {
              extension = image.extension.startsWith('.') ? image.extension : `.${image.extension}`;
            }

            const tempDir = path.join(os.tmpdir(), 'matrixflow-excel-images');
            if (!fs.existsSync(tempDir)) {
              fs.mkdirSync(tempDir, { recursive: true });
            }

            const fileName = `excel-image-${randomUUID()}${extension}`;
            const filePath = path.join(tempDir, fileName);

            const buffer = image.buffer;
            fs.writeFileSync(filePath, buffer);

            console.log(`  ✅ DISPIMG图片已提取:`, {
              索引: dispimgIndex,
              扩展名: extension,
              大小: `${(buffer.length / 1024).toFixed(2)} KB`,
              路径: filePath
            });

            return filePath;
          } catch (error) {
            console.error(`  ❌ 提取失败:`, error.message);
          }
        }
      }
    }
  }

  return null;
}

async function testDispImg(excelPath) {
  console.log('\n=== 测试DISPIMG图片提取 ===\n');
  console.log(`Excel文件: ${excelPath}\n`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);

  for (const worksheet of workbook.worksheets) {
    console.log(`\n--- 工作表: ${worksheet.name} ---`);

    // 获取表头
    const headers = new Map();
    worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, column) => {
      const value = cell.value;
      let text = '';
      if (value && typeof value === 'object' && 'text' in value) {
        text = value.text.trim();
      } else if (value) {
        text = String(value).trim();
      }
      if (text) {
        headers.set(text, column);
      }
    });

    const bgColumn = headers.get('底图');
    const chartColumn = headers.get('星盘图片');

    console.log(`\n底图列: ${bgColumn || '未找到'}`);
    console.log(`星盘图片列: ${chartColumn || '未找到'}`);

    if (!chartColumn) continue;

    // 测试前5行
    console.log('\n测试数据行:');
    for (let rowNumber = 2; rowNumber <= Math.min(worksheet.rowCount, 10); rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      // 检查是否有内容
      let hasContent = false;
      row.eachCell(() => { hasContent = true; });
      if (!hasContent) continue;

      console.log(`\n第 ${rowNumber} 行:`);

      // 检查星盘图片
      const chartCell = row.getCell(chartColumn);
      const chartText = cellText(chartCell.value);
      console.log(`  星盘图片文本: "${chartText}"`);
      console.log(`  单元格类型: ${typeof chartCell.value}`);

      if (!chartText) {
        const extracted = extractEmbeddedImage(worksheet, rowNumber, chartColumn, workbook);
        if (extracted) {
          console.log(`  ✅ 成功: ${extracted}`);
        } else {
          console.log(`  ℹ️  未提取到图片`);
        }
      } else {
        console.log(`  ℹ️  使用文本路径: ${chartText}`);
      }
    }
  }

  console.log('\n=== 测试完成 ===\n');
}

const excelPath = process.argv[2];
if (!excelPath) {
  console.log('使用方法: node test-dispimg-extract.js <excel文件路径>');
  process.exit(1);
}

testDispImg(path.resolve(excelPath)).catch((error) => {
  console.error('\n❌ 测试失败:', error);
  process.exit(1);
});
