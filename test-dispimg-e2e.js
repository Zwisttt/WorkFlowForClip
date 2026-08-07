/**
 * 端到端测试：模拟实际应用中的DISPIMG提取流程
 */

const path = require('path');

// 导入编译后的服务（模拟应用环境）
async function testE2E() {
  console.log('\n=== DISPIMG端到端测试 ===\n');

  const excelPath = path.resolve('C:/Users/DELL/Desktop/自动化剪辑发布模版2.xlsx');
  console.log(`测试文件: ${excelPath}\n`);

  try {
    // 动态导入编译后的模块
    const { automationWorkbookService } = await import('./dist/main/services/AutomationWorkbookService.js');

    console.log('开始分析Excel文件...\n');
    const result = await automationWorkbookService.analyze(excelPath);

    console.log('分析结果:\n');
    console.log(`总工作表数: ${result.sheets.length}`);

    for (const sheet of result.sheets) {
      console.log(`\n工作表: ${sheet.name}`);
      console.log(`  数据行数: ${sheet.rows.length}`);
      console.log(`  问题数: ${sheet.issues.length}`);

      for (let i = 0; i < Math.min(sheet.rows.length, 5); i++) {
        const row = sheet.rows[i];
        console.log(`\n  第${row.rowNumber}行:`);
        console.log(`    模版名: ${row.templateName}`);
        console.log(`    底图: ${row.backgroundPath ? '✅ ' + row.backgroundPath.substring(0, 60) + '...' : '❌ 未设置'}`);
        console.log(`    星盘图片: ${row.chartPath ? '✅ ' + row.chartPath.substring(0, 60) + '...' : '❌ 未设置'}`);
      }

      if (sheet.issues.length > 0) {
        console.log(`\n  问题列表:`);
        for (const issue of sheet.issues.slice(0, 5)) {
          console.log(`    [${issue.severity}] 第${issue.rowNumber}行 ${issue.field}: ${issue.message}`);
        }
      }
    }

    // 统计成功提取的DISPIMG图片数量
    let dispimgCount = 0;
    for (const sheet of result.sheets) {
      for (const row of sheet.rows) {
        if (row.chartPath && row.chartPath.includes('matrixflow-excel-images')) {
          dispimgCount++;
        }
      }
    }

    console.log(`\n\n=== 测试结果 ===`);
    console.log(`✅ 成功提取DISPIMG图片: ${dispimgCount} 个`);
    console.log(`总问题数: ${result.issues.length}`);

    if (dispimgCount > 0) {
      console.log(`\n🎉 测试通过！DISPIMG图片提取功能正常工作！\n`);
      process.exit(0);
    } else {
      console.log(`\n⚠️  警告：未提取到DISPIMG图片\n`);
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testE2E();
