// 调试：检查草稿生成过程中何时被加密
const { jianyingTemplateService } = require('./dist/electron/services/JianyingTemplateService');
const path = require('path');
const fs = require('fs');

async function test() {
  try {
    console.log('=== 开始调试加密问题 ===\n');

    const templatePath = '/Users/mac/Desktop/模版文件/luna纯文案';
    console.log('1. 解析模板:', templatePath);

    // 检查模板是否加密
    const templateDraft = fs.readFileSync(path.join(templatePath, 'draft_info.json'), 'utf8');
    console.log('   模板文件前100字符:', templateDraft.slice(0, 100));
    console.log('   模板是否加密:', !templateDraft.trimStart().startsWith('{') ? '是' : '否');

    const template = jianyingTemplateService.inspect(templatePath, 'luna纯文案_调试');
    console.log('   模板解析成功!');

    const outputRoot = '/Users/mac/Movies/JianyingPro/User Data/Projects/com.lveditor.draft';
    const workName = '调试草稿_' + new Date().toISOString().slice(11, 19).replace(/:/g, '');
    const values = {
      script: '调试文字内容',
      backgroundPath: '/Users/mac/Desktop/素材/图片素材/1.jpg',
      bgmPath: '/Users/mac/Desktop/素材/音频素材/1.the irishman.mp3',
    };

    console.log('\n2. 生成草稿:', workName);

    // Hook into the generation to check intermediate state
    const originalCpSync = fs.cpSync;
    const originalRenameSync = fs.renameSync;
    let tmpDir = null;

    fs.cpSync = function(...args) {
      const result = originalCpSync.apply(this, args);
      if (args[1] && args[1].includes('.tmp')) {
        tmpDir = args[1];
        console.log('\n   [HOOK] 复制完成，临时目录:', tmpDir);
        const draftFile = path.join(tmpDir, 'draft_info.json');
        if (fs.existsSync(draftFile)) {
          const content = fs.readFileSync(draftFile, 'utf8');
          console.log('   [HOOK] 复制后 draft_info.json 前100字符:', content.slice(0, 100));
          console.log('   [HOOK] 复制后是否加密:', !content.trimStart().startsWith('{') ? '是' : '否');
        }
      }
      return result;
    };

    fs.renameSync = function(...args) {
      if (args[0] && args[0].includes('.tmp')) {
        console.log('\n   [HOOK] 准备重命名，检查文件状态...');
        const draftFile = path.join(args[0], 'draft_info.json');
        if (fs.existsSync(draftFile)) {
          const content = fs.readFileSync(draftFile, 'utf8');
          console.log('   [HOOK] 重命名前 draft_info.json 前100字符:', content.slice(0, 100));
          console.log('   [HOOK] 重命名前是否加密:', !content.trimStart().startsWith('{') ? '是' : '否');
        }
      }
      const result = originalRenameSync.apply(this, args);
      if (args[1]) {
        console.log('\n   [HOOK] 重命名完成，最终目录:', args[1]);
        const draftFile = path.join(args[1], 'draft_info.json');
        if (fs.existsSync(draftFile)) {
          const content = fs.readFileSync(draftFile, 'utf8');
          console.log('   [HOOK] 重命名后 draft_info.json 前100字符:', content.slice(0, 100));
          console.log('   [HOOK] 重命名后是否加密:', !content.trimStart().startsWith('{') ? '是' : '否');
        }
      }
      return result;
    };

    const draftPath = jianyingTemplateService.generate(
      template,
      outputRoot,
      workName,
      values
    );

    // Restore
    fs.cpSync = originalCpSync;
    fs.renameSync = originalRenameSync;

    console.log('\n=== 测试完成 ===');
    console.log('草稿路径:', draftPath);

    // 最终检查
    setTimeout(() => {
      const finalFile = path.join(draftPath, 'draft_info.json');
      if (fs.existsSync(finalFile)) {
        const content = fs.readFileSync(finalFile, 'utf8');
        console.log('\n3秒后最终检查:');
        console.log('   draft_info.json 前100字符:', content.slice(0, 100));
        console.log('   是否加密:', !content.trimStart().startsWith('{') ? '是' : '否');
      }
    }, 3000);

  } catch (error) {
    console.error('\n=== 测试失败 ===');
    console.error('错误:', error.message);
    console.error(error);
    process.exit(1);
  }
}

test();
