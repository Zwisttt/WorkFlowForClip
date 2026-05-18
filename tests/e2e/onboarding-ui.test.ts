import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, type Page, type Browser } from 'patchright';

describe('Onboarding UI Tests', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }
    });
    page = await context.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('should display Onboarding page elements', async () => {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const stepIndicators = await page.locator('.step-indicator').count();
    expect(stepIndicators).toBe(4);
  });

  it('should show next button in footer', async () => {
    const footer = page.locator('.onboarding-layout__footer');
    await expect(footer).toBeVisible();

    const nextButton = page.locator('.onboarding-layout__footer button:has-text("下一步")');
    await expect(nextButton).toBeVisible();
  });

  it('should navigate to step 1 when clicking next', async () => {
    const nextButton = page.locator('.onboarding-layout__footer button:has-text("下一步")');
    await nextButton.click();
    await page.waitForTimeout(500);

    const activeStep = await page.locator('.step-indicator--active .step-indicator__label').textContent();
    expect(activeStep).toBe('添加账号');
  });

  it('should show skip button on step 1', async () => {
    const skipButton = page.locator('.onboarding-layout__footer button:has-text("跳过")');
    await expect(skipButton).toBeVisible();
  });

  it('should navigate to step 2 when clicking skip', async () => {
    const skipButton = page.locator('.onboarding-layout__footer button:has-text("跳过")');
    await skipButton.click();
    await page.waitForTimeout(500);

    const activeStep = await page.locator('.step-indicator--active .step-indicator__label').textContent();
    expect(activeStep).toBe('浏览器');
  });

  it('should show browser config options', async () => {
    const radioGroup = page.locator('.step-browser__radio-group');
    await expect(radioGroup).toBeVisible();

    const browserOptions = await page.locator('.browser-option').count();
    expect(browserOptions).toBe(3);
  });

  it('should navigate to step 3 when clicking finish', async () => {
    const finishButton = page.locator('.onboarding-layout__footer button:has-text("完成配置")');
    await finishButton.click();
    await page.waitForTimeout(500);

    const activeStep = await page.locator('.step-indicator--active .step-indicator__label').textContent();
    expect(activeStep).toBe('完成');
  });

  it('should show done page with start button', async () => {
    const doneTitle = await page.locator('.step-done__title').textContent();
    expect(doneTitle).toBe('一切就绪！');

    const startButton = page.locator('.step-done__start-btn');
    await expect(startButton).toBeVisible();
  });
});
