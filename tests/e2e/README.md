# E2E 测试指南

## 概述

E2E 测试使用 Patchright（Playwright stealth 分支）驱动真实浏览器进行端到端测试。

## Mock Onboarding 流程

E2E 测试默认会 **跳过 Onboarding 流程**，避免需要扫码登录。

### 跳过方式

1. **直接跳过整个 Onboarding**（推荐）
   ```typescript
   import { skipOnboarding } from './mocks/onboarding-mock';
   
   await skipOnboarding(page);
   ```
   这会设置 `localStorage.onboardingCompleted = true`，直接进入主应用。

2. **Mock 账号登录**
   ```typescript
   import { mockAccountLogin } from './mocks/onboarding-mock';
   
   const account = await mockAccountLogin(page, 'douyin');
   ```
   创建一个 mock 账号，不触发真实的扫码流程。

3. **导航通过 Onboarding**
   ```typescript
   import { navigateThroughOnboarding } from './mocks/onboarding-mock';
   
   await navigateThroughOnboarding(page, config);
   ```
   自动点击"下一步"、"跳过"、"完成配置"按钮，跳过扫码步骤。

## 运行测试

### 前置条件

1. 启动开发服务器：
   ```bash
   npm run dev:vite
   ```

2. 安装 Patchright 浏览器：
   ```bash
   npx patchright install chrome
   ```

### 运行命令

```bash
# 运行基础 E2E 测试（跳过 onboarding）
npm run test:e2e:basic

# 运行完整 Onboarding UI 测试
npm run test:e2e:onboarding

# 运行所有 E2E 测试
npm run test:e2e
```

## 配置

在 `tests/e2e/e2e-config.ts` 中配置：

```typescript
const config = createE2EConfig({
  skipOnboarding: true,      // 跳过 onboarding
  mockAccountLogin: true,    // mock 账号登录
  mockPlatform: 'douyin',    // mock 平台
  headless: false,           // 是否无头模式
  viewport: { width: 1280, height: 800 },
  devServerUrl: 'http://localhost:5173',
  timeout: 30000,
});
```

## 测试文件结构

```
tests/e2e/
├── e2e-config.ts           # E2E 测试配置
├── e2e-basic.test.ts       # 基础 E2E 测试（跳过 onboarding）
├── onboarding-ui.test.ts   # 完整 Onboarding UI 测试
├── helpers.ts              # 测试辅助函数
├── setup.ts                # E2E 环境设置
└── mocks/
    └── onboarding-mock.ts  # Onboarding mock 函数
```

## Mock 账号数据

预定义的 mock 账号：

| 平台 | ID | 昵称 |
|------|-----|------|
| 抖音 | mock-douyin-001 | 测试抖音账号 |
| 小红书 | mock-xhs-001 | 测试小红书账号 |
| 视频号 | mock-channels-001 | 测试视频号账号 |
| 快手 | mock-kuaishou-001 | 测试快手账号 |

## 注意事项

1. **开发服务器必须运行**：E2E 测试需要访问 `http://localhost:5173`
2. **Patchright 浏览器**：首次运行需要安装 `npx patchright install chrome`
3. **超时设置**：E2E 测试默认超时 30 秒，可通过环境变量 `E2E_TIMEOUT` 调整
4. **截图**：测试失败时会自动截图保存到 `/tmp/` 目录
