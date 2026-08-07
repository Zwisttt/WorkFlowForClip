/**
 * 模拟应用解析Excel并显示所有错误
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function simulateAppAnalyze(excelPath) {
  console.log('\n=== 模拟应用解析Excel ===\n');
  console.log(`文件: ${excelPath}\n`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);

  const REQUIRED_HEADERS = [
    '模版名', '脚本', '底图', '星盘图片', 'BGM素材',
    '发布文案', '话题', '发布日期', '当天发布时间', '作品名字'
  ];

  for (const worksheet of workbook.worksheets) {
    console.log(`\n========== 工作表: ${worksheet.name} ==========\n`);

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

    const issues = [];

    // 检查数据行
    for (let rowNumber = 2; rowNumber <= Math.min(worksheet.rowCount, 10); rowNumber++) {
      const row = worksheet.getRow(rowNumber);

      let hasContent = false;
      row.eachCell(() => { hasContent = true; });
      if (!hasContent) continue;

      console.log(`第 ${rowNumber} 行:`);

      const bgColumn = headers.get('底图');
      const chartColumn = headers.get('星盘图片');

      // 检查底图
      if (bgColumn) {
        const bgCell = row.getCell(bgColumn);
        let bgPath = '';

        if (bgCell.value && typeof bgCell.value === 'object' && 'formula' in bgCell.value) {
          if (bgCell.value.formula.includes('DISPIMG')) {
            bgPath = '(DISPIMG图片)';
            console.log(`  底图: ${bgPath}`);
          }
        } else if (bgCell.value) {
          bgPath = String(bgCell.value).trim();
          console.log(`  底图: ${bgPath}`);

          // 检查路径
          if (!bgPath) {
            issues.push({ row: rowNumber, field: '底图', message: '底图不能为空' });
            console.log(`  ❌ 底图不能为空`);
          } else if (!path.isAbsolute(bgPath)) {
            issues.push({ row: rowNumber, field: '底图', message: `底图路径必须是绝对路径：${bgPath}` });
            console.log(`  ❌ 底图路径必须是绝对路径`);
          } else if (!fs.existsSync(bgPath)) {
            issues.push({ row: rowNumber, field: '底图', message: `底图文件不存在：${bgPath}` });
            console.log(`  ❌ 底图文件不存在（路径来自其他电脑）`);
          } else {
            console.log(`  ✅ 底图文件存在`);
          }
        } else {
          issues.push({ row: rowNumber, field: '底图', message: '底图不能为空（需要填写绝对路径或在单元格中插入图片）' });
          console.log(`  ❌ 底图不能为空`);
        }
      }

      // 检查星盘图片
      if (chartColumn) {
        const chartCell = row.getCell(chartColumn);
        let chartPath = '';

        if (chartCell.value && typeof chartCell.value === 'object' && 'formula' in chartCell.value) {
          if (chartCell.value.formula.includes('DISPIMG')) {
            chartPath = '(DISPIMG图片)';
            console.log(`  星盘图片: ${chartPath} ✅`);
          }
        } else if (chartCell.value) {
          chartPath = String(chartCell.value).trim();
          console.log(`  星盘图片: ${chartPath}`);

          if (chartPath && path.isAbsolute(chartPath) && !fs.existsSync(chartPath)) {
            issues.push({ row: rowNumber, field: '星盘图片', message: `星盘图片文件不存在：${chartPath}` });
            console.log(`  ❌ 星盘图片文件不存在`);
          }
        } else {
          console.log(`  星盘图片: (空)`);
        }
      }

      console.log('');
    }

    // 总结问题
    if (issues.length > 0) {
      console.log(`\n工作表 "${worksheet.name}" 发现 ${issues.length} 个问题:\n`);
      for (const issue of issues) {
        console.log(`  ❌ 第${issue.row}行 [${issue.field}]: ${issue.message}`);
      }
    } else {
      console.log(`\n工作表 "${worksheet.name}" 没有发现问题 ✅\n`);
    }
  }

  console.log('\n=== 解析完成 ===\n');
}

const excelPath = process.argv[2];
if (!excelPath) {
  console.log('使用方法: node simulate-app-analyze.js <excel文件路径>');
  process.exit(1);
}

simulateAppAnalyze(path.resolve(excelPath)).catch((error) => {
  console.error('\n❌ 解析失败:', error);
  console.error(error.stack);
  process.exit(1);
});
