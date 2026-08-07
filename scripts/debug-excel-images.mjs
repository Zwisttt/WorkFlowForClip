#!/usr/bin/env node
/**
 * Excel图片提取调试工具
 * 用法: node scripts/debug-excel-images.mjs <excel文件路径>
 */
import ExcelJS from 'exceljs';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function debugExcelImages(filePath) {
  console.log('=== Excel图片提取调试工具 ===');
  console.log('文件路径:', filePath);
  console.log('平台:', os.platform());
  console.log('临时目录:', os.tmpdir());
  console.log();

  if (!fs.existsSync(filePath)) {
    console.error('错误: 文件不存在');
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  console.log('工作表数量:', workbook.worksheets.length);
  console.log();

  for (const worksheet of workbook.worksheets) {
    console.log(`--- 工作表: ${worksheet.name} ---`);

    // 检查DISPIMG公式
    let dispimgCount = 0;
    for (let r = 1; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r);
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
          const formula = String(cell.value.formula || '');
          if (formula.includes('DISPIMG')) {
            dispimgCount++;
            console.log(`  DISPIMG在: 行${r}, 列${colNumber}`);
            console.log(`    公式: ${formula}`);
          }
        }
      });
    }
    console.log(`  DISPIMG公式数量: ${dispimgCount}`);

    // 检查传统嵌入图片
    const images = worksheet.getImages();
    console.log(`  传统嵌入图片数量: ${images.length}`);
    images.forEach((img, idx) => {
      const tl = img.range?.tl || img.tl;
      if (tl) {
        const imageRow = (tl.nativeRow ?? tl.row) + 1;
        const imageCol = (tl.nativeCol ?? tl.col) + 1;
        console.log(`    图片${idx + 1}: 行${imageRow}, 列${imageCol}, imageId=${img.imageId}`);
      }
    });

    // 检查媒体资源
    const media = workbook.model.media;
    console.log(`  媒体资源总数: ${media ? media.length : 0}`);
    if (media && media.length > 0) {
      media.forEach((m, idx) => {
        console.log(`    媒体${idx}: index=${m.index}, type=${m.type}, extension=${m.extension}, size=${m.buffer?.length || 0}`);
      });
    }

    console.log();
  }

  // 测试提取一张图片
  console.log('--- 测试提取 ---');
  const media = workbook.model.media;
  if (media && media.length > 0) {
    try {
      const testImage = media[0];
      const tempDir = path.join(os.tmpdir(), 'matrixflow-excel-images');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
        console.log('✓ 创建临时目录:', tempDir);
      } else {
        console.log('✓ 临时目录已存在:', tempDir);
      }

      const ext = testImage.extension?.startsWith('.') ? testImage.extension : `.${testImage.extension || 'png'}`;
      const testPath = path.join(tempDir, `test-extract${ext}`);

      fs.writeFileSync(testPath, testImage.buffer);
      console.log('✓ 测试提取成功:', testPath);
      console.log('  路径是否绝对:', path.isAbsolute(testPath));
      console.log('  文件是否存在:', fs.existsSync(testPath));
      console.log('  文件大小:', fs.statSync(testPath).size, 'bytes');

      // 清理测试文件
      fs.unlinkSync(testPath);
      console.log('✓ 测试文件已清理');
    } catch (error) {
      console.error('✗ 提取测试失败:', error.message);
      console.error(error.stack);
    }
  } else {
    console.log('⚠ 没有媒体资源可供测试');
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('用法: node scripts/debug-excel-images.mjs <excel文件路径>');
  process.exit(1);
}

debugExcelImages(args[0]).catch(error => {
  console.error('错误:', error);
  process.exit(1);
});
