# Changelog

## [Unreleased]

### Security
- Sentry DSN 改为环境变量注入（`SENTRY_DSN` / `VITE_SENTRY_DSN`）
- 清理 Git 历史中的浏览器 Cookie 和会话数据

## [0.3.0] - 2026-06-08

### Added

#### 全平台适配器增强
- 抖音发布设置重设计，支持完整发布流程
- 小红书登录检测修复 + API profile fallback
- 视频号定时发布逻辑完整实现
- 快手发布流程完整实现 + 单元测试（8 文件 92 用例）
- 嵌入式浏览器模式（替代外部 Chrome）

#### 发布模块重构
- 完整发布模块：11 组件 + 3 视图 + VideoPublish（1115 行）
- 发布前置校验提前到 `createPublishTask` 入口
- 平台前置校验 + Cookie 验证流程优化
- 标题/描述 AI 预检集成

#### 任务管理
- 任务管理 UI 三视图（summary/timeline/detail）
- 任务列表分页、统计、状态更新优化
- 批量操作：批量创建、复制、定时、重试

#### 仪表盘
- 主页仪表盘实现
- 账号未分组筛选
- 面板分组视图 + z-index 分层
- 面板显隐控制

#### 风控与 AI
- 风险控制基础模块增强 + 单元测试
- AI 发布前检查（标题/描述/标签）
- 异常检测与告警

#### 测试
- 快手平台适配器单元测试（8 文件，92 用例）
- DraftService/handlers/stores/QueueManager 测试扩展
- 整体测试覆盖率提升

### Changed
- 抖音/小红书登录+发布重写为嵌入式浏览器模式
- 发布流程从 Cookie 验证到平台校验全链路优化
- 任务状态机 pending → running → success/failed（指数退避重试）

### Fixed
- 小红书发布流程（内容声明/可见性/定时发布/发布按钮）
- 小红书登录检测、主页打开、发布封面图
- 视频号定时发布逻辑、标题输入自动填充循环
- 视频号位置选择限定编辑器 root
- 任务重新执行后状态更新
- TaskListResult statusBreakdown 类型补全
- 浏览器自动填充禁用（autocomplete="off"）

## [0.2.0] - 2026-05-18

### Added

#### Onboarding (A9)
- New user onboarding wizard with 4 steps: Welcome → Add Account → Browser Config → Done
- Full-screen OnboardingLayout without sidebar
- Navigation guard redirects to /onboarding until setup is complete
- `onboardingCompleted` setting persisted via settings store

#### Data Export/Import (A10)
- Real backup/restore system replacing mock implementations
- `createBackup()` using SQLite backup API with timestamped filenames
- `listBackups()` / `restoreBackup()` / `deleteBackup()` for backup management
- `clearData()` for logs, cache, and full data cleanup
- `data:*` IPC channels and `window.matrixflow.data` API
- DataManagementSettings.vue now uses real IPC calls

#### Notification Configuration (A11)
- NotificationService subscribing to MonitorService and AnomalyService alerts
- Electron desktop notifications with click-to-focus behavior
- NotificationSettings panel in Settings with: master toggle, sound, source filters, critical-only mode, test button
- `notification:*` IPC channels
- 5 new notification preferences in settings store

#### Platform Adapter Unified Entry (A12)
- `electron/platform/adapter.ts` barrel file re-exporting all 4 platform adapters
- `registerAllAdapters()` helper replacing 4 separate register calls in main.ts
- `PLATFORM_IDS` constant and `PlatformId` type for type-safe platform references
- Simplified main.ts imports

#### Worker Threads (A13)
- `BrowserAutomationWorker` manager for offloading browser automation to Worker threads
- `browser-worker.ts` worker entry with independent Patchright Browser instance
- Typed message protocol (WorkerMessage / WorkerResponse) for main↔worker communication
- Promise-based API with progress callbacks
- Auto-restart on worker crash with configurable max attempts

#### Sentry Integration (A14)
- `@sentry/electron@7.13.0` added as dependency
- Main process Sentry init (SentryInit.ts) with sensitive data scrubbing in beforeSend
- Renderer process Sentry init (src/renderer/utils/sentry.ts)
- Error tracking for both processes with environment/release tagging
- Placeholder DSN for development

#### Previous (Batch 1-8)
- BrowserFactory: three-mode browser factory (embedded/external Chrome/fingerprint browser)
- PublishWizard: 3-step publish wizard component
- Calendar Views: week view, day view, context menu, summary bar with conflict detection
- AI Rule Optimization Banner: smart rule suggestions during publish scheduling
- AI Weekly Report Panel: AI-generated weekly operations report
- Data Monitor Panel: monitoring plans CRUD with alert display
- Task Management Rewrite: three-view (summary/timeline/detail) with retry/skip actions
- Group Rule Templates: aggressive/moderate/conservative publish rule presets
- Browser Configuration Tab in Settings
- TypeScript error fixes: panel.ts loadPanels, env.d.ts File.path type

### Changed
- main.ts: simplified platform adapter imports via registerAllAdapters()
- DataManagementSettings.vue: replaced all mock implementations with real IPC calls
- Settings.vue: added "通知设置" and "浏览器配置" tabs
- Tasks.vue: rewritten with three-view layout
- Publish.vue: integrated wizard, calendar views, AI banner
- Stats.vue: added data monitoring and AI weekly report tabs
