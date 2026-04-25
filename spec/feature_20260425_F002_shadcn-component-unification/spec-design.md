# Feature: 20260425_F002 - shadcn-component-unification

## 需求背景

项目前端基于 React 19 + Tailwind CSS v4 + shadcn/ui (new-york 风格) 构建，当前存在以下问题：

- **基础组件版本滞后**：`/web/components/ui/` 下 23 个基础组件是从 shadcn 较早版本拉取后手动修改的，与 shadcn 最新版存在结构和 API 差异，上游 bug 修复和新特性无法直接获取。
- **手写 UI 重复造轮子**：业务组件（config/chat/ai-elements）中存在大量原始 div/span/CSS 实现，这些完全可以用已有的 shadcn 基础组件替代（如 Checkbox、ScrollArea、Collapsible 等）。
- **DataTable 自研实现脆弱**：当前 DataTable 手写了排序、过滤、分页、行选择、行展开全部逻辑，代码 243 行且缺少虚拟滚动等性能优化，维护成本持续上升。
- **表单处理不统一**：FormDialog、TokenManagerDialog、NewSessionDialog 等表单均使用手写受控组件，验证逻辑分散且重复。
- **即将新增功能需要更多组件**：近期计划引入 Accordion、Calendar/DatePicker、看板等功能，需要从 shadcn 新增拉取。

## 目标

1. 将现有 23 个基础 UI 组件同步到 shadcn 最新版（手动合并，保留自定义主题）
2. 将自研 DataTable 迁移到 TanStack Table + shadcn Table 组件
3. 引入 react-hook-form + zod 统一表单方案
4. 审查业务组件，将手写的原子 UI 替换为 shadcn 基础组件
5. 从 shadcn 新增 Accordion、Calendar/DatePicker 等组件
6. 全程保持"金风AI中台"主题和暗色模式不变

## 方案设计

### 3.1 基础组件同步策略

**现有 23 个基础组件分类：**

| 分类 | 组件 | 说明 |
|------|------|------|
| 标准 shadcn（需同步） | button, card, collapsible, command, dialog, dropdown-menu, hover-card, input, label, popover, resizable, scroll-area, select, separator, switch, tabs, textarea, tooltip | 已有对应 shadcn 组件，需要 diff 对齐 |
| 完全自定义（保留） | connection-status, theme-toggle, button-group, input-group | 无 shadcn 对应物，保持自定义 |
| shadcn + 自定义扩展 | badge | 有 shadcn 版本但当前实现可能不同 |

**同步流程：**

1. 用 `npx shadcn@latest add <component>` 拉取最新版到临时目录
2. 对比 diff：组件结构、Props API、Radix 版本、className 用法
3. 手动合并到现有文件，保留自定义主题变量引用（`--color-*`、`--radius` 等）
4. 确认不破坏现有 import 路径和 Props 接口

**主题保护措施：**

- 现有 CSS 变量（`--color-primary: #409EFF`、`--color-background: #ffffff` 等）全部保持不变
- shadcn 最新版若引入新 CSS 变量，在 `src/index.css` 的 `@theme` 块中按需补充
- 暗色模式 `.dark` 下的变量覆盖同样保持不变

### 3.2 DataTable → TanStack Table 迁移

**当前问题：**
- `web/components/config/DataTable.tsx`（243 行）手写了排序（sortData）、过滤（filterData）、分页（paginateData）、行选择、行展开
- 使用原生 `<table>` + `<input type="checkbox">`，没有使用 shadcn 的 Checkbox 组件
- 无虚拟滚动，大数据量时性能堪忧

**迁移方案：**

1. 新增依赖：`@tanstack/react-table`
2. 从 shadcn 拉取 Table 基础组件（`<Table>`, `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableHead>`, `<TableCell>`）
3. 重写 `DataTable.tsx`，用 TanStack Table 的 `useReactTable` hook 替代手写状态管理
4. 保留现有 Props 接口（`Column<T>`、`DataTableProps<T>`），上层调用者无需改动
5. 将 Checkbox 替换为 shadcn Checkbox 组件
6. 分页 UI 用 shadcn Button + 自定义分页组件

**接口兼容性保证：**

```typescript
// 现有接口保持不变
export interface Column<T> { key; header; sortable?; filterable?; render? }
export interface DataTableProps<T> { columns; data; searchable?; ... }
export function DataTable<T>(props: DataTableProps<T>) { ... }
```

### 3.3 表单标准化（react-hook-form + zod）

**当前问题：**
- FormDialog 只是一个 Dialog + form 的薄封装，无验证逻辑
- 各表单（TokenManagerDialog、NewSessionDialog 等）各自手写 useState + onChange
- 验证逻辑分散在 onSubmit 中，没有统一的 schema

**迁移方案：**

1. 新增依赖：`react-hook-form`、`@hookform/resolvers`、`zod`
2. 从 shadcn 拉取 Form 组件（基于 react-hook-form 的 FormField、FormItem、FormLabel 等）
3. 为现有表单逐一创建 zod schema 并迁移到 react-hook-form
4. FormDialog 保持现有接口兼容，内部可选使用 Form 组件

**迁移优先级：**

| 表单 | 复杂度 | 优先级 |
|------|--------|--------|
| FormDialog (通用) | 低 | P0 — 先改这个作为模板 |
| NewSessionDialog | 低 | P1 |
| TokenManagerDialog | 中 | P1 |
| 其他表单 | 各异 | P2 |

### 3.4 业务组件原子化替换

**需要审查的业务组件目录：**

| 目录 | 组件数量 | 替换策略 |
|------|----------|----------|
| `/web/components/config/` | 6 个 | DataTable 迁移 + ConfirmDialog/FormDialog 用 shadcn AlertDialog/Form |
| `/web/components/chat/` | 8 个 | 替换内部原子 UI（Button → shadcn Button、Input → shadcn Input 等） |
| `/web/components/ai-elements/` | 8 个 | 保持原样，仅替换内部的 div/span 为 shadcn ScrollArea、Collapsible 等 |
| `/web/components/` | 5 个 | ACPConnect、ACPMain、ChatInterface 等审查原子 UI 使用 |
| `/web/src/components/` | 15 个 | Navbar、SessionList、PermissionTab 等审查 |

**常见替换模式：**

```
// 替换前：原生 HTML
<input type="checkbox" checked={...} onChange={...} />

// 替换后：shadcn Checkbox
<Checkbox checked={...} onCheckedChange={...} />
```

```
// 替换前：手写 scrollable div
<div className="overflow-y-auto max-h-[300px]">

// 替换后：shadcn ScrollArea
<ScrollArea className="h-[300px]">
```

```
// 替换前：手写 loading 态
{loading && <div className="animate-pulse bg-muted h-4 w-20 rounded" />}

// 替换后：可考虑 shadcn Skeleton
<Skeleton className="h-4 w-20" />
```

### 3.5 新增 shadcn 组件

| 组件 | 用途 | 备注 |
|------|------|------|
| Accordion | 配置面板折叠分组 | 替代部分 Collapsible 使用场景 |
| Calendar | 日期选择 | DatePicker 基础 |
| DatePicker | 日期范围选择 | 基于 Calendar + Popover |
| Table | 数据表格基础组件 | DataTable 迁移用 |
| Checkbox | 复选框 | DataTable 行选择、表单 |
| Form | 表单容器 | react-hook-form 集成 |
| Skeleton | 加载骨架屏 | 替换手写 loading 态 |
| AlertDialog | 确认弹窗 | 替代 ConfirmDialog |
| Sheet | 侧边抽屉 | 未来移动端适配可能需要 |
| Drawer | 底部抽屉 | 移动端交互 |

> 注意：Kanban Board（看板）shadcn 没有内置组件，需要基于 `@dnd-kit` 自行构建或使用社区方案，不在本阶段范围内。

### 3.6 执行顺序

**阶段 1：基础组件同步（P0）**

1. 运行 `npx shadcn@latest add` 拉取 18 个标准 shadcn 组件的最新版到临时目录
2. 逐个 diff 并手动合并到 `/web/components/ui/`
3. 同步拉取新增组件（Table、Checkbox、Form、Accordion、Calendar、Skeleton、AlertDialog）
4. 验证基础组件在开发服务器中渲染正常

**阶段 2：DataTable 迁移（P1）**

1. 安装 `@tanstack/react-table`
2. 用 TanStack Table + shadcn Table/Checkbox 重写 DataTable
3. 保持 `Column<T>` 和 `DataTableProps<T>` 接口不变
4. 在 Settings 配置页面验证表格功能（排序、过滤、分页、行选择、行展开）

**阶段 3：表单标准化（P1）**

1. 安装 `react-hook-form`、`@hookform/resolvers`、`zod`
2. 拉取 shadcn Form 组件
3. 改造 FormDialog 为 react-hook-form 版本
4. 逐一迁移 TokenManagerDialog、NewSessionDialog 等

**阶段 4：业务组件审查与替换（P2）**

1. 逐个目录扫描业务组件中的原始 HTML/UI 用法
2. 替换为 shadcn 基础组件
3. AI/Chat 组件只替换内部原子 UI，不改变组件结构和业务逻辑

**阶段 5：新增组件集成与最终验证**

1. 集成 Accordion、Calendar、DatePicker 等新组件
2. 全页面手动回归验证
3. 暗色模式验证

## 实现要点

1. **Tailwind v4 兼容性**：项目使用 Tailwind CSS v4 + `@tailwindcss/vite`，shadcn 最新版已适配 v4。合并时需注意 `@apply` 和 CSS 变量引用方式是否一致。
2. **主题变量保护**：`src/index.css` 中定义了完整的 `@theme` 变量体系（品牌色 `#409EFF`、深蓝色侧边栏等），合并组件时绝不能覆盖这些变量。shadcn 新增的变量（如 `--color-chart-*`）需按需补充。
3. **接口兼容**：DataTable 的 `Column<T>` 和 `DataTableProps<T>` 被多处引用（BatchActionBar、各 Settings Tab），迁移时必须保持接口签名不变。
4. **渐进式迁移**：每个阶段完成后立即验证，不跨阶段积累风险。
5. **Radix UI 版本**：shadcn 新版可能升级了 `@radix-ui/*` 依赖版本，需注意是否有 breaking changes。

## 验收标准

- [ ] 18 个标准 shadcn 基础组件已同步到最新版，保留自定义主题
- [ ] 4 个自定义组件（connection-status、theme-toggle、button-group、input-group）未受影响
- [ ] DataTable 已迁移到 TanStack Table，排序/过滤/分页/行选择/行展开功能完整
- [ ] FormDialog + 至少 2 个业务表单已迁移到 react-hook-form + zod
- [ ] 业务组件中明显的原始 HTML UI（checkbox、scrollable div 等）已替换为 shadcn 组件
- [ ] Accordion、Calendar/DatePicker、Table、Checkbox、Form、Skeleton 已从 shadcn 拉取
- [ ] 全页面在亮色和暗色模式下视觉正常
- [ ] 无 console 错误或 TypeScript 类型错误
