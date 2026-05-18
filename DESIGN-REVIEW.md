# MatrixFlow 设计评审报告

> **评审范围**：v0.2.0 代码库 + 星枢智联新设计系统
> **评审日期**：2026-05-18
> **基线文件**：`DESIGN.md`（星枢智联主题）、`src/renderer/styles/variables.css`（123 行 token）
> **数据来源**：28 个 Vue 文件完整视觉审计（123 处硬编码色、51 处硬编码字体）

---

## 总评

| 维度 | 评分 | 关键问题 |
|------|------|----------|
| 交互状态 | 6/10 | 状态覆盖不完整，disabled/loading 定义缺失 |
| 信息架构 | 7/10 | 侧边栏导航清晰，但 stat-card 模式未完全统一 |
| 用户旅程 | 6/10 | 发布向导完整，但缺少错误恢复路径 |
| AI Slop 风险 | 5/10 | 骨架屏渐变、紫色主题割裂、ECharts 硬编码色 |
| 可访问性 | 3/10 | 零 aria 属性、无 focus-visible、对比度不足 |
| 响应式 | 5/10 | 断点覆盖 5 个页面，但固定宽度导致溢出风险 |
| 信任感 | 6/10 | 确认对话框到位，但错误信息缺乏具体指导 |

**综合评分**：5.4/10 — 新设计系统 token 定义完整，但迁移尚未执行，当前代码库与新系统严重脱节。

---

## 1. 交互状态 — 6/10

### 发现

**✅ 已有状态（做得好的）**
- `Sidebar.vue` — hover/active 状态完整，使用 `var(--transition-fast)` 统一过渡
- `ContentCard.vue` — 遮罩层 hover 渐现（opacity 0→1），操作栏交互流畅
- `AccountCard.vue` — 在线状态指示灯（box-shadow glow），Cookie 状态标签（el-tag success/danger）
- `TaskItem.vue` — 4 种任务状态色（运行/成功/失败/等待），进度条动态

**❌ 缺失状态**
- **disabled 状态**：全局无统一 disabled 样式。el-button disabled 依赖 Element Plus 默认，自定义组件无定义
- **loading 状态**：`Loading.vue` 仅有旋转动画，无骨架屏统一规范。`AIRuleOptimizationBanner.vue` 自行实现 skeleton-pulse，与其他组件无关
- **focus-visible**：零定义。键盘用户无法识别当前焦点位置
- **drag 状态**：`PublishCalendar.vue` 拖拽有 z-index:9999 提升，但无视觉反馈（opacity/缩放/shadow 变化未系统化）
- **empty 状态**：`Empty.vue` 组件存在，但图标和文案大小不一致

### 建议
1. 在 variables.css 增加 `--color-disabled` / `--opacity-disabled` token
2. 全局 `.is-loading` / `.is-disabled` CSS class 规范
3. 统一 focus-visible 样式：`outline: 2px solid var(--color-primary); outline-offset: 2px`

---

## 2. 信息架构 — 7/10

### 发现

**✅ 做得好的**
- 侧边栏 11 项导航（总览/内容/发布/任务/数据/账号/分组/面板/设置），逻辑清晰：发布前（内容/账号/分组）→ 发布 → 发布后（任务/数据）
- 每个页面统一使用 `page-{name}` BEM 命名，`__header` / `__stats` / `__grid` 结构一致
- `MainLayout.vue` 三栏布局（sidebar 220px + header 56px + content flex-1）稳定

**⚠️ 问题**
- **stat-card 模式不统一**：`Accounts.vue`/`Groups.vue`/`Tasks.vue`/`Publish.vue`/`Stats.vue` 各自定义 stat-card 样式，尺寸/间距/字体不完全一致
- **设置页信息密度过高**：`Settings.vue` 用 el-tabs 嵌套 9 个面板（通用/账号/代理/代理池/指纹/通知/数据/关于/License），单面板内信息密度大
- **分组与账号关系**：侧边栏"账号"和"分组"并列，但分组本质是账号的聚合，层级关系不直观

### 建议
1. 抽取 `StatCard.vue` 通用组件，统一 `stat-card__header/value/label` 结构
2. Settings 考虑分组折叠（安全组/数据组/关于组），降低单屏信息密度

---

## 3. 用户旅程 — 6/10

### 发现

**✅ 核心流程完整**
- 发布向导 3 步（选内容 → 选账号/分组 → 配规则）→ 任务队列 → 结果查看
- Onboarding 4 步引导（欢迎 → 创建账号 → 连接浏览器 → 完成）
- 内容管理支持拖拽排序、批量选择

**❌ 断点与盲区**
- **向导无"上一步"退出确认**：Step 2/3 若已配置数据，返回 Step 1 会丢失配置，无 warning
- **任务失败后无重试入口**：`TaskItem.vue` 有 failed 状态展示，但无内联重试按钮（需到任务列表操作）
- **发布历史回溯困难**：发布完成后只能通过"任务"页查看结果，日历视图无法直接定位历史发布
- **日历拖拽无撤销**：`PublishCalendar.vue` 拖拽调整时间后无 undo，也无确认弹窗
- **空内容库引导缺失**：首次进入"内容"页无引导文案或示例

### 建议
1. 向导步骤间增加 `beforeRouteLeave` 守卫，数据变更时弹确认
2. TaskItem failed 状态增加内联"重试"按钮
3. 日历拖拽后显示 toast 提示 + 3s 内可撤销

---

## 4. AI Slop 风险 — 5/10

### 发现

**🔴 高风险项**
- **AIRuleOptimizationBanner.vue 紫色主题割裂**：使用独立紫色体系（#7c3aed / #f5f3ff / #ede9fe / #e0dbff），与星枢智联的铂蓝+云青完全不协调。骨架屏用 `linear-gradient(90deg, #ede9fe 25%, #e0dbff 50%, #ede9fe 75%)` — 典型的 AI 生成渐变
- **ECharts 双重硬编码色板**：`PlatformComparison.vue` 和 `TrendChart.vue` 各自定义 ~15 个暗色/亮色色值（#1d1e2c, #333, #a3a6b4, #86909c...），与设计系统完全脱钩
- **分组颜色调色板**：`GroupEditDialog.vue` 硬编码 8 色 `['#f56c6c', '#e6a23c', '#67c23a', '#409eff', '#909399', '#9b59b6', '#1abc9c', '#e74c3c']`，Element Plus 默认色混搭，无设计系统约束

**🟡 中风险项**
- **#409eff 残留**：22+ 处仍使用旧主色 `rgba(64,158,255,...)`，与 `--color-primary: #2563eb` 不一致。迁移后会产生视觉不一致期
- **统计色硬编码**：`Stats.vue:69` — `:colors="['#409eff', '#67c23a', '#e6a23c']"` 直接在模板中写死
- **TaskItem 进度色**：`progressColor = computed(() => '#409eff')` — JS 内联硬编码

**✅ 做得好的**
- BEM 命名规范统一，无随意命名
- 过渡动画统一使用 `var(--transition-fast)` / `var(--transition-base)`，无过度花哨动画
- 侧边栏/主布局结构清晰，无多余装饰

### 建议
1. **AI 横幅重设计**：紫色系替换为云青 `--color-accent: #0ea5e9` 作为 AI 模块标识色，骨架屏改为中性色 shimmer
2. **ECharts 色板提取**：在 variables.css 定义 `--chart-color-{1-6}` 变量，图表组件通过 props 传入
3. **分组调色板重构**：使用 HSL 色相均匀分布生成 8 色，避免手动选色

---

## 5. 可访问性 — 3/10

### 发现

**🔴 严重缺失**
- **零 aria 属性**：全文搜索 `aria-` 在 Vue 文件中无结果。所有交互组件（按钮、对话框、标签页、下拉）缺少 `aria-label`/`aria-describedby`
- **无 focus-visible**：CSS 中无 `:focus-visible` 定义。键盘用户无法定位焦点
- **role 属性缺失**：自定义组件（stat-card, content-card, task-chip）无 `role` 语义
- **tabindex 管理**：无 tabindex 定义，完全依赖浏览器默认 tab 序

**🟡 对比度问题**
- `--color-text-placeholder: #cbd5e1` 在白底上对比度约 2.8:1，不满足 WCAG AA 4.5:1
- `--color-text-sidebar: #94a3b8` 在 `#0f172a` 背景上对比度约 4.1:1，勉强 AA（大文本）
- `--color-silver: #94a3b8` 在白底上对比度仅 2.9:1，不可用于文字

**🟢 做得好的**
- Element Plus 组件自带 aria 支持（el-button, el-dialog, el-table）
- 语义化标签使用（`<header>`, `<nav>`, `<main>`）
- 字体大小体系完整（10px~24px 9 级）

### 建议
1. 紧急：添加全局 `:focus-visible` 样式
2. 紧急：placeholder 色调深至 `#94a3b8`（4.5:1+）
3. 中期：关键交互组件补充 `aria-label`
4. 中期：侧边栏 `<nav>` 添加 `aria-label="主导航"`

---

## 6. 响应式 — 5/10

### 发现

**✅ 已有断点**
- `@media (max-width: 768px)` — Groups.vue, Accounts.vue, Tasks.vue, PublishCalendar.vue
- `@media (max-width: 900px)` — Stats.vue, PlatformComparison.vue

**❌ 问题**
- **固定宽度溢出**：`Accounts.vue`（width:140px/200px/120px）、`Stats.vue`（width:240px/120px）、`MultiPanel.vue`（width:200px）— 窗口缩小时不回弹
- **侧边栏无响应式折叠**：断点下侧边栏不自动折叠，依赖用户手动点击 toggle
- **日历组件脆弱**：`PublishCalendar.vue` 在窄窗口下日历格子挤压，日期数字溢出
- **ECharts 图表不缩放**：`PlatformComparison.vue`/`TrendChart.vue` 使用固定高度，不随窗口变化
- **缺少 min-width 保护**：MainLayout 未设置 `min-width`，窗口极小时布局崩坏

### 建议
1. `MainLayout` 增加 `min-width: 960px` 保护
2. 768px 断点下侧边栏自动折叠
3. 固定宽度替换为 `min-width` + `flex-shrink: 1`

---

## 7. 信任感 — 6/10

### 发现

**✅ 做得好的**
- **删除确认**：`CalendarContextMenu.vue` 删除操作有确认弹窗
- **Cookie 状态可视化**：`AccountCard.vue` 实时显示在线/过期/异常状态
- **License 验证 UI**：`LicenseSettings.vue` 展示许可证状态（有效/过期/未激活）
- **数据管理**：`DataManagementSettings.vue` 提供备份/恢复/清理，操作前有确认

**❌ 不足**
- **错误信息不具体**：`TaskDetailDialog.vue` 的错误区域仅展示红色背景+错误文本，无结构化错误码或"如何修复"指引
- **登录过程焦虑**：`BindAccountDialog.vue` 扫码登录时仅有 QR 码+spinner，无"扫码成功后会发生什么"的步骤说明
- **批量操作不可逆感知弱**：批量发布/批量删除的确认弹窗未强调不可逆性
- **数据导出缺失**：用户无法导出自己的发布数据/统计数据，平台锁定感强

### 建议
1. 错误展示增加结构化格式：错误码 + 原因 + 建议操作
2. 扫码登录增加步骤指示器（"扫码 → 确认 → 完成"）
3. 批量操作确认弹窗增加 `type="danger"` + 不可逆说明文字

---

## 优先级行动清单

### P0 — 立即修复（阻塞设计系统生效）

| # | 事项 | 影响范围 | 预估 |
|---|------|---------|------|
| 1 | **123 处硬编码色迁移** → CSS 变量 | 28 个 Vue 文件 | 4h |
| 2 | **51 处硬编码字体迁移** → CSS 变量 | 20 个 Vue 文件 | 2h |
| 3 | **AI 横幅紫色 → 云青重设计** | AIRuleOptimizationBanner.vue | 1h |

### P1 — 设计完整性（1 周内）

| # | 事项 | 影响范围 | 预估 |
|---|------|---------|------|
| 4 | **ECharts 色板系统化** | PlatformComparison.vue, TrendChart.vue | 2h |
| 5 | **分组调色板重构** | GroupEditDialog.vue | 1h |
| 6 | **全局 focus-visible** | variables.css + 全组件 | 1h |
| 7 | **placeholder 对比度修复** | variables.css | 15min |

### P2 — 体验提升（v0.3.0 迭代中）

| # | 事项 | 影响范围 | 预估 |
|---|------|---------|------|
| 8 | StatCard 通用组件抽取 | 5 个页面 | 3h |
| 9 | 任务失败内联重试按钮 | TaskItem.vue | 1h |
| 10 | 日历拖拽 undo 机制 | PublishCalendar.vue | 2h |
| 11 | 错误展示结构化 | TaskDetailDialog.vue | 2h |
| 12 | 扫码登录步骤指示器 | BindAccountDialog.vue | 1h |
| 13 | MainLayout min-width 保护 | MainLayout.vue | 15min |

---

## 总结

新设计系统（星枢智联）的 token 层面已经完备——色彩、间距、圆角、阴影、过渡、平台色、Element Plus 覆盖全部定义在 variables.css 的 123 行中。**核心瓶颈不是设计定义，而是迁移执行**。

当前 28 个 Vue 文件中的 123 处硬编码色和 51 处硬编码字体，使得新设计系统处于"定义了但没用上"的状态。P0 任务的迁移完成度，直接决定设计系统是否生效。
