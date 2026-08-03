// 测试使用未加密模板生成草稿
const { jianyingTemplateService } = require('./dist/electron/services/JianyingTemplateService');
const path = require('path');

async function test() {
  try {
    console.log('=== 开始测试未加密模板 ===\n');

    // 1. 解析未加密的模板
    const templatePath = '/Users/mac/Desktop/模版文件/Stella纯文案';
    console.log('1. 解析模板:', templatePath);
    const template = jianyingTemplateService.inspect(templatePath, 'Stella纯文案_测试');
    console.log('   模板解析成功!');
    console.log('   文字槽:', template.textSlotKey);
    console.log('   图片槽:', template.imageSlotKeys);
    console.log('   音频槽:', template.audioSlotKey);

    // 2. 生成草稿
    const outputRoot = '/Users/mac/Movies/JianyingPro/User Data/Projects/com.lveditor.draft';
    const workName = '测试草稿_' + new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const values = {
      script: '这是测试文字内容，用来验证未加密模板是否能正确替换文字、图片和音频。',
      backgroundPath: '/Users/mac/Desktop/素材/图片素材/1.jpg',
      bgmPath: '/Users/mac/Desktop/素材/音频素材/1.the irishman.mp3',
    };

    console.log('\n2. 生成草稿:', workName);
    console.log('   输出目录:', outputRoot);
    const draftPath = jianyingTemplateService.generate(
      template,
      outputRoot,
      workName,
      values
    );

    console.log('\n=== 测试成功! ===');
    console.log('草稿路径:', draftPath);
    console.log('\n请在剪映中打开这个草稿，检查：');
    console.log('1. 文字是否替换为: "这是测试文字内容..."');
    console.log('2. 图片是否替换为: 1.jpg');
    console.log('3. 音频是否替换为: 1.the irishman.mp3');
  } catch (error) {
    console.error('\n=== 测试失败 ===');
    console.error('错误:', error.message);
    console.error('\n完整错误信息:');
    console.error(error);
    process.exit(1);
  }
}

test();
