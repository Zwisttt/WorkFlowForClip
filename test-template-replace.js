// 测试模板替换功能
const path = require('path');

// 模拟测试数据
const testData = {
  templateName: 'Stella纯文案',
  script: '这是测试文字内容，用来验证文字是否被正确替换。',
  backgroundPath: '/Users/mac/Desktop/素材/图片素材/1.jpg',
  bgmPath: '/Users/mac/Desktop/素材/音频素材/1.the irishman.mp3',
  workName: '测试草稿 ' + new Date().toLocaleString('zh-CN'),
};

console.log('测试数据:', testData);
console.log('\n请在MatrixFlow应用中手动创建一个自动化任务来测试。');
console.log('\n步骤：');
console.log('1. 打开MatrixFlow应用');
console.log('2. 进入自动化模块');
console.log('3. 上传你的Excel表格');
console.log('4. 确认并启动任务');
console.log('5. 等待草稿生成完成');
console.log('6. 在剪映中查找新生成的草稿（名称会包含你表格中的"作品名字"）');
console.log('7. 打开草稿，检查文字、图片、音频是否都是表格中提供的内容');
