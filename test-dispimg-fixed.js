/**
 * 测试修复后的DISPIMG提取功能
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

function extractEmbeddedImage(worksheet, rowNumber, columnNumber, workbook) {
  const row = worksheet.getRow(rowNumber);
  const cell = row.getCell(columnNumber);

  if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
    const formula = String(cell.value.formula || '');
    if (formula.includes('DISPIMG')) {
      console.log(`\n[行${rowNumber}列${columnNumber}] 检测到DISPIMG公式:`, formula);

      const media = workbook.model.media || [];
      if (media.length > 0) {
        // 提取DISPIMG公式中的ID
        const idMatch = formula.match(/DISPIMG\s*\(\s*["']([^"']+)["']/);
        const dispimgId = idMatch ? idMatch[1] : null;

        console.log('  DISPIMG ID:', dispimgId);

        // 策略1: 尝试通过ID在媒体资源的name中查找匹配
        let image = null;
        if (dispimgId) {
          image = media.find((m) => m.name && m.name.includes(dispimgId));
          if (image) {
            console.log('  ✅ 策略1成功: 通过ID匹配找到媒体资源');
          }
        }

        // 策略2: 如果找不到匹配，且只有一个媒体资源，直接使用它
        if (!image && media.length === 1) {
          console.log('  ✅ 策略2: 使用唯一的媒体资源');
          image = media[0];
        }

        // 策略3: 如果有多个媒体资源，计算当前DISPIMG的顺序索引
        if (!image && media.length > 1) {
          let dispimgIndex = 0;
          let found = false;

          for (let r = 1; r <= rowNumber && !found; r++) {
            for (let c = 1; c <= worksheet.columnCount && !found; c++) {
              const testCell = worksheet.getRow(r).getCell(c);
              if (testCell.value && typeof testCell.value === 'object' && 'formula' in testCell.value) {
                const testFormula = String(testCell.value.formula || '');
                if (testFormula.includes('DISPIMG')) {
                  if (r === rowNumber && c === columnNumber) {
                    found = true;
                  } else {
                    dispimgIndex++;
                  }
                }
              }
            }
          }

          console.log('  ✅ 策略3: 通过索引匹配 (索引:', dispimgIndex, ')');
          if (dispimgIndex < media.length) {
            image = media[dispimgIndex];
          }
        }

        // 提取图片
        if (image) {
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
            if (!buffer || buffer.length === 0) {
              console.error('  ❌ 图片buffer为空');
              return null;
            }
            fs.writeFileSync(filePath, buffer);

            if (!fs.existsSync(filePath)) {
              console.error('  ❌ 文件创建失败');
              return null;
            }

            console.log('  ✅ 提取成功:', {
              mediaIndex: image.index,
              mediaName: image.name,
              extension,
              size: `${(buffer.length / 1024).toFixed(2)} KB`,
              path: filePath
            });

            return filePath;
          } catch (error) {
            console.error('  ❌ 提取失败:', error.message);
            return null;
          }
        } else {
          console.warn('  ⚠️  未找到匹配的媒体资源');
        }
      } else {
        console.warn('  ⚠️  工作簿中没有媒体资源');
      }
    }
  }

  return null;
}

async function testDispImg(excelPath) {
  console.log('\n=== 测试DISPIMG提取功能 ===\n');
  console.log(`Excel文件: ${excelPath}\n`);

  if (!fs.existsSync(excelPath)) {
    console.error(`❌ 文件不存在: ${excelPath}`);
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);

  console.log(`工作簿包含 ${workbook.worksheets.length} 个工作表`);
  console.log(`媒体资源数量: ${workbook.model.media ? workbook.model.media.length : 0}\n`);

  for (const worksheet of workbook.worksheets) {
    console.log(`\n========== 工作表: ${worksheet.name} ==========`);

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

    const chartColumn = headers.get('星盘图片');
    if (!chartColumn) {
      console.log('  未找到"星盘图片"列');
      continue;
    }

    console.log(`星盘图片列号: ${chartColumn}`);

    // 检查前10行
    let successCount = 0;
    let failCount = 0;

    for (let rowNumber = 2; rowNumber <= Math.min(worksheet.rowCount, 10); rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const cell = row.getCell(chartColumn);

      // 跳过空行
      if (!cell.value) continue;

      const result = extractEmbeddedImage(worksheet, rowNumber, chartColumn, workbook);
      if (result) {
        successCount++;
      } else {
        failCount++;
      }
    }

    console.log(`\n工作表 "${worksheet.name}" 总结:`);
    console.log(`  ✅ 成功提取: ${successCount} 个`);
    console.log(`  ❌ 提取失败: ${failCount} 个`);
  }

  console.log('\n=== 测试完成 ===\n');
}

const excelPath = process.argv[2];
if (!excelPath) {
  console.log('使用方法: node test-dispimg-fixed.js <excel文件路径>');
  console.log('\n示例:');
  console.log('  node test-dispimg-fixed.js ~/Desktop/自动化剪辑发布模版2.xlsx');
  process.exit(1);
}

testDispImg(path.resolve(excelPath)).catch((error) => {
  console.error('\n❌ 测试失败:', error);
  console.error(error.stack);
  process.exit(1);
});
