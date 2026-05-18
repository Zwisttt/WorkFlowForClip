# MatrixFlow Design System — 星枢智联

> **主题**：浅调轻奢专业风
> **定位**：明亮通透、轻奢高级，弱化硬核科技感，强化 AI 赋能 + 矩阵协同管理
> **关键词**：通透、轻奢、秩序、理性、干净、轻量化科技、几何矩阵、极简留白
> **适用**：浅色模式为主，跨平台桌面应用

---

## 设计原则

1. **效率优先** — 用户每天重复操作。每少一次点击都是价值。批量优于单条，快捷键优于鼠标。
2. **状态可感知** — 发布流程涉及多个异步任务。用户随时知道"正在做什么、做到哪了"，不需要主动刷新。
3. **信任感** — 运营工具处理的是用户的账号和数据。每个操作都让用户感到可控：明确的预览、可逆的操作、清晰的失败原因。
4. **减法默认** — Electron 桌面空间有限。不是用户做决策所需的信息，就砍掉。
5. **AI 作为助手** — AI 建议用 subtle 方式呈现（标签、徽章、建议横幅），不抢视觉焦点。用户始终是决策者。

---

## 色彩体系

### 主色 — 铂蓝

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-primary` | `#2563EB` | 主操作按钮、选中状态、链接、活跃指示器 |
| `--color-primary-light` | `#3B82F6` | hover 状态 |
| `--color-primary-lighter` | `#DBEAFE` | 背景高亮、选中行 |
| `--color-primary-dark` | `#1D4ED8` | pressed 状态、强调文字 |

### 辅助色 — 云青 / 雾银

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-accent` | `#0EA5E9` | AI 模块、智能推荐 |
| `--color-accent-light` | `#E0F2FE` | AI 背景色 |
| `--color-silver` | `#94A3B8` | 次要图标、装饰 |

### 语义色

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-success` | `#10B981` | 成功、在线、Cookie 有效 |
| `--color-success-light` | `#D1FAE5` | 成功背景 |
| `--color-warning` | `#F59E0B` | 警告、即将过期、待处理 |
| `--color-warning-light` | `#FEF3C7` | 警告背景 |
| `--color-danger` | `#EF4444` | 错误、失败、失效、删除 |
| `--color-danger-light` | `#FEE2E2` | 错误背景 |
| `--color-info` | `#94A3B8` | 提示、已跳过 |

### 中性色

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-bg-page` | `#F8FAFC` | 页面背景（比旧版更白，更通透） |
| `--color-bg-card` | `#FFFFFF` | 卡片/面板背景 |
| `--color-bg-sidebar` | `#0F172A` | 侧边栏（深色调保持层次） |
| `--color-bg-sidebar-hover` | `rgba(37, 99, 235, 0.08)` | 侧边栏 hover |
| `--color-bg-sidebar-active` | `rgba(37, 99, 235, 0.15)` | 侧边栏选中 |
| `--color-bg-header` | `#FFFFFF` | 头部背景 |
| `--color-bg-elevated` | `#FFFFFF` | 弹窗/浮层 |

### 文字色

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-text-primary` | `#0F172A` | 标题 |
| `--color-text-regular` | `#334155` | 正文 |
| `--color-text-secondary` | `#64748B` | 辅助信息 |
| `--color-text-placeholder` | `#CBD5E1` | 占位符 |
| `--color-text-sidebar` | `#94A3B8` | 侧边栏 |
| `--color-text-sidebar-active` | `#FFFFFF` | 侧边栏选中 |

### 边框色

| Token | 值 | 用途 |
|-------|-----|------|
| `--color-border` | `#E2E8F0` | 常规边框 |
| `--color-border-light` | `#F1F5F9` | 轻边框 |

### 平台品牌色

| 平台 | Token | 值 |
|------|-------|-----|
| 抖音 | `--color-plat-douyin` | `#161823` |
| 小红书 | `--color-plat-xiaohongshu` | `#FE2C55` |
| 视频号 | `--color-plat-wechat` | `#07C160` |
| 快手 | `--color-plat-kuaishou` | `#FF4906` |
| B站 | `--color-plat-bilibili` | `#00A1D6` |

---

## 排版

### 字体

```css
--font-family: 'Inter', 'Alibaba PuHuiTi', -apple-system, BlinkMacSystemFont,
  'PingFang SC', 'Microsoft YaHei', sans-serif;
--font-family-mono: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
```

Inter（几何感通透）+ 阿里巴巴普惠体（商务气质）。

### 字号阶梯

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-size-3xl` | 24px | 页面主标题 |
| `--font-size-2xl` | 20px | 区域标题 |
| `--font-size-xl` | 18px | 卡片标题 |
| `--font-size-lg` | 16px | 子标题 |
| `--font-size-base` | 14px | 正文、表格、表单 |
| `--font-size-sm` | 13px | 辅助文字 |
| `--font-size-xs` | 12px | 时间戳、徽章 |
| `--font-size-2xs` | 11px | 极小标注 |
| `--font-size-3xs` | 10px | 日历格内文字 |

### 字重

| Token | 值 | 用途 |
|-------|-----|------|
| `--font-weight-normal` | 400 | 正文 |
| `--font-weight-medium` | 500 | 小标题 |
| `--font-weight-semibold` | 600 | 页面标题 |
| `--font-weight-bold` | 700 | 统计数字 |

---

## 间距系统

4px 基数网格。

| Token | 值 | 用途 |
|-------|-----|------|
| `--space-1` | 4px | 图标与文字 |
| `--space-2` | 8px | 表单项 |
| `--space-3` | 12px | 卡片内边距 |
| `--space-4` | 16px | 区域内边距 |
| `--space-5` | 20px | — |
| `--space-6` | 24px | 区域间距 |
| `--space-8` | 32px | 大区域间距 |
| `--space-10` | 40px | — |
| `--space-12` | 48px | 页面留白 |

---

## 圆角

直角微倒角，秩序 + 现代。

| Token | 值 | 用途 |
|-------|-----|------|
| `--radius-xs` | 2px | 标签 |
| `--radius-sm` | 4px | 按钮、输入框 |
| `--radius-md` | 8px | 卡片、弹窗 |
| `--radius-lg` | 12px | 大面板 |
| `--radius-xl` | 16px | 特殊容器 |
| `--radius-full` | 9999px | 头像、状态点 |

---

## 阴影

低饱和度，通透不沉重。

| Token | 值 | 用途 |
|-------|-----|------|
| `--shadow-xs` | `0 1px 2px rgba(15, 23, 42, 0.04)` | 微层次 |
| `--shadow-sm` | `0 1px 3px rgba(15, 23, 42, 0.06), 0 1px 2px rgba(15, 23, 42, 0.04)` | 卡片 |
| `--shadow-md` | `0 4px 6px rgba(15, 23, 42, 0.05), 0 2px 4px rgba(15, 23, 42, 0.04)` | hover |
| `--shadow-lg` | `0 10px 15px rgba(15, 23, 42, 0.06), 0 4px 6px rgba(15, 23, 42, 0.04)` | 弹窗 |
| `--shadow-xl` | `0 20px 25px rgba(15, 23, 42, 0.08), 0 8px 10px rgba(15, 23, 42, 0.04)` | 模态框 |
| `--shadow-focus` | `0 0 0 3px rgba(37, 99, 235, 0.2)` | 焦点环 |

---

## 布局

```
┌─────────┬──────────────────────────────────────┐
│         │  Header (56px) · #FFFFFF             │
│ Sidebar │──────────────────────────────────────│
│ (220px) │                                      │
│ · #0F172A│  Content Area · #F8FAFC             │
│ · 可折叠 │  (scroll)                            │
│         │                                      │
└─────────┴──────────────────────────────────────┘
```

| 模式 | 适用页面 |
|------|---------|
| 卡片网格 | Accounts |
| 表格 | Content, Tasks(detail) |
| 日历 | Publish |
| 向导 | Publish(create) |
| 仪表盘 | Stats |
| 分栏 | Settings, MultiPanel |

---

## 组件模式

### 状态标签

```vue
<el-tag type="success" size="small">在线</el-tag>
<el-tag type="danger" size="small">已失效</el-tag>
<el-tag type="warning" size="small">即将过期</el-tag>
<el-tag type="info" size="small">已跳过</el-tag>
```

### AI 建议组件

```vue
<!-- AI 模块使用 --color-accent (#0EA5E9) 专属色 -->
<div class="ai-suggestion-banner">
  <div class="ai-dot"><!-- 脉冲光点动效 --></div>
  <span>AI 建议：最佳发布时间 19:00-21:00</span>
  <el-button size="small" type="primary" plain>采纳</el-button>
  <el-button size="small" text>忽略</el-button>
</div>
```

### 空状态

```
[线性图标 — --color-text-placeholder 色]
[标题 — 说明当前状态]
[操作按钮 — 引导下一步]
```

### Loading / 错误

- 页面级：居中 spinner
- 按钮：内嵌 spinner + 灰化
- 操作失败：`ElMessage.error()` toast
- 网络错误：顶部红色横幅

---

## 交互模式

### 发布向导

```
Step 1: 选内容   →   Step 2: 配规则   →   Step 3: 确认发布
```

Step 3 自动检测账号健康（v0.3.0 新增）。

### 批量操作

checkbox 全选 → 操作栏（重试/跳过/删除）→ 二次确认

### 实时状态

IPC 事件推送 + fade-in 微动画

---

## 动效

| 场景 | 时长 | 方式 |
|------|------|------|
| 页面切换 | 150ms | fade |
| 弹窗开关 | 200ms | scale + fade |
| 侧边栏折叠 | 200ms | width |
| 状态变更 | 150ms | fade |
| AI 光点 | 2s loop | pulse glow |

```css
--transition-fast: 150ms ease;
--transition-base: 200ms ease;
--transition-slow: 350ms ease;
```

---

## 可访问性

- 键盘全操作（Tab / Enter / Space）
- 对比度 ≥ 4.5:1
- 图标按钮 `aria-label`
- 弹窗焦点陷阱
- ARIA live region

---

## 暗色模式

v0.4.0 考虑。

---

## Element Plus 主题映射

```css
:root {
  --el-color-primary: var(--color-primary);
  --el-color-success: var(--color-success);
  --el-color-warning: var(--color-warning);
  --el-color-danger: var(--color-danger);
  --el-color-info: var(--color-info);
  --el-border-radius-base: var(--radius-sm);
  --el-font-family: var(--font-family);
}
```

---

## 迁移清单

| 文件 | 硬编码 | 迁移到 |
|------|--------|--------|
| `PlatformComparison.vue` | `#409eff` 等 | CSS 变量 |
| `TrendChart.vue` | `#409eff` 等 | CSS 变量 |
| `PublishCalendar.vue` | 平台品牌色 | `--color-plat-*` |
| `TaskItem.vue` | `#409eff` | `var(--color-primary)` |
| `AIRuleOptimizationBanner.vue` | `#7c3aed` 系列 | `--color-accent` 系列 |
| `LicenseSettings.vue` | `#67C23A` 等 | 语义色变量 |
| 多处 `color: #fff` | 白色文字 | `var(--color-bg-card)` |
| 多处 `font-size: 10px/11px` | 不在阶梯内 | `--font-size-3xs` / `--font-size-2xs` |
