/**
 * 测试Excel嵌入图片提取功能
 *
 * 使用方法：
 * 1. 创建一个Excel文件（.xlsx），包含必要的表头
 * 2. 在"星盘图片"列的某个单元格中插入图片
 * 3. 运行此测试脚本：node test-embedded-image.js <excel文件路径>
 */

const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');

function extractEmbeddedImage(worksheet, rowNumber, columnNumber, workbook) {
  const images = worksheet.getImages();

  console.log(`\n检查行${rowNumber}列${columnNumber}的嵌入图片...`);
  console.log(`工作表中共有 ${images.length} 张图片`);

  for (const imageData of images) {
    console.log(`\n图片 ${imageData.imageId}:`, imageData);

    // ExcelJS的图片位置可能是range或直接的tl/br属性
    const tl = imageData.range?.tl || imageData.tl;
    const br = imageData.range?.br || imageData.br;

    if (!tl) {
      console.log('  ⚠️  图片没有位置信息');
      continue;
    }

    console.log(`  位置: 行${tl.row + 1}列${tl.col + 1}${br ? ` 到 行${br.row + 1}列${br.col + 1}` : ''}`);

    // 检查图片是否位于目标单元格（图片左上角在该单元格）
    if (
      tl.row + 1 === rowNumber &&
      tl.col + 1 === columnNumber
    ) {
      try {
        const image = workbook.model.media?.find((m) => m.index === imageData.imageId);
        if (!image) {
          console.log('  ❌ 未找到图片数据');
          continue;
        }

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

        fs.writeFileSync(filePath, image.buffer);

        console.log(`  ✅ 成功提取图片:`, {
          扩展名: extension,
          大小: `${(image.buffer.length / 1024).toFixed(2)} KB`,
          保存路径: filePath
        });

        return filePath;
      } catch (error) {
        console.error('  ❌ 提取失败:', error.message);
        return null;
      }
    }
  }

  console.log('  ℹ️  该单元格没有嵌入图片');
  return null;
}

async function testEmbeddedImages(excelPath) {
  console.log('\n=== 测试Excel嵌入图片提取功能 ===\n');
  console.log(`Excel文件: ${excelPath}`);

  if (!fs.existsSync(excelPath)) {
    console.error(`❌ 文件不存在: ${excelPath}`);
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);

  console.log(`\n工作簿包含 ${workbook.worksheets.length} 个工作表`);

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
        console.log(`  列${column}: ${text}`);
      }
    });

    // 查找底图和星盘图片列
    const bgColumn = headers.get('底图');
    const chartColumn = headers.get('星盘图片');

    console.log(`\n底图列: ${bgColumn || '未找到'}`);
    console.log(`星盘图片列: ${chartColumn || '未找到'}`);

    // 检查每一行的数据
    console.log(`\n检查数据行 (从第2行开始)...`);
    for (let rowNumber = 2; rowNumber <= Math.min(worksheet.rowCount, 10); rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      // 检查是否有内容
      let hasContent = false;
      row.eachCell(() => { hasContent = true; });
      if (!hasContent) continue;

      console.log(`\n第 ${rowNumber} 行:`);

      // 检查底图
      if (bgColumn) {
        const bgCell = row.getCell(bgColumn);
        const bgText = bgCell.value ? String(bgCell.value).trim() : '';
        console.log(`  底图文本: "${bgText}"`);

        if (!bgText) {
          const extracted = extractEmbeddedImage(worksheet, rowNumber, bgColumn, workbook);
          if (extracted) {
            console.log(`  ✅ 底图已提取: ${extracted}`);
          }
        }
      }

      // 检查星盘图片
      if (chartColumn) {
        const chartCell = row.getCell(chartColumn);
        const chartText = chartCell.value ? String(chartCell.value).trim() : '';
        console.log(`  星盘图片文本: "${chartText}"`);

        if (!chartText) {
          const extracted = extractEmbeddedImage(worksheet, rowNumber, chartColumn, workbook);
          if (extracted) {
            console.log(`  ✅ 星盘图片已提取: ${extracted}`);
          }
        }
      }
    }
  }

  console.log('\n=== 测试完成 ===\n');
}

// 运行测试
const excelPath = process.argv[2];
if (!excelPath) {
  console.log('使用方法: node test-embedded-image.js <excel文件路径>');
  console.log('\n示例:');
  console.log('  node test-embedded-image.js ./test.xlsx');
  console.log('  node test-embedded-image.js "/Users/xxx/Desktop/测试表格.xlsx"');
  process.exit(1);
}

testEmbeddedImages(path.resolve(excelPath)).catch((error) => {
  console.error('\n❌ 测试失败:', error);
  process.exit(1);
});
