/**
 * 创建一个带有嵌入图片的测试Excel文件
 */

const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function createTestExcel() {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('测试账号');

  // 添加表头
  worksheet.columns = [
    { header: '模版名', key: 'template', width: 15 },
    { header: '脚本', key: 'script', width: 30 },
    { header: '底图', key: 'background', width: 40 },
    { header: '星盘图片', key: 'chart', width: 40 },
    { header: 'BGM素材', key: 'bgm', width: 40 },
    { header: '发布文案', key: 'copy', width: 30 },
    { header: '话题', key: 'topics', width: 20 },
    { header: '发布日期', key: 'date', width: 15 },
    { header: '当天发布时间', key: 'time', width: 15 },
    { header: '作品名字', key: 'workName', width: 20 },
  ];

  // 添加测试数据行（路径方式）
  worksheet.addRow({
    template: 'Stella纯文案',
    script: '这是测试脚本内容，用于验证功能是否正常工作。',
    background: '/path/to/background.jpg',
    chart: '/path/to/chart.png',
    bgm: '/path/to/bgm.mp3',
    copy: '这是发布文案 #测试话题',
    topics: '#测试 #验证',
    date: new Date('2026-12-31'),
    time: '14:30',
    workName: '测试作品1',
  });

  // 添加一个空行，准备插入嵌入图片
  const imageRow = worksheet.addRow({
    template: 'luna纯文案',
    script: '这是第二个测试脚本，底图和星盘图片将使用嵌入图片。',
    background: '', // 留空，准备插入嵌入图片
    chart: '', // 留空，准备插入嵌入图片
    bgm: '/path/to/bgm2.mp3',
    copy: '第二个测试 #嵌入图片',
    topics: '#图片测试',
    date: new Date('2027-01-15'),
    time: '16:00',
    workName: '测试作品2',
  });

  console.log('✅ 已创建Excel基础结构');
  console.log(`   图片将插入到第 ${imageRow.number} 行`);

  // 查找测试图片
  const testImagePaths = [
    path.join(__dirname, 'test-image.png'),
    path.join(__dirname, 'assets', 'test-image.png'),
    path.join(__dirname, 'docs', 'test-image.png'),
  ];

  let testImagePath = null;
  for (const imgPath of testImagePaths) {
    if (fs.existsSync(imgPath)) {
      testImagePath = imgPath;
      break;
    }
  }

  // 如果没有找到测试图片，创建一个简单的PNG
  if (!testImagePath) {
    console.log('⚠️  未找到测试图片，将创建一个简单的测试图片');
    testImagePath = path.join(__dirname, 'test-image.png');

    // 创建一个最小的1x1 PNG图片 (67字节)
    const minimalPNG = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, // 1x1 dimensions
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
      0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, // IDAT chunk
      0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, // IEND chunk
      0x42, 0x60, 0x82
    ]);
    fs.writeFileSync(testImagePath, minimalPNG);
    console.log(`   已创建测试图片: ${testImagePath}`);
  } else {
    console.log(`✅ 找到测试图片: ${testImagePath}`);
  }

  // 添加图片到工作簿
  const imageId = workbook.addImage({
    filename: testImagePath,
    extension: 'png',
  });

  // 在底图列（第3列，C列）插入图片
  worksheet.addImage(imageId, {
    tl: { col: 2, row: imageRow.number - 1 }, // ExcelJS使用0索引，第3列是col:2
    ext: { width: 100, height: 100 },
  });

  // 在星盘图片列（第4列，D列）插入图片
  const imageId2 = workbook.addImage({
    filename: testImagePath,
    extension: 'png',
  });

  worksheet.addImage(imageId2, {
    tl: { col: 3, row: imageRow.number - 1 }, // 第4列是col:3
    ext: { width: 100, height: 100 },
  });

  console.log('✅ 已在第2行的底图和星盘图片列插入图片');

  // 设置行高以显示图片
  worksheet.getRow(imageRow.number).height = 75;

  // 保存文件
  const outputPath = path.join(__dirname, 'test-embedded-images.xlsx');
  await workbook.xlsx.writeFile(outputPath);

  console.log(`\n✅ 测试Excel文件已创建: ${outputPath}`);
  console.log('\n使用方法:');
  console.log(`  node test-embedded-image.js "${outputPath}"`);
  console.log('\n或者在应用中导入这个Excel文件测试功能。');

  return outputPath;
}

createTestExcel().catch((error) => {
  console.error('❌ 创建测试文件失败:', error);
  process.exit(1);
});
