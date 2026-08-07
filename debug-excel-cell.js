/**
 * 调试Excel单元格内容
 */

const ExcelJS = require('exceljs');
const path = require('path');

async function debugExcelCell(excelPath) {
  console.log('\n=== 调试Excel单元格内容 ===\n');
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

    const chartColumn = headers.get('星盘图片');
    if (!chartColumn) {
      console.log('  未找到"星盘图片"列');
      continue;
    }

    console.log(`\n星盘图片列号: ${chartColumn}\n`);

    // 检查前几行
    for (let rowNumber = 2; rowNumber <= Math.min(worksheet.rowCount, 5); rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const cell = row.getCell(chartColumn);

      console.log(`\n第 ${rowNumber} 行 - 星盘图片单元格详细信息:`);
      console.log('  原始值类型:', typeof cell.value);
      console.log('  原始值:', cell.value);

      if (cell.value && typeof cell.value === 'object') {
        console.log('  对象键:', Object.keys(cell.value));
        console.log('  完整对象:', JSON.stringify(cell.value, null, 2));

        // 检查是否是超链接
        if ('text' in cell.value && 'hyperlink' in cell.value) {
          console.log('  ✅ 这是一个超链接:');
          console.log('     显示文字:', cell.value.text);
          console.log('     链接地址:', cell.value.hyperlink);
        }

        // 检查是否是富文本
        if ('richText' in cell.value) {
          console.log('  ✅ 这是富文本:');
          console.log('     内容:', cell.value.richText);
        }
      }

      // 检查单元格是否有图片
      const images = worksheet.getImages();
      let hasImage = false;
      for (const imageData of images) {
        const tl = imageData.range?.tl || imageData.tl;
        if (tl) {
          const imageRow = (tl.nativeRow ?? tl.row) + 1;
          const imageCol = (tl.nativeCol ?? tl.col) + 1;
          if (imageRow === rowNumber && imageCol === chartColumn) {
            hasImage = true;
            console.log('  ✅ 该单元格有嵌入图片');
            break;
          }
        }
      }
      if (!hasImage) {
        console.log('  ℹ️  该单元格没有嵌入图片');
      }
    }
  }

  console.log('\n=== 调试完成 ===\n');
}

const excelPath = process.argv[2];
if (!excelPath) {
  console.log('使用方法: node debug-excel-cell.js <excel文件路径>');
  process.exit(1);
}

debugExcelCell(path.resolve(excelPath)).catch((error) => {
  console.error('\n❌ 调试失败:', error);
  process.exit(1);
});
