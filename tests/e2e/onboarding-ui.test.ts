import { chromium, type Page, type Browser } from 'patchright';

async function testOnboardingUI() {
  let browser: Browser | undefined;
  let page: Page | undefined;
  
  try {
    console.log('🚀 启动浏览器...');
    browser = await chromium.launch({ 
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });
    
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    
    page = await context.newPage();
    
    console.log('📡 访问 Vite 开发服务器...');
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    
    await page.waitForTimeout(2000);
    
    const url = page.url();
    console.log(`📍 当前 URL: ${url}`);
    
    console.log('\n🔍 测试 Onboarding 页面元素...');
    
    const stepIndicators = await page.locator('.step-indicator').count();
    console.log(`✓ 步骤指示器数量: ${stepIndicators}`);
    
    if (stepIndicators !== 4) {
      throw new Error(`预期 4 个步骤指示器，实际 ${stepIndicators}`);
    }
    
    const logo = await page.locator('.onboarding-layout__logo').isVisible();
    console.log(`✓ Logo 可见: ${logo}`);
    
    const brandName = await page.locator('.onboarding-layout__name').textContent();
    console.log(`✓ 品牌名称: ${brandName}`);
    
    const welcomeTitle = await page.locator('.step-welcome__title').textContent();
    console.log(`✓ 欢迎标题: ${welcomeTitle}`);
    
    console.log('\n🎯 测试 Footer 按钮可见性...');
    
    const footer = await page.locator('.onboarding-layout__footer').isVisible();
    console.log(`✓ Footer 区域可见: ${footer}`);
    
    const nextButton = page.locator('.onboarding-layout__footer .el-button--primary');
    const nextButtonVisible = await nextButton.isVisible();
    console.log(`✓ "下一步"按钮可见: ${nextButtonVisible}`);
    
    if (!nextButtonVisible) {
      await page.screenshot({ path: '/tmp/onboarding-debug.png' });
      console.log('📸 已保存调试截图到 /tmp/onboarding-debug.png');
      
      const nextButtonCount = await nextButton.count();
      console.log(`  - 按钮元素数量: ${nextButtonCount}`);
      
      if (nextButtonCount > 0) {
        const boundingBox = await nextButton.boundingBox();
        console.log(`  - 按钮边界框: ${JSON.stringify(boundingBox)}`);
      }
      
      throw new Error('下一步按钮不可见！');
    }
    
    console.log('\n🖱️ 点击下一步按钮...');
    await nextButton.click();
    await page.waitForTimeout(500);
    
    const activeStep = await page.locator('.step-indicator--active .step-indicator__label').textContent();
    console.log(`✓ 当前步骤: ${activeStep}`);
    
    console.log('\n🔍 测试账号添加步骤...');
    
    const platformSelect = await page.locator('.step-account__select').isVisible();
    console.log(`✓ 平台选择器可见: ${platformSelect}`);
    
    const loginButton = await page.locator('.step-account__login-btn').isVisible();
    console.log(`✓ 登录按钮可见: ${loginButton}`);
    
    const skipButton = page.locator('.onboarding-layout__footer .el-button--info');
    const skipVisible = await skipButton.isVisible();
    console.log(`✓ 跳过按钮可见: ${skipVisible}`);
    
    console.log('\n🖱️ 点击跳过按钮...');
    await skipButton.click();
    await page.waitForTimeout(500);
    
    const activeStep2 = await page.locator('.step-indicator--active .step-indicator__label').textContent();
    console.log(`✓ 当前步骤: ${activeStep2}`);
    
    console.log('\n🔍 测试浏览器配置步骤...');
    
    const browserTitle = await page.locator('.step-browser__title').textContent();
    console.log(`✓ 浏览器配置标题: ${browserTitle}`);
    
    const radioGroup = await page.locator('.step-browser__radio-group').isVisible();
    console.log(`✓ 浏览器选项可见: ${radioGroup}`);
    
    console.log('\n🖱️ 点击完成配置...');
    const finishButton = page.locator('.onboarding-layout__footer .el-button--primary');
    await finishButton.click();
    await page.waitForTimeout(500);
    
    const doneTitle = await page.locator('.step-done__title').textContent();
    console.log(`✓ 完成页面标题: ${doneTitle}`);
    
    await page.screenshot({ path: '/tmp/onboarding-success.png' });
    console.log('📸 已保存成功截图到 /tmp/onboarding-success.png');
    
    console.log('\n✅ 所有 Onboarding UI 测试通过！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    if (page) {
      await page.screenshot({ path: '/tmp/onboarding-error.png' });
      console.log('📸 已保存错误截图到 /tmp/onboarding-error.png');
    }
    throw error;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

testOnboardingUI().catch(console.error);
