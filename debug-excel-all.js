/**
 * 全面调试Excel文件
 */

const ExcelJS = require('exceljs');
const path = require('path');

async function debugExcelAll(excelPath) {
  console.log('\n=== 全面调试Excel文件 ===\n');
  console.log(`Excel文件: ${excelPath}\n`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);

  console.log(`媒体资源数量: ${workbook.model.media ? workbook.model.media.length : 0}\n`);

  for (const worksheet of workbook.worksheets) {
    console.log(`\n========== 工作表: ${worksheet.name} ==========`);

    // 获取表头
    console.log('\n表头信息:');
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
        console.log(`  列${column}: "${text}"`);
      }
    });

    const bgColumn = headers.get('底图');
    const chartColumn = headers.get('星盘图片');

    console.log(`\n关键列:`);
    console.log(`  底图列: ${bgColumn || '未找到'}`);
    console.log(`  星盘图片列: ${chartColumn || '未找到'}`);

    // 检查前10行的所有数据
    console.log(`\n数据行详情:`);
    for (let rowNumber = 2; rowNumber <= Math.min(worksheet.rowCount, 10); rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      // 检查是否有内容
      let hasContent = false;
      row.eachCell(() => { hasContent = true; });
      if (!hasContent) continue;

      console.log(`\n  === 第 ${rowNumber} 行 ===`);

      // 显示所有列的内容
      headers.forEach((colNum, headerName) => {
        const cell = row.getCell(colNum);
        const value = cell.value;

        let displayValue = '';
        if (value === null || value === undefined) {
          displayValue = '(空)';
        } else if (typeof value === 'object') {
          if ('formula' in value) {
            displayValue = `公式: ${value.formula}`;
          } else if ('text' in value) {
            displayValue = `文本: ${value.text}`;
          } else {
            displayValue = `对象: ${JSON.stringify(value)}`;
          }
        } else if (value instanceof Date) {
          displayValue = `日期: ${value.toISOString()}`;
        } else {
          displayValue = String(value);
        }

        console.log(`    ${headerName}: ${displayValue}`);
      });

      // 检查底图
      if (bgColumn) {
        const bgCell = row.getCell(bgColumn);
        if (!bgCell.value || (typeof bgCell.value === 'object' && bgCell.value === null)) {
          console.log(`    ⚠️  底图为空`);
        } else if (typeof bgCell.value === 'object' && 'formula' in bgCell.value) {
          const formula = bgCell.value.formula;
          if (formula.includes('DISPIMG')) {
            console.log(`    ✅ 底图使用DISPIMG`);
          }
        } else {
          const bgPath = String(bgCell.value);
          if (bgPath && bgPath !== 'null' && bgPath !== 'undefined') {
            console.log(`    底图路径: ${bgPath.substring(0, 80)}`);
          }
        }
      }

      // 检查星盘图片
      if (chartColumn) {
        const chartCell = row.getCell(chartColumn);
        if (!chartCell.value || (typeof chartCell.value === 'object' && chartCell.value === null)) {
          console.log(`    ⚠️  星盘图片为空`);
        } else if (typeof chartCell.value === 'object' && 'formula' in chartCell.value) {
          const formula = chartCell.value.formula;
          if (formula.includes('DISPIMG')) {
            console.log(`    ✅ 星盘图片使用DISPIMG`);
          }
        } else {
          const chartPath = String(chartCell.value);
          if (chartPath && chartPath !== 'null' && chartPath !== 'undefined') {
            console.log(`    星盘图片路径: ${chartPath.substring(0, 80)}`);
          }
        }
      }
    }
  }

  console.log('\n=== 调试完成 ===\n');
}

const excelPath = process.argv[2];
if (!excelPath) {
  console.log('使用方法: node debug-excel-all.js <excel文件路径>');
  process.exit(1);
}

debugExcelAll(path.resolve(excelPath)).catch((error) => {
  console.error('\n❌ 调试失败:', error);
  console.error(error.stack);
  process.exit(1);
});
