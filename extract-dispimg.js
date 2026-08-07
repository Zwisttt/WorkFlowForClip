/**
 * 检查Excel中的所有媒体资源
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { randomUUID } = require('crypto');

async function extractDispImgImages(excelPath) {
  console.log('\n=== 提取DISPIMG图片 ===\n');
  console.log(`Excel文件: ${excelPath}\n`);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(excelPath);

  // 检查workbook的媒体资源
  console.log('工作簿媒体资源:');
  if (workbook.model.media && workbook.model.media.length > 0) {
    console.log(`  找到 ${workbook.model.media.length} 个媒体文件\n`);

    const tempDir = path.join(os.tmpdir(), 'matrixflow-dispimg-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    for (let i = 0; i < workbook.model.media.length; i++) {
      const media = workbook.model.media[i];
      console.log(`  媒体 ${i}:`, {
        index: media.index,
        type: media.type,
        extension: media.extension,
        name: media.name,
        size: media.buffer ? `${(media.buffer.length / 1024).toFixed(2)} KB` : 'N/A'
      });

      // 尝试保存
      if (media.buffer) {
        const ext = media.extension ? (media.extension.startsWith('.') ? media.extension : `.${media.extension}`) : '.png';
        const fileName = `dispimg-${i}${ext}`;
        const filePath = path.join(tempDir, fileName);
        fs.writeFileSync(filePath, media.buffer);
        console.log(`    ✅ 已保存到: ${filePath}`);
      }
    }
  } else {
    console.log('  ⚠️  没有找到媒体资源');
  }

  // 检查每个工作表的图片
  for (const worksheet of workbook.worksheets) {
    console.log(`\n工作表 "${worksheet.name}" 的图片:`);
    const images = worksheet.getImages();
    console.log(`  传统嵌入图片: ${images.length} 个`);

    if (images.length > 0) {
      for (const img of images) {
        console.log(`    图片ID: ${img.imageId}, 类型: ${img.type}`);
      }
    }
  }

  // 检查cellImages (Excel 365的单元格图片)
  for (const worksheet of workbook.worksheets) {
    console.log(`\n工作表 "${worksheet.name}" - 检查DISPIMG引用:`);

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
    if (!chartColumn) continue;

    for (let rowNumber = 2; rowNumber <= Math.min(worksheet.rowCount, 10); rowNumber++) {
      const row = worksheet.getRow(rowNumber);
      const cell = row.getCell(chartColumn);

      if (cell.value && typeof cell.value === 'object' && 'formula' in cell.value) {
        const formula = cell.value.formula;
        const match = formula.match(/DISPIMG\("([^"]+)"/);
        if (match) {
          const imageId = match[1];
          console.log(`  第${rowNumber}行: DISPIMG引用ID = ${imageId}`);

          // 尝试在媒体资源中查找对应的图片
          if (workbook.model.media) {
            const matchedMedia = workbook.model.media.find((m) =>
              m.name && m.name.includes(imageId)
            );
            if (matchedMedia) {
              console.log(`    ✅ 找到对应的媒体资源:`, {
                index: matchedMedia.index,
                name: matchedMedia.name,
                extension: matchedMedia.extension
              });
            } else {
              console.log(`    ⚠️  未找到对应的媒体资源`);
            }
          }
        }
      }
    }
  }

  console.log('\n=== 提取完成 ===\n');
}

const excelPath = process.argv[2];
if (!excelPath) {
  console.log('使用方法: node extract-dispimg.js <excel文件路径>');
  process.exit(1);
}

extractDispImgImages(path.resolve(excelPath)).catch((error) => {
  console.error('\n❌ 提取失败:', error);
  console.error(error.stack);
  process.exit(1);
});
