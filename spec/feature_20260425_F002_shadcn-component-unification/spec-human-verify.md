# shadcn-component-unification 人工验收清单

**生成时间:** 2026-04-25
**关联计划:** spec/feature_20260425_F002_shadcn-component-unification/spec-plan.md
**关联设计:** spec/feature_20260425_F002_shadcn-component-unification/spec-design.md

---

## 验收前准备

### 环境要求
- [ ] [AUTO] 检查 Node.js 版本: `node -v`
- [ ] [AUTO] 安装依赖: `cd /Users/konghayao/code/pazhou/remote-control-server && npm install`
- [ ] [AUTO/SERVICE] 启动开发服务器: `cd /Users/konghayao/code/pazhou/remote-control-server/web && npm run dev` (port: 5173)

---

## 验收项目

### 场景 1：基础组件同步与主题保护

#### - [x] 1.1 标准 shadcn 组件文件完整
- **来源:** spec-plan.md 验收标准 §1 / spec-design.md §3.1
- **目的:** 确认 18 个组件文件已同步
- **操作步骤:**
  1. [A] `ls web/components/ui/{button,card,collapsible,command,dialog,dropdown-menu,hover-card,input,label,popover,resizable,scroll-area,select,separator,switch,tabs,textarea,tooltip}.tsx 2>&1 | grep -c '.tsx'` → 期望精确: 18

#### - [x] 1.2 自定义组件未受影响
- **来源:** spec-plan.md 验收标准 §2 / spec-design.md §3.1
- **目的:** 确认 4 个自定义组件无变更
- **操作步骤:**
  1. [A] `git diff --name-only -- web/components/ui/connection-status.tsx web/components/ui/theme-toggle.tsx web/components/ui/button-group.tsx web/components/ui/input-group.tsx` → 期望精确: (空输出)

#### - [x] 1.3 品牌主题变量保留
- **来源:** spec-plan.md §3.1 主题保护措施 / spec-design.md §3.1
- **目的:** 确认品牌色和核心变量未被覆盖
- **操作步骤:**
  1. [A] `grep -c 'color-primary.*409EFF\|color-background.*#fff\|color-sidebar' web/src/index.css` → 期望包含: (匹配数 >= 3)

---

### 场景 2：DataTable 迁移

#### - [x] 2.1 TanStack Table 依赖已安装
- **来源:** spec-plan.md §3.2 / spec-design.md §3.2
- **目的:** 确认依赖存在
- **操作步骤:**
  1. [A] `grep '"@tanstack/react-table"' package.json` → 期望包含: @tanstack/react-table

#### - [x] 2.2 DataTable 使用 TanStack Table 重写
- **来源:** spec-plan.md §3.2 / spec-design.md §3.2
- **目的:** 确认 useReactTable hook 已采用
- **操作步骤:**
  1. [A] `grep 'useReactTable' web/components/config/DataTable.tsx` → 期望包含: useReactTable

#### - [x] 2.3 Column/DataTableProps 接口兼容
- **来源:** spec-plan.md §3.2 接口兼容性保证 / spec-design.md §3.2
- **目的:** 确认接口签名未变更
- **操作步骤:**
  1. [A] `grep -c 'export interface Column\|export interface DataTableProps' web/components/config/DataTable.tsx` → 期望精确: 2

#### - [x] 2.4 表格交互功能完整
- **来源:** spec-plan.md 验收标准 §3 / spec-design.md §3.2
- **目的:** 确认排序/过滤/分页/行选择/行展开正常
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173` → 导航至 Settings 配置页面，验证表格支持排序（点击列头）、搜索过滤、分页翻页、行选择复选框、行展开详情 → 是/否

---

### 场景 3：表单标准化

#### - [x] 3.1 表单依赖已安装
- **来源:** spec-plan.md §3.3 / spec-design.md §3.3
- **目的:** 确认 react-hook-form + zod 依赖就绪
- **操作步骤:**
  1. [A] `grep '"react-hook-form"\|"zod"\|"@hookform/resolvers"' package.json | wc -l` → 期望精确: 3

#### - [x] 3.2 shadcn Form 组件已拉取
- **来源:** spec-plan.md §3.3 / spec-design.md §3.3
- **目的:** 确认 Form 基础组件可用
- **操作步骤:**
  1. [A] `ls web/components/ui/form.tsx 2>&1` → 期望包含: form.tsx

#### - [x] 3.3 FormDialog 迁移完成
- **来源:** spec-plan.md §3.3 P0 / spec-design.md §3.3
- **目的:** 确认 FormDialog 已采用 react-hook-form
- **操作步骤:**
  1. [A] `grep -c 'useForm\|zod' web/components/config/FormDialog.tsx` → 期望包含: (匹配数 >= 1)

#### - [x] 3.4 至少 2 个业务表单已迁移
- **来源:** spec-plan.md 验收标准 §4 / spec-design.md §3.3
- **目的:** 确认 NewSessionDialog + TokenManagerDialog 迁移
- **操作步骤:**
  1. [A] `grep -rl 'useForm\|zod\.object' web/src/components/NewSessionDialog.tsx web/src/components/TokenManagerDialog.tsx 2>/dev/null | wc -l` → 期望包含: (匹配数 >= 2)

---

### 场景 4：业务组件原子化替换

#### - [x] 4.1 原生 checkbox 已替换为 shadcn Checkbox
- **来源:** spec-plan.md §3.4 / spec-design.md §3.4
- **目的:** 确认原始 HTML checkbox 已清除
- **操作步骤:**
  1. [A] `grep -r '<input type="checkbox"' web/components/ web/src/components/ --include='*.tsx' -l || echo "NO_MATCH"` → 期望精确: NO_MATCH

#### - [x] 4.2 手写 scrollable div 已替换为 ScrollArea
- **来源:** spec-plan.md §3.4 常见替换模式 / spec-design.md §3.4
- **目的:** 确认关键 scrollable div 已迁移
- **操作步骤:**
  1. [A] `grep -r 'overflow-y-auto\|overflow-auto' web/components/ web/src/components/ --include='*.tsx' -l | wc -l` → 期望包含: (数量较迁移前显著减少)

---

### 场景 5：新增 shadcn 组件文件验证

#### - [x] 5.1 新增组件文件完整
- **来源:** spec-plan.md 验收标准 §6 / spec-design.md §3.5
- **目的:** 确认 Accordion/Calendar/DatePicker/Table/Checkbox/Form/Skeleton/AlertDialog 已拉取
- **操作步骤:**
  1. [A] `ls web/components/ui/{accordion,calendar,date-picker,checkbox,form,skeleton,alert-dialog,table}.tsx 2>&1 | grep -c '.tsx'` → 期望精确: 8

---

### 场景 6：构建与类型安全

#### - [x] 6.1 TypeScript 编译无错误
- **来源:** spec-plan.md 验收标准 §8 / spec-design.md 实现要点
- **目的:** 确认无类型错误
- **操作步骤:**
  1. [A] `cd web && npx tsc --noEmit 2>&1 | tail -5` → 期望包含: (无 error 输出)

#### - [x] 6.2 Vite 构建成功
- **来源:** spec-plan.md 验收标准 §8 / spec-design.md 实现要点
- **目的:** 确认生产构建通过
- **操作步骤:**
  1. [A] `cd web && npm run build 2>&1 | tail -10` → 期望包含: built in

---

### 场景 7：视觉回归验证

#### - [x] 7.1 亮色模式页面正常
- **来源:** spec-plan.md 验收标准 §7 / spec-design.md §3.6 阶段 5
- **目的:** 确认亮色模式无样式异常
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173`，切换至亮色模式，检查 Settings 页面、Chat 页面、ACP 页面布局和组件样式是否正常 → 是/否

#### - [x] 7.2 暗色模式页面正常
- **来源:** spec-plan.md 验收标准 §7 / spec-design.md §3.6 阶段 5
- **目的:** 确认暗色模式无样式异常
- **操作步骤:**
  1. [H] 打开 `http://localhost:5173`，切换至暗色模式，检查所有页面组件（Dialog、Table、Form、Tabs 等）颜色和对比度是否正常 → 是/否

---

## 验收后清理

- [ ] [AUTO] 终止后台开发服务器: `kill $(lsof -ti:5173) 2>/dev/null; echo "已清理"` (对应准备阶段启动的 dev server)

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | 标准 shadcn 组件文件完整 | 1 | 0 | ✅ |
| 场景 1 | 1.2 | 自定义组件未受影响 | 1 | 0 | ✅ |
| 场景 1 | 1.3 | 品牌主题变量保留 | 1 | 0 | ✅ |
| 场景 2 | 2.1 | TanStack Table 依赖已安装 | 1 | 0 | ✅ |
| 场景 2 | 2.2 | DataTable 使用 TanStack Table | 1 | 0 | ✅ |
| 场景 2 | 2.3 | Column/DataTableProps 接口兼容 | 1 | 0 | ✅ |
| 场景 2 | 2.4 | 表格交互功能完整 | 0 | 1 | ✅ |
| 场景 3 | 3.1 | 表单依赖已安装 | 1 | 0 | ✅ |
| 场景 3 | 3.2 | shadcn Form 组件已拉取 | 1 | 0 | ✅ |
| 场景 3 | 3.3 | FormDialog 迁移完成 | 1 | 0 | ✅ |
| 场景 3 | 3.4 | 至少 2 个业务表单已迁移 | 1 | 0 | ✅ |
| 场景 4 | 4.1 | 原生 checkbox 已替换 | 1 | 0 | ✅ |
| 场景 4 | 4.2 | 手写 scrollable div 已替换 | 1 | 0 | ✅ |
| 场景 5 | 5.1 | 新增组件文件完整 | 1 | 0 | ✅ |
| 场景 6 | 6.1 | TypeScript 编译无错误 | 1 | 0 | ✅ |
| 场景 6 | 6.2 | Vite 构建成功 | 1 | 0 | ✅ |
| 场景 7 | 7.1 | 亮色模式页面正常 | 0 | 1 | ✅ |
| 场景 7 | 7.2 | 暗色模式页面正常 | 0 | 1 | ✅ |

**验收结论:** ✅ 全部通过 / ⬜ 存在问题
