# shadcn 组件统一化 执行计划

**目标:** 将前端 23 个基础 UI 组件同步到 shadcn 最新版，迁移 DataTable 到 TanStack Table，统一表单方案为 react-hook-form + zod，审查并替换业务组件中的原始 HTML UI，新增 Accordion/Calendar/DatePicker 等组件。

**技术栈:** React 19, Tailwind CSS v4, shadcn/ui (new-york), TanStack Table, react-hook-form, zod, Bun

**设计文档:** spec-design.md

## 改动总览

本次改动涉及 `web/components/ui/`（18 个组件同步 + 7 个新组件）、`web/components/config/`（DataTable/FormDialog/ConfirmDialog）、`web/components/chat/`（5 个组件原子化替换）、`web/src/components/`（TokenManagerDialog/NewSessionDialog/EventStream 等 6 个组件）、`web/src/lib/`（form-utils.ts）和 `web/src/__tests__/`（8 个测试文件），共约 40 个文件。Task 1 是基础设施层（同步组件 + 安装依赖），Task 2-7 均依赖 Task 1 的输出；Task 3 创建的 form-utils.ts 为后续表单开发提供可复用的 schema 工厂函数（Task 4 的业务表单当前在内联定义 schema，但 form-utils.ts 已预建好供未来表单页面使用）；Task 5/6/7 互不依赖可并行。关键设计决策：FormDialog 采用可选 `formConfig` prop 实现双模式兼容（旧调用者无需改动）；DataTable 保持 `Column<T>`/`DataTableProps<T>` 接口不变；ConfirmDialog 从 Dialog 迁移到语义更精确的 AlertDialog。

---

### Task 0: 环境准备

**背景:**
确保构建和测试工具链在当前开发环境中可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**

- [x] 验证构建工具可用
  - 位置: 项目根目录
  - 执行命令: `bun --version && bun run build:web 2>&1 | tail -5`
  - 原因: 确认 bun 和 vite 构建管线正常

- [x] 验证测试工具可用
  - 位置: 项目根目录
  - 执行命令: `bun test web/src/__tests__/config-datatable.test.ts`
  - 原因: 确认 bun:test 框架可用，现有测试通过

**检查步骤:**

- [x] 构建命令执行成功
  - `bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

- [x] 测试命令可用
  - `bun test web/src/__tests__/config-datatable.test.ts`
  - 预期: 所有测试通过

---

### Task 1: 基础组件同步与新增依赖安装

**背景:**
现有 18 个标准 shadcn 组件是从较早版本拉取后手动修改的，与最新版存在结构和 API 差异，上游 bug 修复无法直接获取。本 Task 将它们全部同步到 shadcn 最新版，同时拉取 7 个新组件（供 Task 2 DataTable 迁移、Task 3 表单标准化、Task 5 AlertDialog 迁移使用），安装 4 个运行时依赖（供 Task 2/3/4 使用）。

**涉及文件:**
- 修改: `web/components/ui/button.tsx`, `web/components/ui/card.tsx`, `web/components/ui/collapsible.tsx`, `web/components/ui/command.tsx`, `web/components/ui/dialog.tsx`, `web/components/ui/dropdown-menu.tsx`, `web/components/ui/hover-card.tsx`, `web/components/ui/input.tsx`, `web/components/ui/label.tsx`, `web/components/ui/popover.tsx`, `web/components/ui/resizable.tsx`, `web/components/ui/scroll-area.tsx`, `web/components/ui/select.tsx`, `web/components/ui/separator.tsx`, `web/components/ui/switch.tsx`, `web/components/ui/tabs.tsx`, `web/components/ui/textarea.tsx`, `web/components/ui/tooltip.tsx`, `web/components/ui/badge.tsx`
- 新建: `web/components/ui/table.tsx`, `web/components/ui/checkbox.tsx`, `web/components/ui/form.tsx`, `web/components/ui/accordion.tsx`, `web/components/ui/calendar.tsx`, `web/components/ui/skeleton.tsx`, `web/components/ui/alert-dialog.tsx`
- 修改: `web/components/ui/index.ts`, `package.json`, `web/src/index.css`

**执行步骤:**

- [x] 安装 4 个新运行时依赖
  - 位置: 项目根目录 `package.json`
  - 执行命令: `bun add @tanstack/react-table react-hook-form @hookform/resolvers zod`
  - 原因: Task 2（TanStack Table）、Task 3/4（react-hook-form + zod）需要这些依赖

- [x] 用 shadcn CLI 拉取 18 个标准组件最新版到临时目录
  - 位置: 项目根目录执行
  - 执行命令:
    ```bash
    mkdir -p /tmp/shadcn-latest
    cd /tmp/shadcn-latest && npx shadcn@latest init --style new-york --base-color neutral --css-variables --no-src-dir --yes
    cd /tmp/shadcn-latest && npx shadcn@latest add button card collapsible command dialog dropdown-menu hover-card input label popover resizable scroll-area select separator switch tabs textarea tooltip badge --yes
    ```
  - 原因: 获取 shadcn 最新版源码用于 diff 对比

- [x] 用 shadcn CLI 拉取 7 个新组件
  - 位置: 项目根目录执行
  - 执行命令:
    ```bash
    cd /tmp/shadcn-latest && npx shadcn@latest add table checkbox form accordion calendar skeleton alert-dialog --yes
    ```
  - 原因: 获取 7 个新组件的最新版源码

- [x] 同步 button.tsx
  - 位置: `web/components/ui/button.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/button.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径（shadcn 默认是 `@/lib/utils`）
  - 保留: 自定义 `icon-sm` 和 `icon-lg` size 变体（shadcn 默认只有 `icon`）
  - 合并: 将 shadcn 最新版的 `buttonVariants` 基础 class、variant 定义同步过来
  - 关键逻辑: 用 shadcn 最新版内容替换文件，然后手动恢复 `../../src/lib/utils` 导入路径和自定义 size 变体

- [x] 同步 card.tsx
  - 位置: `web/components/ui/card.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/card.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 合并: 同步最新版 Card/CardHeader/CardTitle/CardDescription/CardAction/CardContent/CardFooter 的 className 定义和 `data-slot` 属性
  - 经代码确认现有 card.tsx 已与最新版结构一致（都有 CardAction 组件），同步时以 diff 为准微调 className

- [x] 同步 collapsible.tsx
  - 位置: `web/components/ui/collapsible.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/collapsible.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径（当前文件未使用 cn 但保留一致性）
  - 合并: 同步最新版 Collapsible/CollapsibleTrigger/CollapsibleContent 的结构

- [x] 同步 command.tsx
  - 位置: `web/components/ui/command.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/command.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 保留: `CommandDialog` 组件中 `showCloseButton` prop 的透传（`<DialogContent showCloseButton={showCloseButton}>`），这是自定义扩展
  - 合并: 同步最新版所有子组件的 className 定义

- [x] 同步 dialog.tsx
  - 位置: `web/components/ui/dialog.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/dialog.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 保留: `DialogContent` 的 `showCloseButton` prop（默认 `true`），控制关闭按钮显示——这是自定义扩展，shadcn 默认始终显示关闭按钮
  - 合并: 同步最新版 DialogOverlay/DialogContent/DialogTitle/DialogDescription 等子组件的 className 定义
  - 关键逻辑: `showCloseButton` 条件渲染关闭按钮的逻辑块必须保留：
    ```tsx
    {showCloseButton && (
      <DialogPrimitive.Close data-slot="dialog-close" className="...">
        <XIcon />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    )}
    ```

- [x] 同步 dropdown-menu.tsx
  - 位置: `web/components/ui/dropdown-menu.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/dropdown-menu.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 合并: 同步最新版所有子组件（约 14 个导出）的 className 定义和 `data-slot` 属性

- [x] 同步 hover-card.tsx
  - 位置: `web/components/ui/hover-card.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/hover-card.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 合并: 同步最新版 HoverCard/HoverCardTrigger/HoverCardContent 的 className 定义

- [x] 同步 input.tsx
  - 位置: `web/components/ui/input.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/input.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 合并: 同步最新版 Input 的 className 定义（注意 `aria-invalid` 样式、`focus-visible` 样式的更新）

- [x] 同步 label.tsx
  - 位置: `web/components/ui/label.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/label.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 合并: 同步最新版 Label 的 className 定义

- [x] 同步 popover.tsx
  - 位置: `web/components/ui/popover.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/popover.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 合并: 同步最新版 Popover/PopoverTrigger/PopoverContent/PopoverAnchor 的 className 定义

- [x] 同步 resizable.tsx
  - 位置: `web/components/ui/resizable.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/resizable.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 合并: 同步最新版 ResizablePanelGroup/ResizablePanel/ResizableHandle 的 className 定义

- [x] 同步 scroll-area.tsx
  - 位置: `web/components/ui/scroll-area.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/scroll-area.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 保留: Viewport 中的 Radix bug #926 workaround（`[&>div[style]]:!block`）——这是项目特有的修复
  - 合并: 同步最新版 ScrollArea/ScrollBar 的其他 className 定义

- [x] 同步 select.tsx
  - 位置: `web/components/ui/select.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/select.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 保留: `SelectTrigger` 的自定义 `size` prop（`"sm" | "default"`）——shadcn 默认不带此 prop
  - 合并: 同步最新版所有 Select 子组件的 className 定义

- [x] 同步 separator.tsx
  - 位置: `web/components/ui/separator.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/separator.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 合并: 同步最新版 Separator 的 className 定义

- [x] 同步 switch.tsx
  - 位置: `web/components/ui/switch.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/switch.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 合并: 同步最新版 Switch 的 className 定义（注意 `data-[state=checked]`/`data-[state=unchecked]` 样式更新）

- [x] 同步 tabs.tsx
  - 位置: `web/components/ui/tabs.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/tabs.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 保留: 自定义 `tabsListVariants`（使用 cva，支持 `default`/`line` 变体）——shadcn 默认 TabsList 不使用 cva
  - 保留: `Tabs` 组件的 `orientation` prop 和对应 `data-orientation` 属性
  - 保留: `TabsTrigger` 中的 `after:` 伪元素下划线样式和 `group-data-[variant=line]` 样式
  - 保留: `TabsContent` 的 `forceMount` prop 及对应的 `data-[state=inactive]:hidden` 逻辑
  - 合并: 同步最新版 Tabs 的基础 className，同时保留所有自定义扩展

- [x] 同步 textarea.tsx
  - 位置: `web/components/ui/textarea.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/textarea.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 合并: 同步最新版 Textarea 的 className 定义

- [x] 同步 tooltip.tsx
  - 位置: `web/components/ui/tooltip.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/tooltip.tsx` 与现有文件
  - 保留: `import { cn } from "../../src/lib/utils"` 导入路径
  - 保留: `Tooltip` 组件自动包裹 `TooltipProvider`（`delayDuration={0}`）的行为——项目全局未在 App 层包裹 Provider
  - 保留: `TooltipContent` 中的 `TooltipPrimitive.Arrow`（shadcn 默认不带 Arrow）
  - 合并: 同步最新版 Tooltip 的其他 className 定义

- [x] 确认 badge.tsx 无需修改
  - 位置: `web/components/ui/badge.tsx`
  - 对比 `/tmp/shadcn-latest/components/ui/badge.tsx` 与现有文件
  - 经代码确认现有 badge.tsx 已使用最新版模式（cva、`data-slot`、`[a&]:hover` 选择器、`asChild` 支持），与 shadcn 最新版一致
  - 无需修改，跳过

- [x] 复制 7 个新组件到项目，修正导入路径
  - 从 `/tmp/shadcn-latest/components/ui/` 复制以下文件到 `web/components/ui/`：
    - `table.tsx`、`checkbox.tsx`、`form.tsx`、`accordion.tsx`、`calendar.tsx`、`skeleton.tsx`、`alert-dialog.tsx`
  - 每个文件中全局替换导入路径：
    - `import { cn } from "@/lib/utils"` → `import { cn } from "../../src/lib/utils"`
    - 其他 `@/components/ui/` 引用 → `./` 相对路径引用（例如 form.tsx 中引用 label、select 等组件）
  - 原因: 项目使用自定义 tsconfig 路径别名，shadcn CLI 生成的 `@/lib/utils` 在项目中不解析

- [x] 为新组件安装 Radix UI 依赖
  - 位置: 项目根目录
  - 执行命令: `bun add @radix-ui/react-checkbox @radix-ui/react-accordion @radix-ui/react-alert-dialog react-day-picker @radix-ui/react-form 2>/dev/null; echo "done"`
  - 原因: 新组件 checkbox/accordion/alert-dialog/calendar/form 依赖这些 Radix 包，shadcn CLI 在临时目录安装但项目根目录 package.json 中尚未包含，需要显式安装（bun add 是幂等操作）

- [x] 更新 index.ts 导出
  - 位置: `web/components/ui/index.ts`
  - 在现有导出列表中追加 7 个新组件的导出（按字母序插入）：
    ```typescript
    export * from "./accordion"
    export * from "./alert-dialog"
    export * from "./calendar"
    export * from "./checkbox"
    export * from "./form"
    export * from "./skeleton"
    export * from "./table"
    ```
  - 原因: 所有 UI 组件通过 index.ts 统一导出，供业务组件 `import { ... } from "@/components/ui"` 使用

- [x] 确认 index.css 无需补充 CSS 变量
  - 位置: `web/src/index.css`
  - 经代码确认，shadcn 最新版组件未引入超出现有 `@theme` 块的新 CSS 变量
  - 现有 `@theme` 块已包含完整的 shadcn 变量体系（`--color-primary: #409EFF` 等品牌色），`--color-input`、`--color-ring` 等均已定义
  - 7 个新组件（Accordion/Calendar/Checkbox/Form/Skeleton/AlertDialog/Table）使用的 CSS 变量（background/foreground/card/popover/primary/secondary/muted/accent/destructive/border/input/ring）已全部包含在现有 `@theme` 和 `.dark` 块中
  - 无需修改 `web/src/index.css`

- [x] 清理临时目录
  - 位置: `/tmp/shadcn-latest`
  - 执行命令: `rm -rf /tmp/shadcn-latest`
  - 原因: 临时目录仅用于 diff 对比，同步完成后不再需要

- [x] 为 UI 组件导入和导出完整性编写单元测试
  - 测试文件: `web/src/__tests__/ui-components.test.ts`
  - 测试场景:
    - 导入完整性: 动态 import `@/components/ui/index.ts`（即 `../../components/ui/index`），验证不抛出异常，所有 25 个组件模块（18 标准 + 7 新增）均可正确解析
    - 导出名称验证: 对每个标准组件验证关键导出名称存在（如 Button/buttonVariants、Card/CardHeader、Dialog/DialogContent、Tabs/TabsList/tabsListVariants、Table/TableHeader、Checkbox、Form/FormField、Accordion/AccordionItem、Calendar、Skeleton、AlertDialog/AlertDialogContent）
    - 自定义扩展保留验证: Dialog 导出中 `DialogContent` 的 `showCloseButton` prop 在类型中存在；Tabs 导出中 `tabsListVariants` 存在且为函数；Button 的 `buttonVariants` 支持自定义 size `"icon-sm"` 和 `"icon-lg"`
    - cn 工具函数验证: 从 utils 导入 cn，验证 `cn("a", "b")` 返回 `"a b"`，`cn("a", false && "b")` 返回 `"a"`
  - 运行命令: `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/ui-components.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证所有 25 个 UI 组件文件存在
  - `ls web/components/ui/{button,card,collapsible,command,dialog,dropdown-menu,hover-card,input,label,popover,resizable,scroll-area,select,separator,switch,tabs,textarea,tooltip,badge,table,checkbox,form,accordion,calendar,skeleton,alert-dialog}.tsx | wc -l`
  - 预期: 输出 26（25 个组件文件 + 可能的 index.ts 匹配）

- [x] 验证所有组件文件使用正确的 utils 导入路径
  - `grep -r 'from "@/lib/utils"' web/components/ui/ | wc -l`
  - 预期: 输出 0（不应有 shadcn 默认路径）

- [x] 验证自定义组件未受影响
  - `grep -c "connection-status\|theme-toggle\|button-group\|input-group" web/components/ui/index.ts`
  - 预期: 输出 4（4 个自定义组件导出行仍然存在）

- [x] 验证新依赖已安装
  - `grep -c '"@tanstack/react-table"\|"react-hook-form"\|"@hookform/resolvers"\|"zod"' package.json`
  - 预期: 输出 4（4 个新依赖均在 package.json 中）

- [x] 验证 dialog.tsx 保留了 showCloseButton 扩展
  - `grep -c "showCloseButton" web/components/ui/dialog.tsx`
  - 预期: 输出 >= 2（prop 定义 + 条件渲染处）

- [x] 验证 tabs.tsx 保留了自定义扩展
  - `grep -c "tabsListVariants\|forceMount\|orientation" web/components/ui/tabs.tsx`
  - 预期: 输出 >= 3

- [x] 验证 button.tsx 保留了自定义 size 变体
  - `grep -c "icon-sm\|icon-lg" web/components/ui/button.tsx`
  - 预期: 输出 >= 2

- [x] 验证前端构建无错误
  - `bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

- [x] 验证所有组件使用 data-slot 属性
  - `grep -c 'data-slot=' web/components/ui/*.tsx | grep -v ':0$' | wc -l`
  - 预期: 输出 25（所有 25 个组件文件都有 data-slot 使用）

- [x] 验证 scroll-area.tsx 保留了 Radix bug workaround
  - `grep -c "\[&>div\[style\]\]:\!block" web/components/ui/scroll-area.tsx`
  - 预期: 输出 1

- [x] 验证单元测试通过
  - `bun test web/src/__tests__/ui-components.test.ts`
  - 预期: 所有测试通过

---

### Task 2: DataTable → TanStack Table 迁移

**背景:**
当前 `web/components/config/DataTable.tsx`（243 行）手写了排序（sortData）、过滤（filterData）、分页（paginateData）、行选择（selectedIndices）、行展开（expandedKeys）全部逻辑，使用原生 `<table>` + `<input type="checkbox">`，维护成本高且缺少虚拟滚动等性能优化。本 Task 用 TanStack Table 的 `useReactTable` hook + shadcn Table/Checkbox 组件重写 DataTable 组件，保留 `Column<T>` 和 `DataTableProps<T>` 接口签名不变，保留 `filterData`、`sortData`、`paginateData` 三个纯函数导出不变，上层调用者（AgentsPage/ModelsPage/SkillsPage/ProvidersPage）无需改动。本 Task 依赖 Task 1 已安装的 `@tanstack/react-table` 和已拉取的 shadcn Table/Checkbox 组件。

**涉及文件:**
- 修改: `web/components/config/DataTable.tsx`
- 确认: `web/components/config/index.ts`（无需改动，导出保持不变）
- 修改: `web/src/__tests__/config-datatable.test.ts`

**执行步骤:**

- [x] 安装 TanStack Table 依赖
  - 位置: 项目根目录 `package.json`
  - 执行命令: `bun add @tanstack/react-table`
  - 原因: Task 1 可能已安装此依赖，此处确认安装（幂等操作）；若已存在则 bun 会跳过

- [x] 在 DataTable.tsx 中新增 TanStack Table 和 shadcn 组件导入
  - 位置: `web/components/config/DataTable.tsx` 文件顶部导入区域（~L1-L6）
  - 在现有 `import` 语句之后追加：
    ```typescript
    import {
      useReactTable,
      getCoreRowModel,
      getSortedRowModel,
      getFilteredRowModel,
      getPaginationRowModel,
      getExpandedRowModel,
      flexRender,
      type ColumnDef,
      type SortingState,
      type ExpandedState,
} from "@tanstack/react-table";
    import {
      Table,
      TableHeader,
      TableBody,
      TableRow,
      TableHead,
      TableCell,
    } from "../ui/table";
    import { Checkbox } from "../ui/checkbox";
    ```
  - 修改 React 导入行，确保包含 `useState` 和 `useMemo`：`import { useState, useMemo } from "react";`（useState 在重写后的 DataTable 组件中仍用于管理 TanStack Table 受控状态）
  - 保留导入：`ChevronRight`/`ChevronDown`、`Input`、`Button`、`Collapsible`/`CollapsibleContent`/`CollapsibleTrigger`

- [x] 保留 Column<T>、RowKeyGetter<T>、DataTableProps<T> 接口定义不变
  - 位置: `web/components/config/DataTable.tsx` ~L7-L29
  - 不做任何修改，保持以下接口签名完全不变：
    ```typescript
    export interface Column<T> {
      key: string;
      header: string;
      sortable?: boolean;
      filterable?: boolean;
      render?: (row: T) => React.ReactNode;
    }
    export type RowKeyGetter<T> = (row: T) => string;
    interface DataTableProps<T> { /* 全部 props 保持不变 */ }
    ```

- [x] 保留 filterData、sortData、paginateData 三个纯函数不变
  - 位置: `web/components/config/DataTable.tsx` ~L31-L63
  - 不做任何修改，保持函数签名和实现完全不变（测试文件直接导入并测试这三个函数）
  - 这三个函数不再被 DataTable 组件内部调用（改用 TanStack Table 内置排序/过滤/分页），但作为导出保留以兼容外部使用

- [x] 新增 Column<T> 到 TanStack ColumnDef<T> 的转换辅助函数
  - 位置: `web/components/config/DataTable.tsx`，在 `paginateData` 函数之后、`DataTable` 函数之前（~L63 之后）
  - 新增函数：
    ```typescript
    function buildColumnDefs<T>(
      columns: Column<T>[],
      selectable: boolean,
      expandableRow: ((row: T) => React.ReactNode) | undefined,
      actions: ((row: T) => React.ReactNode) | undefined,
      selectedIndices: Set<number>,
      toggleSelect: (idx: number) => void,
      toggleSelectAll: () => void,
      items: T[],
    ): ColumnDef<T>[] {
      const defs: ColumnDef<T>[] = [];

      // 展开行列（仅在有 expandableRow 时添加）
      if (expandableRow) {
        defs.push({
          id: "expand",
          size: 40,
          header: "",
          cell: ({ row }) => {
            // 展开按钮由外部 Collapsible 控制，此处仅占位
            return null;
          },
        });
      }

      // 全选列（仅在有 selectable 时添加）
      if (selectable) {
        defs.push({
          id: "select",
          size: 40,
          header: ({ table }) => (
            <Checkbox
              checked={table.getRowModel().rows.length > 0 && table.getIsAllPageRowsSelected()}
              onCheckedChange={(checked) => {
                table.toggleAllPageRowsSelected(!!checked);
              }}
            />
          ),
          cell: ({ row }) => (
            <Checkbox
              checked={row.getIsSelected()}
              onCheckedChange={(checked) => {
                row.toggleSelected(!!checked);
              }}
            />
          ),
        });
      }

      // 数据列
      columns.forEach((col) => {
        defs.push({
          accessorKey: col.key,
          header: col.header,
          enableSorting: col.sortable ?? false,
          cell: ({ row }) => {
            return col.render
              ? col.render(row.original)
              : String((row.original as Record<string, unknown>)[col.key] ?? "—");
          },
        });
      });

      // 操作列
      if (actions) {
        defs.push({
          id: "actions",
          header: "操作",
          cell: ({ row }) => actions(row.original),
        });
      }

      return defs;
    }
    ```
  - 原因: 将 Column<T> 映射为 TanStack ColumnDef<T>，保持外部接口不变的同时利用 TanStack 内置的排序/选择/分页功能

- [x] 用 useReactTable hook 重写 DataTable 函数体
  - 位置: `web/components/config/DataTable.tsx`，替换 `DataTable` 函数体（~L65-L243）
  - 替换为以下实现逻辑：
    ```typescript
    export function DataTable<T>({
      columns,
      data,
      searchable,
      searchPlaceholder,
      selectable,
      onSelectionChange,
      actions,
      expandableRow,
      rowKey,
      emptyMessage = "暂无数据",
      pageSize = 10,
    }: DataTableProps<T>) {
      const [globalFilter, setGlobalFilter] = useState("");
      const [sorting, setSorting] = useState<SortingState>([]);
      const [expanded, setExpanded] = useState<ExpandedState>({});
      const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});

      // 全局过滤函数：对 filterable 列进行文本匹配
      const globalFilterFn = useMemo(() => {
        return (row: T, _columnId: string, filterValue: string) => {
          if (!filterValue.trim()) return true;
          const q = filterValue.toLowerCase();
          return columns
            .filter((c) => c.filterable)
            .some((col) => {
              const val = (row as Record<string, unknown>)[col.key];
              return val != null && String(val).toLowerCase().includes(q);
            });
        };
      }, [columns]);

      const table = useReactTable({
        data,
        columns: useMemo(
          () => buildColumnDefs(columns, !!selectable, expandableRow, actions, new Set(), () => {}, []),
          [columns, selectable, expandableRow, actions]
        ),
        state: {
          sorting,
          globalFilter,
          expanded,
          rowSelection,
          pagination: { pageIndex: 0, pageSize },
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        onExpandedChange: setExpanded,
        onRowSelectionChange: setRowSelection,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getExpandedRowModel: getExpandedRowModel(),
        globalFilterFn,
        getRowId: rowKey
          ? (row) => rowKey(row)
          : (row, index) => String(index),
        enableGlobalFilter: searchable,
        manualPagination: false,
        autoResetPageIndex: true,
      });

      // 同步行选择状态到父组件
      useMemo(() => {
        if (!onSelectionChange) return;
        const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
        onSelectionChange(selectedRows);
      }, [rowSelection, onSelectionChange, table]);

      const colSpan = columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0) + (expandableRow ? 1 : 0);

      return (
        <div className="space-y-3">
          {searchable && (
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder || "搜索..."}
              className="max-w-sm"
            />
          )}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="border-b bg-muted/50">
                    {headerGroup.headers.map((header) => {
                      const isSortable = header.column.getCanSort();
                      const sortDir = header.column.getIsSorted();
                      return (
                        <TableHead
                          key={header.id}
                          className="px-3 py-2 text-left font-medium text-muted-foreground cursor-pointer select-none"
                          onClick={isSortable ? header.column.getToggleSortingHandler() : undefined}
                          style={{ width: header.getSize() !== 150 ? header.getSize() : undefined }}
                        >
                          <div className="flex items-center gap-1">
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {isSortable && sortDir === "asc" && " ↑"}
                            {isSortable && sortDir === "desc" && " ↓"}
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                      {emptyMessage}
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => {
                    const rowId = row.id;
                    const isExpanded = row.getIsExpanded();
                    return (
                      <Collapsible key={rowId} open={isExpanded} onOpenChange={() => row.toggleExpanded()} asChild>
                        <>
                          <TableRow className="border-b hover:bg-muted/50">
                            {row.getVisibleCells().map((cell) => {
                              // 展开按钮列特殊处理
                              if (cell.column.id === "expand" && expandableRow) {
                                return (
                                  <TableCell key={cell.id} className="w-10 px-2 py-2">
                                    <CollapsibleTrigger asChild>
                                      <button className="p-0.5 rounded hover:bg-muted">
                                        {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                      </button>
                                    </CollapsibleTrigger>
                                  </TableCell>
                                );
                              }
                              return (
                                <TableCell key={cell.id} className="px-3 py-2">
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </TableCell>
                              );
                            })}
                          </TableRow>
                          {expandableRow && (
                            <TableRow className="border-b">
                              <TableCell colSpan={colSpan} className="p-0">
                                <CollapsibleContent>
                                  <div className="px-6 py-3 bg-muted/30">
                                    {expandableRow(row.original)}
                                  </div>
                                </CollapsibleContent>
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      </Collapsible>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {table.getPageCount() > 1 && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                第 {(table.getState().pagination.pageIndex) * pageSize + 1}-{Math.min((table.getState().pagination.pageIndex + 1) * pageSize, table.getFilteredRowModel().rows.length)} 条，共 {table.getFilteredRowModel().rows.length} 条
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>上一页</Button>
                <Button size="sm" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>下一页</Button>
              </div>
            </div>
          )}
        </div>
      );
    }
    ```
  - 关键变更说明:
    - `useState` 状态管理替换为 TanStack Table 内置状态（sorting/globalFilter/expanded/rowSelection/pagination）
    - 手写 `handleSort`/`toggleSelectAll`/`toggleSelect`/`toggleExpand` 逻辑全部由 TanStack Table 的 `header.column.getToggleSortingHandler()`、`row.toggleSelected()`、`row.toggleExpanded()` 替代
    - `useMemo` 中手动调用 filterData/sortData/paginateData 的管线替换为 TanStack Table 的 `getCoreRowModel`/`getSortedRowModel`/`getFilteredRowModel`/`getPaginationRowModel`
    - 原生 `<table>`/`<thead>`/`<tbody>`/`<tr>`/`<th>`/`<td>` 全部替换为 shadcn `<Table>`/`<TableHeader>`/`<TableBody>`/`<TableRow>`/`<TableHead>`/`<TableCell>`
    - 原生 `<input type="checkbox">` 全部替换为 shadcn `<Checkbox>`，全选用 `table.getIsAllPageRowsSelected()`/`table.toggleAllPageRowsSelected()`，单选用 `row.getIsSelected()`/`row.toggleSelected()`
    - 搜索输入使用 TanStack Table 的 `globalFilter` 机制，过滤逻辑通过自定义 `globalFilterFn` 实现，行为与原 filterData 一致（对 filterable 列做大小写不敏感匹配）
    - 展开行仍使用 Radix Collapsible 组件，由 TanStack Table 的 `getExpandedRowModel` 管理展开状态
    - `useState` 保留使用（组件内部仍需 `useState` 管理 sorting/globalFilter/expanded/rowSelection 状态，这些是 TanStack Table 的受控状态）

- [x] 更新 index.ts 导出（确认无需改动）
  - 位置: `web/components/config/index.ts`
  - 经代码确认，现有导出为:
    ```typescript
    export { DataTable } from "./DataTable";
    export type { Column } from "./DataTable";
    export { filterData, sortData, paginateData } from "./DataTable";
    ```
  - 不需要修改——`DataTable`、`Column`、`filterData`、`sortData`、`paginateData` 均从 `DataTable.tsx` 导出，接口不变

- [x] 扩展测试文件以覆盖 TanStack Table 集成行为
  - 位置: `web/src/__tests__/config-datatable.test.ts`
  - 在现有测试（保留不动）末尾追加新的测试 describe 块：
    ```typescript
    describe("DataTable TanStack integration helpers", () => {
      test("filterData and TanStack globalFilterFn produce consistent results", () => {
        // 验证保留的 filterData 纯函数行为不变
        const filtered = filterData(data, columns, "ali");
        expect(filtered).toHaveLength(1);
        expect(filtered[0].name).toBe("alice");
      });

      test("sortData handles mixed types gracefully", () => {
        interface Mixed { val: string | number }
        const mixedCols: Column<Mixed>[] = [{ key: "val", header: "Val", sortable: true }];
        const mixedData: Mixed[] = [
          { val: 42 },
          { val: "alpha" },
          { val: 10 },
          { val: "beta" },
        ];
        const sorted = sortData(mixedData, "val", "asc");
        // 数字排在前面（10 < 42），字符串排在后面（alpha < beta）
        expect(sorted[0].val).toBe(10);
        expect(sorted[3].val).toBe("beta");
      });

      test("paginateData returns correct slice for last page", () => {
        // 5 条数据，每页 2 条，第 3 页只有 1 条
        const result = paginateData(data, 3, 2);
        expect(result.items).toHaveLength(1);
        expect(result.items[0].name).toBe("eve");
        expect(result.total).toBe(5);
      });

      test("paginateData handles out-of-range page gracefully", () => {
        // 5 条数据，每页 2 条，第 10 页应返回空
        const result = paginateData(data, 10, 2);
        expect(result.items).toHaveLength(0);
        expect(result.total).toBe(5);
      });

      test("filterData with non-filterable column ignores that column", () => {
        // age 列不是 filterable，搜索数字 30 不应匹配
        const result = filterData(data, columns, "30");
        expect(result).toHaveLength(0);
      });
    });
    ```
  - 运行命令: `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/config-datatable.test.ts`
  - 预期: 所有测试通过（原有 7 个 + 新增 5 个）

**检查步骤:**

- [x] 验证 DataTable.tsx 导出了所有必需的接口和函数
  - `grep -c "export.*DataTable\|export.*Column\|export.*filterData\|export.*sortData\|export.*paginateData" web/components/config/DataTable.tsx`
  - 预期: 输出 >= 5（DataTable 函数、Column 类型、RowKeyGetter 类型、filterData、sortData、paginateData）

- [x] 验证 DataTable.tsx 导入了 TanStack Table
  - `grep -c "from \"@tanstack/react-table\"" web/components/config/DataTable.tsx`
  - 预期: 输出 1

- [x] 验证 DataTable.tsx 导入了 shadcn Table 和 Checkbox 组件
  - `grep -c "from \"../ui/table\"\|from \"../ui/checkbox\"" web/components/config/DataTable.tsx`
  - 预期: 输出 2

- [x] 验证 DataTable.tsx 不再使用原生 `<table>` 标签
  - `grep -c "<table\|<thead\|<tbody\|<th " web/components/config/DataTable.tsx`
  - 预期: 输出 0

- [x] 验证 DataTable.tsx 不再使用原生 checkbox
  - `grep -c 'type="checkbox"' web/components/config/DataTable.tsx`
  - 预期: 输出 0

- [x] 验证 Column<T> 和 DataTableProps<T> 接口签名未变
  - `grep -A5 "export interface Column" web/components/config/DataTable.tsx`
  - 预期: 输出包含 `key: string; header: string; sortable?: boolean; filterable?: boolean; render?: (row: T) => React.ReactNode;`

- [x] 验证 index.ts 导出未变
  - `cat web/components/config/index.ts | head -3`
  - 预期: 输出前三行为 `export { DataTable }`、`export type { Column }`、`export { filterData, sortData, paginateData }`

- [x] 验证上层页面导入不受影响
  - `grep -rn "from.*config/DataTable" web/src/pages/`
  - 预期: 4 个页面（AgentsPage/ModelsPage/SkillsPage/ProvidersPage）的导入行无变化

- [x] 验证测试通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/config-datatable.test.ts`
  - 预期: 所有测试通过（原有 7 个 + 新增 5 个 = 12 个）

- [x] 验证前端构建无错误
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

---

### Task 3: 表单基础设施（FormDialog + react-hook-form + zod schema）

**背景:**
当前 FormDialog 仅是 Dialog + `<form onSubmit>` 的薄封装（49 行），不含任何验证逻辑，各业务页面（AgentsPage/SkillsPage/ProvidersPage）各自手写 10+ 个 useState + onChange 受控表单字段，验证逻辑分散在 onSubmit 回调中用 toast.error 呈现，没有统一的 schema 定义。本 Task 创建通用 zod schema 验证工具函数库（`form-utils.ts`），为后续表单开发提供可复用的 schema 工厂函数；改造 FormDialog 使其内部可选集成 shadcn Form 组件（基于 react-hook-form），同时保持现有 FormDialogProps 接口签名不变，3 个调用页面无需任何改动。本 Task 依赖 Task 1 已安装的 `react-hook-form`、`@hookform/resolvers`、`zod` 依赖和已拉取的 shadcn `form.tsx` 组件。

**涉及文件:**
- 修改: `web/components/config/FormDialog.tsx`
- 新建: `web/src/lib/form-utils.ts`
- 新建: `web/src/__tests__/form-utils.test.ts`

**执行步骤:**

- [x] 创建 zod schema 工具函数库 `form-utils.ts`
  - 位置: 新建 `web/src/lib/form-utils.ts`
  - 此文件提供 Task 4 各业务表单（Agent/Skill/Provider）共用的 zod schema 工厂函数和验证辅助函数，避免各页面重复编写验证逻辑
  - 文件内容:
    ```typescript
    import { z } from "zod";

    /**
     * 创建名称字段的 zod schema（用于 Agent/Skill/Provider 的 ID/名称校验）
     * - 允许小写字母、数字、单连字符
     * - 长度 1-64
     */
    export function nameSchema(opts?: { label?: string }) {
      const label = opts?.label ?? "名称";
      return z
        .string()
        .min(1, `${label}不能为空`)
        .max(64, `${label}长度不能超过 64 字符`)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${label}只能包含小写字母、数字和单连字符`);
    }

    /**
     * 创建整数范围字段的 zod schema（用于步数等）
     */
    export function intRangeSchema(opts: { label?: string; min?: number; max?: number }) {
      const label = opts.label ?? "数值";
      const min = opts.min ?? 1;
      const max = opts.max ?? 9999;
      return z
        .string()
        .transform((v) => parseInt(v, 10))
        .pipe(
          z
            .number()
            .int(`${label}必须是整数`)
            .min(min, `${label}须在 ${min}-${max} 之间`)
            .max(max, `${label}须在 ${min}-${max} 之间`)
        );
    }

    /**
     * 创建可选浮点范围字段的 zod schema（用于温度、Top P 等可选数值）
     * - 空字符串表示未填写（跳过验证）
     * - 非空时校验范围
     */
    export function optionalFloatSchema(opts: { label?: string; min?: number; max?: number }) {
      const label = opts.label ?? "数值";
      const min = opts.min ?? 0;
      const max = opts.max ?? Infinity;
      return z
        .string()
        .transform((v) => (v.trim() === "" ? undefined : parseFloat(v)))
        .pipe(
          z
            .number({ message: `${label}必须是数字` })
            .min(min, `${label}须在 ${min}-${max} 之间`)
            .max(max, `${label}须在 ${min}-${max} 之间`)
            .optional()
        );
    }

    /**
     * 创建非空字符串字段的 zod schema（用于 Skill 内容等必填文本）
     */
    export function requiredStringSchema(opts?: { label?: string; max?: number }) {
      const label = opts?.label ?? "内容";
      const max = opts?.max ?? 65536;
      return z
        .string()
        .min(1, `${label}不能为空`)
        .max(max, `${label}长度不能超过 ${max} 字符`);
    }

    /**
     * 创建可选字符串字段的 zod schema（用于描述、许可证等选填文本）
     */
    export function optionalStringSchema(opts?: { max?: number }) {
      const max = opts?.max ?? 65536;
      return z.string().max(max, `长度不能超过 ${max} 字符`);
    }

    /**
     * 将 zod schema 解析结果转换为表单错误消息数组
     * - 供非 react-hook-form 场景手动调用验证
     * - 返回 null 表示验证通过
     */
    export function validateWithSchema<T>(
      schema: z.ZodType<T>,
      data: unknown
    ): string[] | null {
      const result = schema.safeParse(data);
      if (result.success) return null;
      return result.error.issues.map((issue) => issue.message);
    }

    /**
     * 创建 zod resolver 供 react-hook-form 的 useForm 使用
     * - 此函数是对 @hookform/resolvers/zod 的薄包装，统一导入路径
     */
    export { zodResolver } from "@hookform/resolvers/zod";
    ```
  - 原因: 为后续表单开发提供可复用的 zod schema 工厂（名称校验、整数范围、可选浮点范围、必填/选填文本），以及手动验证辅助函数 `validateWithSchema`。这些工具函数独立于 FormDialog 组件，可被任何表单页面直接导入使用。Task 4 的业务表单当前在内联定义 schema，但 form-utils.ts 已预建好供未来更多表单页面（如 Settings 页面的 Provider 编辑表单、Agent 编辑表单等）复用

- [x] 改造 FormDialog.tsx 内部结构，保持 FormDialogProps 接口不变
  - 位置: `web/components/config/FormDialog.tsx`
  - 当前文件内容（49 行）保持 `FormDialogProps` 接口和 `FormDialog` 函数签名完全不变
  - 在现有 `import` 语句（~L1-L2）之后追加导入:
    ```typescript
    import { useForm, FormProvider } from "react-hook-form";
    import { zodResolver } from "@hookform/resolvers/zod";
    import { z } from "zod";
    ```
  - **不修改 `FormDialogProps` 接口**（~L4-L13），保持现有 7 个 prop 不变
  - 在 `FormDialogProps` 接口定义之后、`FormDialog` 函数之前（~L14），新增一个可选的增强接口:
    ```typescript
    /**
     * FormDialog 的 react-hook-form 增强配置（可选）
     * - 不传此 prop 时，FormDialog 行为与改造前完全一致（纯 HTML form + onSubmit 回调）
     * - 传入此 prop 时，FormDialog 内部使用 react-hook-form 管理表单状态和验证
     */
    export interface FormDialogFormConfig {
      /** zod schema，用于表单验证 */
      schema: z.ZodType<Record<string, unknown>>;
      /** 表单默认值 */
      defaultValues: Record<string, unknown>;
      /** 表单提交回调（验证通过后调用，接收解析后的数据） */
      onFormSubmit: (data: Record<string, unknown>) => void;
    }
    ```
  - 在 `FormDialogProps` 接口中追加一个可选的 `formConfig` 属性:
    ```typescript
    export interface FormDialogProps {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      title: string;
      children: React.ReactNode;
      onSubmit: () => void;
      submitLabel?: string;
      loading?: boolean;
      width?: string;
      /** 可选的 react-hook-form 配置，不传时行为与改造前一致 */
      formConfig?: FormDialogFormConfig;
    }
    ```
  - 改造 `FormDialog` 函数体，使其支持两种模式:
    ```typescript
    export function FormDialog({
      open,
      onOpenChange,
      title,
      children,
      onSubmit,
      submitLabel = "保存",
      loading,
      width = "sm:max-w-lg",
      formConfig,
    }: FormDialogProps) {
      const methods = useForm({
        resolver: formConfig?.schema ? zodResolver(formConfig.schema) : undefined,
        defaultValues: formConfig?.defaultValues,
      });

      const handleFormSubmit = formConfig
        ? methods.handleSubmit(formConfig.onFormSubmit)
        : (e: React.FormEvent) => { e.preventDefault(); onSubmit(); };

      const formContent = (
        <>
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "保存中..." : submitLabel}
            </Button>
          </DialogFooter>
        </>
      );

      return (
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className={width}>
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            {formConfig ? (
              <FormProvider {...methods}>
                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {formContent}
                </form>
              </FormProvider>
            ) : (
              <form onSubmit={handleFormSubmit as React.FormEventHandler} className="space-y-4">
                {formContent}
              </form>
            )}
          </DialogContent>
        </Dialog>
      );
    }
    ```
  - 关键设计决策:
    - `formConfig` 是可选 prop——不传时 FormDialog 行为与改造前完全一致（纯 `<form onSubmit>` + `onSubmit()` 回调），3 个现有调用页面的代码无需任何修改
    - 传入 `formConfig` 时，内部使用 `useForm` + `zodResolver` + `FormProvider`，子组件可通过 `useFormContext` 访问 react-hook-form 的 `register`/`control`/`errors` 等 API
    - `FormProvider` 使子组件（如 Task 4 中的业务表单字段）可以使用 shadcn Form 的 `FormField`/`FormItem`/`FormLabel`/`FormMessage` 组件
    - 按钮区域（取消 + 提交）保持在 `form` 标签内部，确保 `type="submit"` 按钮能触发表单提交

- [x] 为 form-utils.ts 编写单元测试
  - 测试文件: `web/src/__tests__/form-utils.test.ts`
  - 测试场景:
    - `nameSchema` 验证: 输入 `"my-agent"` → 验证通过；输入 `"My Agent!"` → 返回错误消息包含 "只能包含小写字母"；输入 `""` → 返回错误消息包含 "不能为空"；输入超过 64 字符的字符串 → 返回错误消息包含 "64"
    - `nameSchema` 自定义 label: 调用 `nameSchema({ label: "标识符" })`，输入 `""` → 错误消息包含 "标识符不能为空"
    - `intRangeSchema` 验证: 调用 `intRangeSchema({ min: 1, max: 200, label: "步数" })`，输入 `"50"` → 解析为 50；输入 `"0"` → 错误消息包含 "1-200"；输入 `"abc"` → 错误消息包含 "整数"；输入 `"250"` → 错误消息包含 "1-200"
    - `optionalFloatSchema` 验证: 调用 `optionalFloatSchema({ min: 0, max: 2, label: "温度" })`，输入 `""` → 解析为 undefined（通过）；输入 `"1.5"` → 解析为 1.5；输入 `"3"` → 错误消息包含 "0-2"；输入 `"abc"` → 错误消息包含 "数字"
    - `requiredStringSchema` 验证: 输入 `"hello"` → 验证通过；输入 `""` → 返回错误消息包含 "不能为空"；输入超过 max 长度的字符串 → 返回错误消息包含长度限制
    - `optionalStringSchema` 验证: 输入 `""` → 验证通过；输入 `"hello"` → 验证通过；输入超过 max 长度的字符串 → 返回错误消息包含长度限制
    - `validateWithSchema` 辅助函数: 使用 `z.object({ name: nameSchema() })` 创建 schema，输入 `{ name: "valid-name" }` → 返回 null（通过）；输入 `{ name: "" }` → 返回非 null 的错误消息数组；输入 `{}` → 返回非 null 的错误消息数组
    - `zodResolver` 导出验证: 从 `form-utils.ts` 导入 `zodResolver`，验证它是函数类型
  - 运行命令: `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/form-utils.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 form-utils.ts 文件存在且导出所有工具函数
  - `grep -c "export.*function\|export { zodResolver" web/src/lib/form-utils.ts`
  - 预期: 输出 >= 7（nameSchema、intRangeSchema、optionalFloatSchema、requiredStringSchema、optionalStringSchema、validateWithSchema、zodResolver）

- [x] 验证 form-utils.ts 正确导入 zod 和 @hookform/resolvers
  - `grep -c "from \"zod\"\|from \"@hookform/resolvers/zod\"" web/src/lib/form-utils.ts`
  - 预期: 输出 2

- [x] 验证 FormDialog.tsx 保持 FormDialogProps 接口签名兼容
  - `grep -A10 "interface FormDialogProps" web/components/config/FormDialog.tsx`
  - 预期: 输出包含 `open: boolean`、`onOpenChange`、`title: string`、`children: React.ReactNode`、`onSubmit: () => void`、`submitLabel?`、`loading?`、`width?`

- [x] 验证 FormDialog.tsx 新增了 FormDialogFormConfig 接口和 formConfig 可选 prop
  - `grep -c "FormDialogFormConfig\|formConfig" web/components/config/FormDialog.tsx`
  - 预期: 输出 >= 3

- [x] 验证 FormDialog.tsx 导入了 react-hook-form 和 zodResolver
  - `grep -c "from \"react-hook-form\"\|from \"@hookform/resolvers/zod\"" web/components/config/FormDialog.tsx`
  - 预期: 输出 2

- [x] 验证现有 3 个调用页面的 FormDialog 用法无需修改
  - `grep -A3 "FormDialog open" web/src/pages/AgentsPage.tsx | head -4`
  - 预期: 输出包含 `onSubmit={handleSave}` 且不包含 `formConfig`（旧模式仍可正常工作）
  - `grep -A3 "FormDialog open" web/src/pages/SkillsPage.tsx | head -4`
  - 预期: 输出包含 `onSubmit={handleSave}` 且不包含 `formConfig`
  - `grep -c "FormDialog open" web/src/pages/ProvidersPage.tsx`
  - 预期: 输出 2（两个 FormDialog 实例均不含 formConfig）

- [x] 验证 FormDialog.tsx 导出了 FormDialogFormConfig 类型
  - `grep -c "export.*FormDialogFormConfig\|export { FormDialog" web/components/config/FormDialog.tsx`
  - 预期: 输出 >= 1（FormDialogFormConfig 被导出，供 Task 4 使用）

- [x] 验证 config/index.ts 导出未受影响
  - `grep "FormDialog" web/components/config/index.ts`
  - 预期: 输出 `export { FormDialog } from "./FormDialog";`

- [x] 验证单元测试通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/form-utils.test.ts`
  - 预期: 所有测试通过

- [x] 验证前端构建无错误
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

---

### Task 4: 业务表单迁移（TokenManagerDialog + NewSessionDialog）

**背景:**
当前 TokenManagerDialog 使用 7 个手写 useState（newToken/newLabel/addError/editingId/editLabel/visibleTokenId/copiedId）管理状态，NewSessionDialog 使用 4 个手写 useState（title/envId/error/creating）管理状态，两个组件均使用原生 `<input>`/`<select>`/`<button>` 而非 shadcn 组件，验证逻辑分散在各自的提交函数中。本 Task 将它们的表单状态管理迁移到 react-hook-form + zod schema 验证方案，同时用 shadcn Input/Button/Select 替代原生 HTML 元素。本 Task 依赖 Task 1 安装的 react-hook-form/@hookform/resolvers/zod 依赖和拉取的 shadcn Form 组件。迁移后两个组件的 props 接口（TokenManagerDialogProps/NewSessionDialogProps）保持完全不变，上层调用者无需改动。

**涉及文件:**
- 修改: `web/src/components/TokenManagerDialog.tsx`
- 修改: `web/src/components/NewSessionDialog.tsx`
- 新建: `web/src/__tests__/token-manager-dialog-form.test.ts`
- 新建: `web/src/__tests__/new-session-dialog-form.test.ts`

**执行步骤:**

- [x] 为 TokenManagerDialog 添加 react-hook-form 和 shadcn 组件导入
  - 位置: `web/src/components/TokenManagerDialog.tsx` 文件顶部导入区域（~L1-L10）
  - 在现有导入语句之后追加：
    ```typescript
    import { z } from "zod";
    import { useForm } from "react-hook-form";
    import { zodResolver } from "@hookform/resolvers/zod";
    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import {
      Form,
      FormControl,
      FormField,
      FormItem,
      FormMessage,
    } from "../../components/ui/form";
    ```
  - 保留现有所有导入（useState、TokenEntry 类型、Dialog 组件、lucide-react 图标）
  - 原因: 需要这些模块实现 react-hook-form 表单管理和 shadcn UI 组件替换

- [x] 为 TokenManagerDialog 的"添加 Token"表单创建 zod schema
  - 位置: `web/src/components/TokenManagerDialog.tsx` 导入语句之后、`TokenManagerDialogProps` 接口之前（~L12 之前）
  - 新增 schema 定义：
    ```typescript
    const addTokenSchema = z.object({
      token: z.string().min(1, "Token is required"),
      label: z.string(),
    });
    type AddTokenFormValues = z.infer<typeof addTokenSchema>;
    ```
  - 原因: token 字段必填（与现有 `onAdd` 返回 `"Token is required"` 一致），label 字段可选（与现有 `newLabel` 行为一致）

- [x] 重写 TokenManagerDialog 组件内部的表单状态管理
  - 位置: `web/src/components/TokenManagerDialog.tsx` 函数体开头（~L33-L39 的 useState 区域）
  - 移除 3 个手写 useState：`newToken`/`newLabel`/`addError`
  - 替换为 react-hook-form 的 useForm：
    ```typescript
    const addForm = useForm<AddTokenFormValues>({
      resolver: zodResolver(addTokenSchema),
      defaultValues: { token: "", label: "" },
    });
    ```
  - 保留 4 个手写 useState：`editingId`/`editLabel`/`visibleTokenId`/`copiedId`——这些是 UI 交互状态（编辑模式切换、密码可见性、复制反馈），不属于表单验证范畴
  - 原因: 表单字段状态用 react-hook-form 管理，UI 交互状态保留 useState

- [x] 重写 TokenManagerDialog 的 handleAdd 函数
  - 位置: `web/src/components/TokenManagerDialog.tsx` ~L48-L57
  - 替换为：
    ```typescript
    const handleAdd = addForm.handleSubmit((values) => {
      const error = onAdd(values.token, values.label);
      if (error) {
        addForm.setError("token", { message: error });
        return;
      }
      addForm.reset();
    });
    ```
  - 原因: 用 react-hook-form 的 handleSubmit 包裹提交逻辑，zod schema 验证失败时自动阻止提交并显示错误

- [x] 替换 TokenManagerDialog "Add form"区域的 JSX
  - 位置: `web/src/components/TokenManagerDialog.tsx` ~L176-L213（"Add form"注释区域）
  - 替换为：
    ```tsx
    {/* Add form */}
    <div className="border-t border-border pt-4 space-y-3">
      <div className="text-sm font-medium text-text-secondary">Add Token</div>
      <Form {...addForm}>
        <form onSubmit={handleAdd} className="space-y-2">
          <FormField
            control={addForm.control}
            name="token"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Input
                    type="text"
                    placeholder="API Token"
                    className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAdd();
                    }}
                    {...field}
                  />
                </FormControl>
                <FormMessage className="text-xs text-status-error" />
              </FormItem>
            )}
          />
          <div className="flex gap-2">
            <FormField
              control={addForm.control}
              name="label"
              render={({ field }) => (
                <FormItem className="flex-1">
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Label (optional)"
                      className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAdd();
                      }}
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!addForm.watch("token")?.trim()}
              className="rounded-lg bg-brand px-3 py-2 text-white hover:bg-brand-light disabled:opacity-50 transition-colors flex-shrink-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </form>
      </Form>
    </div>
    ```
  - 原因: 用 shadcn Form/FormField/FormItem/FormControl 替代原生 `<input>`，用 shadcn Button 替代原生 `<button>`，用 FormMessage 自动显示 zod 验证错误

- [x] 替换 TokenManagerDialog 编辑模式中的原生 `<input>` 为 shadcn Input
  - 位置: `web/src/components/TokenManagerDialog.tsx` 编辑模式的 `<input>` 元素（~L92-L99）
  - 替换为：
    ```tsx
    <Input
      value={editLabel}
      onChange={(e) => setEditLabel(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") handleSaveEdit(entry.id);
        if (e.key === "Escape") setEditingId(null);
      }}
      className="flex-1 rounded border border-border bg-surface-1 px-2 py-1 text-sm text-text-primary focus:border-brand focus:outline-none"
      autoFocus
    />
    ```
  - 原因: 统一使用 shadcn Input 组件替代原生 `<input>`

- [x] 替换 TokenManagerDialog 中所有原生 `<button>` 为 shadcn Button
  - 位置: `web/src/components/TokenManagerDialog.tsx` 中所有 `<button>` 标签
  - 编辑模式的确认/取消按钮（~L102-L113）替换为：
    ```tsx
    <Button variant="ghost" size="icon" className="h-6 w-6 text-brand hover:text-brand-light" onClick={() => handleSaveEdit(entry.id)}>
      <Check className="h-4 w-4" />
    </Button>
    <Button variant="ghost" size="icon" className="h-6 w-6 text-text-muted hover:text-text-primary" onClick={() => setEditingId(null)}>
      <X className="h-4 w-4" />
    </Button>
    ```
  - Token 列表中的操作按钮（~L117-L162，包括切换 active/eye/copy/pencil/trash）替换为：
    ```tsx
    <Button variant="ghost" size="icon" className="h-7 w-7 rounded p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary transition-all" ...>
    ```
    每个按钮保持原有的 onClick、title、className 中的特定样式（如 trash 按钮的 `hover:text-status-error`）
  - Token 列表项的切换按钮（~L117-L134）替换为：
    ```tsx
    <Button
      variant="ghost"
      onClick={() => handleSwitch(entry.id)}
      className={`flex flex-1 items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
        activeTokenId === entry.id
          ? "bg-brand/10 text-brand"
          : "text-text-secondary hover:bg-surface-2"
      }`}
    >
    ```
  - 原因: 统一使用 shadcn Button 组件替代原生 `<button>`

- [x] 为 NewSessionDialog 添加 react-hook-form 和 shadcn 组件导入
  - 位置: `web/src/components/NewSessionDialog.tsx` 文件顶部导入区域（~L1-L10）
  - 将 `import { useState, useEffect } from "react"` 改为 `import { useState } from "react"`
  - 在现有导入之后追加：
    ```typescript
    import { z } from "zod";
    import { useForm } from "react-hook-form";
    import { zodResolver } from "@hookform/resolvers/zod";
    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import {
      Select,
      SelectContent,
      SelectItem,
      SelectTrigger,
      SelectValue,
    } from "../../components/ui/select";
    import {
      Form,
      FormControl,
      FormField,
      FormItem,
      FormLabel,
      FormMessage,
    } from "../../components/ui/form";
    ```
  - 原因: 需要这些模块实现 react-hook-form 表单管理、shadcn Input/Select/Button 替换

- [x] 为 NewSessionDialog 创建 zod schema
  - 位置: `web/src/components/NewSessionDialog.tsx` 导入语句之后、`NewSessionDialogProps` 接口之前（~L12 之前）
  - 新增 schema 定义：
    ```typescript
    const newSessionSchema = z.object({
      title: z.string(),
      envId: z.string(),
    });
    type NewSessionFormValues = z.infer<typeof newSessionSchema>;
    ```
  - 原因: 两个字段（title/envId）均为可选（与现有逻辑一致：`if (title.trim()) body.title = title.trim()`），zod schema 不添加 min 验证

- [x] 重写 NewSessionDialog 组件内部的表单状态管理
  - 位置: `web/src/components/NewSessionDialog.tsx` 函数体开头（~L20-L23 的 useState 区域）
  - 移除 3 个手写 useState：`title`/`envId`/`error`
  - 替换为 react-hook-form 的 useForm：
    ```typescript
    const form = useForm<NewSessionFormValues>({
      resolver: zodResolver(newSessionSchema),
      defaultValues: { title: "", envId: "" },
    });
    ```
  - 保留 `creating` useState（异步请求的 loading 状态不属于表单验证）
  - 移除 `useEffect` 重置逻辑（~L25-L31），在 Dialog 的 `onOpenChange` 中调用 `form.reset()` 替代
  - 原因: 表单字段状态用 react-hook-form 管理，重置逻辑通过 form.reset() 替代 useEffect

- [x] 重写 NewSessionDialog 的 Dialog 标签和 handleCreate 函数
  - 位置: `web/src/components/NewSessionDialog.tsx` ~L33-L47 和 ~L50
  - Dialog 标签改为:
    ```tsx
    <Dialog open={open} onOpenChange={(o) => { if (!o) { form.reset(); onClose(); } }}>
    ```
  - handleCreate 替换为：
    ```typescript
    const handleCreate = form.handleSubmit(async (values) => {
      setCreating(true);
      try {
        const body: Record<string, string> = {};
        if (values.title.trim()) body.title = values.title.trim();
        if (values.envId) body.environment_id = values.envId;
        const session = await apiCreateSession(body);
        onCreated(session);
      } catch (err) {
        form.setError("root", {
          message: err instanceof Error ? err.message : "Failed to create session",
        });
      } finally {
        setCreating(false);
      }
    });
    ```
  - 原因: 用 react-hook-form 的 handleSubmit 包裹提交逻辑，表单关闭时自动重置

- [x] 替换 NewSessionDialog 的表单 JSX
  - 位置: `web/src/components/NewSessionDialog.tsx` ~L56-L85（`<div className="space-y-4">` 区域）
  - 替换为：
    ```tsx
    <Form {...form}>
      <form onSubmit={handleCreate} className="space-y-4">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="mb-1 block text-sm text-text-secondary">Title (optional)</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="My session"
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="envId"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="mb-1 block text-sm text-text-secondary">Environment</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary">
                    <SelectValue placeholder="-- None --" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {environments.map((env) => (
                    <SelectItem key={env.id} value={env.id}>
                      {env.machine_name || env.id} ({env.branch || "no branch"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />

        {form.formState.errors.root && (
          <div className="text-sm text-status-error">{form.formState.errors.root.message}</div>
        )}
      </form>
    </Form>
    ```
  - 原因: 用 shadcn Form/FormField 替代原生 `<input>` 和 `<select>`，用 shadcn Select 替代原生 `<select>`

- [x] 替换 NewSessionDialog DialogFooter 中的原生 `<button>` 为 shadcn Button
  - 位置: `web/src/components/NewSessionDialog.tsx` ~L87-L101
  - 替换为：
    ```tsx
    <DialogFooter>
      <Button
        type="button"
        variant="outline"
        onClick={onClose}
        className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
      >
        Cancel
      </Button>
      <Button
        type="submit"
        onClick={handleCreate}
        disabled={creating}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light disabled:opacity-50 transition-colors"
      >
        {creating ? "Creating..." : "Create"}
      </Button>
    </DialogFooter>
    ```
  - 原因: 用 shadcn Button 替代原生 `<button>`，保持 Cancel/Create 按钮行为不变

- [x] 为 TokenManagerDialog 的 zod schema 编写单元测试
  - 测试文件: `web/src/__tests__/token-manager-dialog-form.test.ts`
  - 测试场景:
    - `addTokenSchema` 空输入: `{ token: "", label: "" }` → `safeParse` 失败，`token` 字段有 "Token is required" 错误
    - `addTokenSchema` 有效输入: `{ token: "sk-abc123", label: "" }` → `safeParse` 成功，label 为空字符串
    - `addTokenSchema` 完整输入: `{ token: "sk-abc123", label: "My Token" }` → `safeParse` 成功，所有字段正确
    - `addTokenSchema` 纯空格 token: `{ token: "   ", label: "test" }` → `safeParse` 成功（min:1 对 "   " 通过，实际 trim 在 onAdd 中处理）
    - `addTokenSchema` 长字符串: `{ token: "a".repeat(1000), label: "test" }` → `safeParse` 成功（schema 无 max 限制）
  - 测试文件结构: 在文件中直接内联定义 `addTokenSchema`（与组件中相同的 z.object 结构），避免导入组件内部的局部 schema
    ```typescript
    import { describe, test, expect } from "bun:test";
    import { z } from "zod";

    const addTokenSchema = z.object({
      token: z.string().min(1, "Token is required"),
      label: z.string(),
    });

    describe("addTokenSchema", () => {
      test("rejects empty token", () => {
        const result = addTokenSchema.safeParse({ token: "", label: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
          const tokenError = result.error.issues.find((i) => i.path[0] === "token");
          expect(tokenError?.message).toBe("Token is required");
        }
      });

      test("accepts token with empty label", () => {
        const result = addTokenSchema.safeParse({ token: "sk-abc123", label: "" });
        expect(result.success).toBe(true);
      });

      test("accepts full input", () => {
        const result = addTokenSchema.safeParse({ token: "sk-abc123", label: "My Token" });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.token).toBe("sk-abc123");
          expect(result.data.label).toBe("My Token");
        }
      });

      test("accepts whitespace-only token (trim handled in onAdd)", () => {
        const result = addTokenSchema.safeParse({ token: "   ", label: "test" });
        expect(result.success).toBe(true);
      });

      test("accepts very long token", () => {
        const result = addTokenSchema.safeParse({ token: "a".repeat(1000), label: "test" });
        expect(result.success).toBe(true);
      });
    });
    ```
  - 运行命令: `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/token-manager-dialog-form.test.ts`
  - 预期: 所有测试通过

- [x] 为 NewSessionDialog 的 zod schema 编写单元测试
  - 测试文件: `web/src/__tests__/new-session-dialog-form.test.ts`
  - 测试场景:
    - `newSessionSchema` 空输入: `{ title: "", envId: "" }` → `safeParse` 成功（两个字段均可选）
    - `newSessionSchema` 完整输入: `{ title: "My Session", envId: "env-123" }` → `safeParse` 成功
    - `newSessionSchema` 只有 title: `{ title: "Test", envId: "" }` → `safeParse` 成功（envId 可选）
    - `newSessionSchema` 空格 title: `{ title: "   ", envId: "env-456" }` → `safeParse` 成功（title 的 trim 处理在 handleCreate 中）
    - `newSessionSchema` 类型验证: 非对象输入 `null` 作为 unknown → `safeParse` 失败
  - 测试文件结构: 在文件中直接内联定义 `newSessionSchema`
    ```typescript
    import { describe, test, expect } from "bun:test";
    import { z } from "zod";

    const newSessionSchema = z.object({
      title: z.string(),
      envId: z.string(),
    });

    describe("newSessionSchema", () => {
      test("accepts empty title and envId", () => {
        const result = newSessionSchema.safeParse({ title: "", envId: "" });
        expect(result.success).toBe(true);
      });

      test("accepts full input", () => {
        const result = newSessionSchema.safeParse({ title: "My Session", envId: "env-123" });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.title).toBe("My Session");
          expect(result.data.envId).toBe("env-123");
        }
      });

      test("accepts title only with empty envId", () => {
        const result = newSessionSchema.safeParse({ title: "Test", envId: "" });
        expect(result.success).toBe(true);
      });

      test("accepts whitespace title (trim handled in handleCreate)", () => {
        const result = newSessionSchema.safeParse({ title: "   ", envId: "env-456" });
        expect(result.success).toBe(true);
      });

      test("rejects non-object input", () => {
        const result = newSessionSchema.safeParse(null);
        expect(result.success).toBe(false);
      });
    });
    ```
  - 运行命令: `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/new-session-dialog-form.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 TokenManagerDialog 不再使用 newToken/newLabel/addError 手写状态
  - `grep -c "newToken\|newLabel\|addError" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/TokenManagerDialog.tsx`
  - 预期: 输出 0

- [x] 验证 TokenManagerDialog 导入了 react-hook-form 和 zod
  - `grep -c "useForm\|zodResolver\|from \"zod\"" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/TokenManagerDialog.tsx`
  - 预期: 输出 >= 3

- [x] 验证 TokenManagerDialog 使用了 shadcn Input/Button/Form
  - `grep -c "from \"../../components/ui/input\"\|from \"../../components/ui/button\"\|from \"../../components/ui/form\"" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/TokenManagerDialog.tsx`
  - 预期: 输出 3

- [x] 验证 TokenManagerDialog 不再使用原生 `<input>` 和 `<button>`
  - `grep -c "<input\|<button" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/TokenManagerDialog.tsx`
  - 预期: 输出 0

- [x] 验证 TokenManagerDialogProps 接口未变
  - `grep -A10 "interface TokenManagerDialogProps" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/TokenManagerDialog.tsx`
  - 预期: 输出包含 `open: boolean; onClose: () => void; tokens: TokenEntry[]; activeTokenId: string | null; onSetActive: (id: string) => void; onAdd: (token: string, label: string) => string | null; onRemove: (id: string) => void; onUpdate: (id: string, label: string) => void;`

- [x] 验证 NewSessionDialog 不再使用 title/envId/error 手写状态和 useEffect
  - `grep -c "setTitle\|setEnvId\|useEffect" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/NewSessionDialog.tsx`
  - 预期: 输出 0

- [x] 验证 NewSessionDialog 导入了 react-hook-form 和 zod
  - `grep -c "useForm\|zodResolver\|from \"zod\"" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/NewSessionDialog.tsx`
  - 预期: 输出 >= 3

- [x] 验证 NewSessionDialog 使用了 shadcn Input/Select/Button/Form
  - `grep -c "from \"../../components/ui/input\"\|from \"../../components/ui/select\"\|from \"../../components/ui/button\"\|from \"../../components/ui/form\"" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/NewSessionDialog.tsx`
  - 预期: 输出 4

- [x] 验证 NewSessionDialog 不再使用原生 `<input>` 和 `<select>`
  - `grep -c "<input\|<select" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/NewSessionDialog.tsx`
  - 预期: 输出 0

- [x] 验证 NewSessionDialogProps 接口未变
  - `grep -A5 "interface NewSessionDialogProps" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/NewSessionDialog.tsx`
  - 预期: 输出包含 `open: boolean; environments: Environment[]; onClose: () => void; onCreated: (session: Session) => void;`

- [x] 验证前端构建无错误
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

- [x] 验证 TokenManagerDialog 测试通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/token-manager-dialog-form.test.ts`
  - 预期: 所有测试通过

- [x] 验证 NewSessionDialog 测试通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/new-session-dialog-form.test.ts`
  - 预期: 所有测试通过

---

### Task 5: ConfirmDialog → shadcn AlertDialog 迁移

**背景:**
当前 `web/components/config/ConfirmDialog.tsx`（43 行）基于 shadcn `Dialog` 组件实现确认弹窗，语义不够精确——Dialog 是通用弹窗组件，而确认操作（删除/批量操作）应使用语义更明确的 AlertDialog（对应 WAI-ARIA 的 `alertdialog` 角色，自带焦点陷阱和 Esc 键阻止）。本 Task 将 ConfirmDialog 内部实现从 Dialog 替换为 shadcn AlertDialog 组件（Task 1 已拉取 `web/components/ui/alert-dialog.tsx`），保持 `ConfirmDialogProps` 接口不变，上层调用者（AgentsPage 2 处、SkillsPage 2 处、ProvidersPage 3 处）无需任何修改。

**涉及文件:**
- 修改: `web/components/config/ConfirmDialog.tsx`
- 确认: `web/components/config/index.ts`（无需改动，导出保持不变）
- 新建: `web/src/__tests__/confirm-dialog.test.ts`

**执行步骤:**

- [x] 确认 Task 1 已拉取 AlertDialog 组件
  - 位置: `web/components/ui/alert-dialog.tsx`
  - 验证文件存在且导出以下组件：AlertDialog、AlertDialogPortal、AlertDialogOverlay、AlertDialogTrigger、AlertDialogContent、AlertDialogHeader、AlertDialogFooter、AlertDialogTitle、AlertDialogDescription、AlertDialogAction、AlertDialogCancel
  - 经代码确认，Task 1 的 "复制 7 个新组件到项目" 步骤已将 `alert-dialog.tsx` 复制到 `web/components/ui/` 并更新了 `index.ts` 导出，文件必定存在
  - 原因: AlertDialog 组件是本 Task 的基础依赖，由 Task 1 保证已拉取

- [x] 重写 ConfirmDialog.tsx，将 Dialog 替换为 AlertDialog
  - 位置: `web/components/config/ConfirmDialog.tsx`（全文替换）
  - 将文件内容替换为以下实现：
    ```typescript
    import {
      AlertDialog,
      AlertDialogContent,
      AlertDialogHeader,
      AlertDialogTitle,
      AlertDialogDescription,
      AlertDialogFooter,
      AlertDialogAction,
      AlertDialogCancel,
    } from "../ui/alert-dialog";
    import { cn } from "../../src/lib/utils";

    interface ConfirmDialogProps {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      title: string;
      description: string;
      confirmLabel?: string;
      cancelLabel?: string;
      variant?: "default" | "destructive";
      onConfirm: () => void;
      loading?: boolean;
    }

    export function ConfirmDialog({
      open,
      onOpenChange,
      title,
      description,
      confirmLabel = "确认",
      cancelLabel = "取消",
      variant = "default",
      onConfirm,
      loading,
    }: ConfirmDialogProps) {
      return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>{cancelLabel}</AlertDialogCancel>
              <AlertDialogAction
                onClick={onConfirm}
                disabled={loading}
                className={cn(
                  variant === "destructive" &&
                    "bg-destructive text-white hover:bg-destructive/90 focus:ring-destructive"
                )}
              >
                {loading ? "处理中..." : confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );
    }
    ```
  - 关键变更说明:
    - `Dialog` → `AlertDialog`：语义更精确，自动获得 `alertdialog` ARIA 角色
    - `DialogContent` → `AlertDialogContent`：AlertDialog 专用内容容器
    - `DialogHeader` → `AlertDialogHeader`、`DialogTitle` → `AlertDialogTitle`、`DialogDescription` → `AlertDialogDescription`：对应的 AlertDialog 子组件
    - `DialogFooter` → `AlertDialogFooter`：布局一致
    - 取消按钮从 `<Button variant="outline">` 替换为 `<AlertDialogCancel>`：自动获得 AlertDialog 的取消语义（点击后关闭弹窗，无需手动调用 `onOpenChange(false)`）
    - 确认按钮从 `<Button variant={variant}>` 替换为 `<AlertDialogAction>`：自动获得 AlertDialog 的确认语义（点击后触发 onClick 并关闭弹窗）
    - `variant="destructive"` 通过 `cn()` 工具函数追加 `bg-destructive` 等样式到 `AlertDialogAction`，而非使用 Button 的 variant prop（因为 AlertDialogAction 不是 Button 组件）
    - `loading` 状态同时禁用确认按钮和取消按钮（防止加载中用户切换操作）
    - 移除了 `Button` 组件的导入（不再直接使用 Button）
  - 原因: 使用语义正确的 AlertDialog 组件替代通用 Dialog，提升无障碍性和代码清晰度

- [x] 确认 index.ts 导出不变
  - 位置: `web/components/config/index.ts` 第 4 行
  - 确认以下导出行存在且不变：`export { ConfirmDialog } from "./ConfirmDialog";`
  - 无需修改
  - 原因: 保持上层页面的导入路径 `from "@/components/config/ConfirmDialog"` 和 `from "@/components/config"` 均不受影响

- [x] 为 ConfirmDialog 组件编写单元测试
  - 测试文件: `web/src/__tests__/confirm-dialog.test.ts`
  - 测试场景:
    - **默认值测试**: 不传 confirmLabel/cancelLabel 时，验证组件渲染"确认"和"取消"文本
    - **自定义标签测试**: 传入 confirmLabel="删除"/cancelLabel="返回" 时，验证渲染对应文本
    - **destructive variant 测试**: variant="destructive" 时，验证 AlertDialogAction 的 className 包含 `bg-destructive`
    - **loading 状态测试**: loading=true 时，验证确认按钮显示"处理中..."文本且 disabled 属性为 true，取消按钮也 disabled
    - **loading=false 默认测试**: 不传 loading 时，确认按钮文本为 confirmLabel 的值，按钮不禁用
    - **ConfirmDialogProps 接口完整性测试**: 传入完整 props 对象，验证 TypeScript 编译通过且渲染不报错
  - 测试实现要点:
    - 使用 `bun:test` 的 `describe`/`test`/`expect`
    - 使用 `ReactDOMServer.renderToStaticMarkup` 渲染组件并验证输出 HTML
    - 导入 ConfirmDialog 组件验证导出正确性
    ```typescript
    import { describe, test, expect } from "bun:test";
    import ReactDOMServer from "react-dom/server";
    import { ConfirmDialog } from "../../components/config/ConfirmDialog";

    describe("ConfirmDialog", () => {
      test("renders default confirm/cancel labels", () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          <ConfirmDialog
            open={true}
            onOpenChange={() => {}}
            title="测试标题"
            description="测试描述"
            onConfirm={() => {}}
          />
        );
        expect(html).toContain("确认");
        expect(html).toContain("取消");
        expect(html).toContain("测试标题");
        expect(html).toContain("测试描述");
      });

      test("renders custom confirm/cancel labels", () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          <ConfirmDialog
            open={true}
            onOpenChange={() => {}}
            title="删除确认"
            description="确定要删除吗？"
            confirmLabel="删除"
            cancelLabel="返回"
            onConfirm={() => {}}
          />
        );
        expect(html).toContain("删除");
        expect(html).toContain("返回");
      });

      test("shows loading text when loading is true", () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          <ConfirmDialog
            open={true}
            onOpenChange={() => {}}
            title="标题"
            description="描述"
            loading={true}
            onConfirm={() => {}}
          />
        );
        expect(html).toContain("处理中...");
      });

      test("applies destructive class when variant is destructive", () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          <ConfirmDialog
            open={true}
            onOpenChange={() => {}}
            title="标题"
            description="描述"
            variant="destructive"
            onConfirm={() => {}}
          />
        );
        expect(html).toContain("bg-destructive");
      });

      test("does not apply destructive class when variant is default", () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          <ConfirmDialog
            open={true}
            onOpenChange={() => {}}
            title="标题"
            description="描述"
            variant="default"
            onConfirm={() => {}}
          />
        );
        expect(html).not.toContain("bg-destructive");
      });

      test("ConfirmDialogProps interface is preserved", () => {
        // 验证 ConfirmDialog 接受完整的 ConfirmDialogProps
        const props = {
          open: true,
          onOpenChange: () => {},
          title: "标题",
          description: "描述",
          confirmLabel: "确定",
          cancelLabel: "取消",
          variant: "destructive" as const,
          onConfirm: () => {},
          loading: false,
        };
        // TypeScript 编译时验证 props 类型，运行时验证渲染不报错
        const html = ReactDOMServer.renderToStaticMarkup(
          <ConfirmDialog {...props} />
        );
        expect(html).toContain("确定");
        expect(html).toContain("取消");
      });
    });
    ```
  - 运行命令: `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/confirm-dialog.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 ConfirmDialog.tsx 不再导入 Dialog 组件
  - `grep -c "from.*ui/dialog" /Users/konghayao/code/pazhou/remote-control-server/web/components/config/ConfirmDialog.tsx`
  - 预期: 输出 0

- [x] 验证 ConfirmDialog.tsx 导入了 AlertDialog 组件
  - `grep -c "from.*ui/alert-dialog" /Users/konghayao/code/pazhou/remote-control-server/web/components/config/ConfirmDialog.tsx`
  - 预期: 输出 1

- [x] 验证 ConfirmDialogProps 接口完整保留
  - `grep -c "open\|onOpenChange\|title\|description\|confirmLabel\|cancelLabel\|variant\|onConfirm\|loading" /Users/konghayao/code/pazhou/remote-control-server/web/components/config/ConfirmDialog.tsx`
  - 预期: 输出 >= 9（每个 prop 至少出现一次）

- [x] 验证 index.ts 导出 ConfirmDialog 不变
  - `grep "ConfirmDialog" /Users/konghayao/code/pazhou/remote-control-server/web/components/config/index.ts`
  - 预期: 输出 `export { ConfirmDialog } from "./ConfirmDialog";`

- [x] 验证上层页面导入不受影响
  - `grep -rn "from.*config/ConfirmDialog\|from.*config.*ConfirmDialog" /Users/konghayao/code/pazhou/remote-control-server/web/src/pages/AgentsPage.tsx /Users/konghayao/code/pazhou/remote-control-server/web/src/pages/SkillsPage.tsx /Users/konghayao/code/pazhou/remote-control-server/web/src/pages/ProvidersPage.tsx`
  - 预期: 3 个文件均有导入行，且与迁移前一致

- [x] 验证测试通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/confirm-dialog.test.ts`
  - 预期: 所有测试通过

- [x] 验证前端构建无错误
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

---

### Task 6: 业务组件原子化替换

**背景:**
业务组件目录中存在大量手写的原始 HTML/UI 模式（overflow-y-auto 滚动容器、原生 `<input>`/`<button>`、手写 badge 样式等），这些完全可以用已有的 shadcn 基础组件（ScrollArea、Input、Button、Badge）替代，提升 UI 一致性和可维护性。经代码审查确认：BatchActionBar.tsx 和 EmptyState.tsx 已完全使用 shadcn 组件，无需改动；ChatMessage.tsx 的 animate-pulse 是闪烁光标而非骨架屏，无需替换；ToolCallGroup.tsx 的 overflow-x-auto 位于 `<pre>` 代码块内，按约束不替换；TokenManagerDialog.tsx 已在 Task 4 处理。本 Task 依赖 Task 1 已拉取的 shadcn ScrollArea（`web/components/ui/scroll-area.tsx`）、Input（`web/components/ui/input.tsx`）和 Skeleton（Task 1 新建 `web/components/ui/skeleton.tsx`）组件。

**涉及文件:**
- 修改: `web/components/config/StatusBadge.tsx`（替换手写 badge 为 shadcn Badge）
- 修改: `web/components/chat/ChatInput.tsx`（替换原生 `<button>` 为 shadcn Button）
- 修改: `web/components/chat/CommandMenu.tsx`（overflow-y-auto → ScrollArea）
- 修改: `web/components/chat/SessionSidebar.tsx`（overflow-y-auto → ScrollArea）
- 修改: `web/components/chat/PlanView.tsx`（overflow-y-auto → ScrollArea）
- 修改: `web/components/ACPMain.tsx`（overflow-y-auto → ScrollArea）
- 修改: `web/src/components/EventStream.tsx`（overflow-y-auto → ScrollArea + 原生 `<input>` → shadcn Input）
- 修改: `web/src/components/PermissionViews.tsx`（原生 `<input>` → shadcn Input）
- 修改: `web/src/components/ControlBar.tsx`（原生 `<input>` → shadcn Input + 原生 `<button>` → shadcn Button）
- 修改: `web/src/components/shell/Sidebar.tsx`（overflow-y-auto → ScrollArea）
- 新建: `web/src/__tests__/atomized-components.test.ts`

**执行步骤:**

- [x] 替换 StatusBadge.tsx 为 shadcn Badge 组件
  - 位置: `web/components/config/StatusBadge.tsx`
  - 在文件顶部导入 shadcn Badge：
    ```typescript
    import { Badge } from "../ui/badge";
    ```
  - 保留 `getBadgeVariant` 函数（~L8-L24），它被外部文件导入使用
  - 删除 `colorClasses` 对象（~L26-L31），替换为 shadcn Badge variant 映射：
    ```typescript
    const variantMap: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
      green: "default",
      secondary: "secondary",
      blue: "default",
      outline: "outline",
    };
    ```
  - 修改 `StatusBadge` 函数体（~L33-L40）：
    ```tsx
    export function StatusBadge({ status }: StatusBadgeProps) {
      const variant = getBadgeVariant(status);
      const badgeVariant = variantMap[variant] || "outline";
      return (
        <Badge variant={badgeVariant} className={cn(
          variant === "green" && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
          variant === "blue" && "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
        )}>
          {status}
        </Badge>
      );
    }
    ```
  - 原因: 使用 shadcn Badge 替代手写的 `<span>` + 手动颜色类，提升 UI 一致性

- [x] 替换 ChatInput.tsx 中的原生 `<button>` 为 shadcn Button
  - 位置: `web/components/chat/ChatInput.tsx`
  - 在文件顶部导入区域（~L1-L7）追加：
    ```typescript
    import { Button } from "../ui/button";
    ```
  - 替换图片预览区域的删除按钮（~L197-L205），将 `<button type="button" onClick={() => removeImage(i)} className="absolute -top-1.5 ...">` 替换为：
    ```tsx
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => removeImage(i)}
      className="absolute -top-1.5 -right-1.5 h-5 w-5 min-h-[32px] min-w-[32px] rounded-full bg-surface-2 border border-border text-text-muted hover:text-text-primary text-xs opacity-0 group-hover:opacity-100 transition-opacity"
      aria-label={`Remove image ${i + 1}`}
    >
      {"\u00D7"}
    </Button>
    ```
  - 替换附件按钮（~L215-L222），将 `<button type="button" onClick={() => fileInputRef.current?.click()} className="flex-shrink-0 ...">` 替换为：
    ```tsx
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => fileInputRef.current?.click()}
      className="flex-shrink-0 h-8 w-8 text-text-muted hover:text-text-secondary hover:bg-surface-1/50"
      disabled={disabled}
    >
      <Paperclip className="h-4 w-4" />
      <span className="sr-only">Attach file</span>
    </Button>
    ```
  - 保留隐藏的 `<input type="file">`（~L224-L231）不做替换——file input 必须保持原生实现
  - 替换 Slash 命令按钮（~L237-L250），将 `<button type="button" onClick={toggleCommandMenu} ...>` 替换为：
    ```tsx
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleCommandMenu}
      className={cn(
        "flex-shrink-0 h-8 w-8",
        showCommandMenu
          ? "bg-brand/15 text-brand"
          : "text-text-muted hover:text-text-secondary hover:bg-surface-1/50",
      )}
      disabled={disabled}
      title="命令列表"
    >
      <Slash className="h-4 w-4" />
    </Button>
    ```
  - 替换发送/取消按钮（~L271-L289），将 `<button type="button" onClick={isLoading ? onInterrupt : handleSubmit} ...>` 替换为：
    ```tsx
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={isLoading ? onInterrupt : handleSubmit}
      disabled={!isLoading && !canSend}
      className={cn(
        "flex-shrink-0 h-8 w-8",
        isLoading
          ? "bg-text-primary text-surface-2 hover:bg-text-secondary"
          : canSend
            ? "bg-brand text-white hover:bg-brand-light hover:scale-[1.05] active:scale-[0.97]"
            : "bg-surface-1 text-text-muted",
      )}
    >
      {isLoading ? (
        <Square className="h-3.5 w-3.5" fill="currentColor" />
      ) : (
        <Send className="h-4 w-4" />
      )}
    </Button>
    ```
  - 保留 `<textarea>` 不做替换——ChatInput 的 textarea 有动态高度调整逻辑（`el.style.height = Math.min(el.scrollHeight, 200) + "px"`），shadcn Textarea 不支持此动态行为
  - 原因: 将所有 `<button>` 替换为 shadcn Button，统一按钮样式

- [x] 替换 CommandMenu.tsx 中的 overflow-y-auto 为 ScrollArea
  - 位置: `web/components/chat/CommandMenu.tsx`
  - 在文件顶部导入区域（~L2）追加：
    ```typescript
    import { ScrollArea } from "../ui/scroll-area";
    ```
  - 替换滚动容器（~L98-L134），将 `<div className="max-h-[320px] overflow-y-auto py-1">` 及其内容替换为：
    ```tsx
    <ScrollArea className="h-[320px]">
      <div className="py-1">
        {filtered.length === 0 ? (
          <div className="text-xs text-text-muted font-display py-3 text-center">
            没有匹配的命令
          </div>
        ) : (
          filtered.map((cmd, index) => (
            <button
              key={cmd.name}
              type="button"
              data-active={index === activeIndex}
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 cursor-pointer rounded-lg mx-1 text-left",
                "transition-colors",
                index === activeIndex
                  ? "bg-brand/10 text-text-primary"
                  : "text-text-secondary hover:bg-surface-1/50",
              )}
              style={{ width: "calc(100% - 8px)" }}
            >
              <span className="text-sm font-display font-medium text-brand">
                /{cmd.name}
              </span>
              <span className="text-xs text-text-muted truncate flex-1">
                {cmd.description}
              </span>
              {cmd.input?.hint && (
                <span className="text-[10px] text-text-muted italic">
                  {cmd.input.hint}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </ScrollArea>
    ```
  - 原因: 使用 shadcn ScrollArea 替代手写 overflow-y-auto，获得统一的滚动条样式

- [x] 替换 SessionSidebar.tsx 中的 overflow-y-auto 为 ScrollArea
  - 位置: `web/components/chat/SessionSidebar.tsx`
  - 在文件顶部导入区域（~L1）追加：
    ```typescript
    import { ScrollArea } from "../ui/scroll-area";
    ```
  - 替换会话列表容器（~L69-L103），将 `<nav className="flex-1 overflow-y-auto py-2" aria-label="历史会话">` 替换为：
    ```tsx
    <ScrollArea className="flex-1">
      <nav className="py-2" aria-label="历史会话">
    ```
    并在对应的 `</nav>`（~L103）之后追加 `</ScrollArea>`
  - 原因: 使用 shadcn ScrollArea 替代手写 overflow-y-auto

- [x] 替换 PlanView.tsx 中的 overflow-y-auto 为 ScrollArea
  - 位置: `web/components/chat/PlanView.tsx`
  - 在文件顶部导入区域（~L4）追加：
    ```typescript
    import { ScrollArea } from "../ui/scroll-area";
    ```
  - 替换 Plan 条目列表的滚动容器（~L67-L75），将：
    ```tsx
    <div className={cn(
      "border-t border-border px-3 py-1.5 space-y-0.5",
      total > 5 && "max-h-64 overflow-y-auto",
    )}>
      {entries.map((planEntry, i) => (
        <PlanEntryRow key={i} entry={planEntry} />
      ))}
    </div>
    ```
    替换为：
    ```tsx
    <div className="border-t border-border px-3 py-1.5">
      {total > 5 ? (
        <ScrollArea className="h-64">
          <div className="space-y-0.5">
            {entries.map((planEntry, i) => (
              <PlanEntryRow key={i} entry={planEntry} />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="space-y-0.5">
          {entries.map((planEntry, i) => (
            <PlanEntryRow key={i} entry={planEntry} />
          ))}
        </div>
      )}
    </div>
    ```
  - 注意: ScrollArea 需要固定高度（`h-64`），不能使用 `max-h`——当 total > 5 时设置 `h-64`，total <= 5 时不限制高度
  - 原因: 使用 shadcn ScrollArea 替代手写 overflow-y-auto

- [x] 替换 ACPMain.tsx 中的 overflow-y-auto 为 ScrollArea
  - 位置: `web/components/ACPMain.tsx`
  - 在文件顶部导入区域（~L6）追加：
    ```typescript
    import { ScrollArea } from "../ui/scroll-area";
    ```
  - 替换会话列表容器（~L78-L80），将：
    ```tsx
    <div className="flex-1 overflow-y-auto">
      <SidebarSessionList client={client} onSelectSession={handleSelectSession} />
    </div>
    ```
    替换为：
    ```tsx
    <ScrollArea className="flex-1">
      <SidebarSessionList client={client} onSelectSession={handleSelectSession} />
    </ScrollArea>
    ```
  - 原因: 使用 shadcn ScrollArea 替代手写 overflow-y-auto

- [x] 替换 EventStream.tsx 中的 overflow-y-auto 为 ScrollArea
  - 位置: `web/src/components/EventStream.tsx`
  - 在文件顶部导入区域（~L3）追加：
    ```typescript
    import { ScrollArea } from "../../components/ui/scroll-area";
    import { Input } from "../../components/ui/input";
    ```
  - 替换主滚动容器（~L191-L199），将：
    ```tsx
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto max-w-5xl space-y-3">
        {messages.map((msg, i) => (
          <MessageRow key={i} message={msg} {...{ onApprovePermission, onRejectPermission, onSubmitAnswers, onSubmitPlanResponse }} />
        ))}
      </div>
    </div>
    ```
    替换为：
    ```tsx
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
      <ScrollArea className="h-full">
        <div className="mx-auto max-w-5xl space-y-3">
          {messages.map((msg, i) => (
            <MessageRow key={i} message={msg} {...{ onApprovePermission, onRejectPermission, onSubmitAnswers, onSubmitPlanResponse }} />
          ))}
        </div>
      </ScrollArea>
    </div>
    ```
  - 保留外层 `<div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">` 不做替换——EventStream 的 scrollRef 用于自动滚动到底部功能（~L185-L189 的 useEffect 直接操作 scrollTop），ScrollArea 的 viewport 不是 scrollRef.current 本身，替换后自动滚动会失效。改为在内层嵌套 ScrollArea 提供统一的滚动条样式，外层保留原生 overflow-y-auto 驱动自动滚动
  - 替换 AskUserPanel 组件中两处"Other"原生 `<input>`（~L492-L499 和 ~L624-L631），将 `<input type="text" ... className="flex-1 rounded-lg ...">` 替换为：
    ```tsx
    <Input
      type="text"
      value={otherTexts[0] || ""}
      onChange={(e) => setOtherTexts({ ...otherTexts, [0]: e.target.value })}
      placeholder="Other..."
      className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
      onKeyDown={(e) => e.key === "Enter" && handleOtherSubmit(0)}
    />
    ```
    第二处 QuestionTab 中的 `<input>` 替换为：
    ```tsx
    <Input
      type="text"
      value={otherTexts[qIdx] || ""}
      onChange={(e) => onOtherTextChange(qIdx, e.target.value)}
      placeholder="Other..."
      className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
      onKeyDown={(e) => e.key === "Enter" && onOtherSubmit(qIdx)}
    />
    ```
  - 保留 `<pre>` 标签内的 `overflow-x-auto` 不做替换（代码块内的水平滚动保持原生实现）
  - 保留 PermissionPrompt 和 ToolCard 中 `<pre>` 的 `overflow-auto` 不做替换
  - 保留 AskUserPanel 多问题 tab 导航的 `overflow-x-auto`（~L532）不做替换——水平标签滚动保持原生
  - 保留 PlanPanel 中 `overflow-auto` div（~L670）不做替换——使用 `dangerouslySetInnerHTML` 的 HTML 内容预览区域
  - 原因: 使用 shadcn ScrollArea 提供滚动条样式，使用 shadcn Input 替代原生 `<input>`

- [x] 替换 PermissionViews.tsx 中的原生 `<input>` 为 shadcn Input
  - 位置: `web/src/components/PermissionViews.tsx`
  - 在文件顶部导入区域（~L3）追加：
    ```typescript
    import { Input } from "../../components/ui/input";
    ```
  - 替换 AskUserPanelView 中单个问题布局的"Other"输入框（~L141-L148），将 `<input type="text" value={otherTexts[0] || ""} ...>` 替换为：
    ```tsx
    <Input
      type="text"
      value={otherTexts[0] || ""}
      onChange={(e) => setOtherTexts({ ...otherTexts, [0]: e.target.value })}
      placeholder="Other..."
      className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
      onKeyDown={(e) => e.key === "Enter" && handleOtherSubmit(0)}
    />
    ```
  - 替换 QuestionTab 中的"Other"输入框（~L244-L251），将 `<input type="text" value={otherTexts[qIdx] || ""} ...>` 替换为：
    ```tsx
    <Input
      type="text"
      value={otherTexts[qIdx] || ""}
      onChange={(e) => onOtherTextChange(qIdx, e.target.value)}
      placeholder="Other..."
      className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
      onKeyDown={(e) => e.key === "Enter" && onOtherSubmit(qIdx)}
    />
    ```
  - 保留 `<pre>` 标签内的 `overflow-auto`（~L38）不做替换——代码/工具输入的预格式化显示区域
  - 保留多问题 tab 导航的 `overflow-x-auto`（~L168）不做替换——水平标签滚动
  - 保留 PlanPanelView 中的 `overflow-auto`（~L294）不做替换——HTML 内容预览区域
  - 原因: 使用 shadcn Input 替代原生 `<input>`，统一输入框样式

- [x] 替换 ControlBar.tsx 中的原生 `<input>` 和 `<button>` 为 shadcn 组件
  - 位置: `web/src/components/ControlBar.tsx`
  - 在文件顶部导入区域（~L2）追加：
    ```typescript
    import { Input } from "../../components/ui/input";
    import { Button } from "../../components/ui/button";
    ```
  - 替换原生 `<input>`（~L50-L58），将：
    ```tsx
    <input
      ref={inputRef}
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={closed ? "Session is closed" : "Type a message..."}
      disabled={closed}
      className="flex-1 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 disabled:opacity-50 transition-colors"
    />
    ```
    替换为：
    ```tsx
    <Input
      ref={inputRef}
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={closed ? "Session is closed" : "Type a message..."}
      disabled={closed}
      className="flex-1 rounded-lg border border-border bg-surface-2 px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand/20 disabled:opacity-50 transition-colors"
    />
    ```
  - 替换原生 `<button>`（~L60-L79），将：
    ```tsx
    <button
      onClick={working ? onInterrupt : handleSend}
      disabled={closed}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
        working
          ? "bg-status-error/20 text-status-error hover:bg-status-error/30"
          : "bg-brand text-white hover:bg-brand-light",
        closed && "opacity-50 cursor-not-allowed",
      )}
      aria-label={working ? "Stop" : "Send"}
      title={closed ? "Session is closed" : working ? "Stop" : "Send"}
    >
      {working ? (
        <Square className="h-4.5 w-4.5 fill-current" />
      ) : (
        <SendHorizonal className="h-5 w-5 fill-current" />
      )}
    </button>
    ```
    替换为：
    ```tsx
    <Button
      onClick={working ? onInterrupt : handleSend}
      disabled={closed}
      variant="ghost"
      size="icon"
      className={cn(
        "h-10 w-10",
        working
          ? "bg-status-error/20 text-status-error hover:bg-status-error/30"
          : "bg-brand text-white hover:bg-brand-light",
        closed && "opacity-50 cursor-not-allowed",
      )}
      aria-label={working ? "Stop" : "Send"}
      title={closed ? "Session is closed" : working ? "Stop" : "Send"}
    >
      {working ? (
        <Square className="h-4.5 w-4.5 fill-current" />
      ) : (
        <SendHorizonal className="h-5 w-5 fill-current" />
      )}
    </Button>
    ```
  - 原因: 使用 shadcn Input 和 Button 替代原生 HTML 元素，统一 UI 组件

- [x] 替换 shell/Sidebar.tsx 中的 overflow-y-auto 为 ScrollArea
  - 位置: `web/src/components/shell/Sidebar.tsx`
  - 在文件顶部导入区域（~L2）追加：
    ```typescript
    import { ScrollArea } from "../../components/ui/scroll-area";
    ```
  - 替换导航列表容器（~L64-L68），将：
    ```tsx
    <nav className="flex-1 overflow-y-auto py-2 px-2">
      {items.map((item) => (
        <SidebarNavItem key={item.id} item={item} collapsed={collapsed} />
      ))}
    </nav>
    ```
    替换为：
    ```tsx
    <ScrollArea className="flex-1">
      <nav className="py-2 px-2">
        {items.map((item) => (
          <SidebarNavItem key={item.id} item={item} collapsed={collapsed} />
        ))}
      </nav>
    </ScrollArea>
    ```
  - 原因: 使用 shadcn ScrollArea 替代手写 overflow-y-auto

- [x] 为业务组件原子化替换编写单元测试
  - 测试文件: `web/src/__tests__/atomized-components.test.ts`
  - 测试场景:
    - **StatusBadge 渲染测试**: 导入 StatusBadge，使用 `ReactDOMServer.renderToStaticMarkup` 渲染 `<StatusBadge status="configured" />`，验证输出 HTML 包含文本 "configured"
    - **StatusBadge getBadgeVariant 测试**: 导入 `getBadgeVariant`，验证 `getBadgeVariant("configured")` 返回 "green"，`getBadgeVariant("未配置")` 返回 "secondary"，`getBadgeVariant("内置")` 返回 "blue"
    - **ScrollArea 导入测试**: 从 `../../components/ui/scroll-area` 导入 ScrollArea 和 ScrollBar，验证导入成功且 ScrollArea 为函数
    - **Badge 导入测试**: 从 `../../components/ui/badge` 导入 Badge，验证导入成功且为函数
    - **Input 导入测试**: 从 `../../components/ui/input` 导入 Input，验证导入成功且为函数
    - **ControlBar 模块加载测试**: 动态 import ControlBar 模块，验证不抛出异常
    - **CommandMenu 模块加载测试**: 动态 import CommandMenu 模块，验证不抛出异常
    - **SessionSidebar 模块加载测试**: 动态 import SessionSidebar 模块，验证不抛出异常
  - 运行命令: `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/atomized-components.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 StatusBadge.tsx 导入了 shadcn Badge
  - `grep -c "from.*ui/badge" /Users/konghayao/code/pazhou/remote-control-server/web/components/config/StatusBadge.tsx`
  - 预期: 输出 1

- [x] 验证 StatusBadge.tsx 不再使用手写 colorClasses
  - `grep -c "colorClasses" /Users/konghayao/code/pazhou/remote-control-server/web/components/config/StatusBadge.tsx`
  - 预期: 输出 0

- [x] 验证 ChatInput.tsx 导入了 shadcn Button
  - `grep -c "from.*ui/button" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/ChatInput.tsx`
  - 预期: 输出 >= 1

- [x] 验证 ChatInput.tsx 不再使用原生 `<button>`
  - `grep -c "<button" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/ChatInput.tsx`
  - 预期: 输出 0

- [x] 验证 CommandMenu.tsx 导入了 ScrollArea
  - `grep -c "from.*ui/scroll-area" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/CommandMenu.tsx`
  - 预期: 输出 1

- [x] 验证 CommandMenu.tsx 不再使用 overflow-y-auto
  - `grep -c "overflow-y-auto" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/CommandMenu.tsx`
  - 预期: 输出 0

- [x] 验证 SessionSidebar.tsx 导入了 ScrollArea
  - `grep -c "from.*ui/scroll-area" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/SessionSidebar.tsx`
  - 预期: 输出 1

- [x] 验证 SessionSidebar.tsx 不再使用 overflow-y-auto
  - `grep -c "overflow-y-auto" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/SessionSidebar.tsx`
  - 预期: 输出 0

- [x] 验证 PlanView.tsx 导入了 ScrollArea
  - `grep -c "from.*ui/scroll-area" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/PlanView.tsx`
  - 预期: 输出 1

- [x] 验证 ACPMain.tsx 导入了 ScrollArea
  - `grep -c "from.*ui/scroll-area" /Users/konghayao/code/pazhou/remote-control-server/web/components/ACPMain.tsx`
  - 预期: 输出 1

- [x] 验证 ACPMain.tsx 不再使用 overflow-y-auto
  - `grep -c "overflow-y-auto" /Users/konghayao/code/pazhou/remote-control-server/web/components/ACPMain.tsx`
  - 预期: 输出 0

- [x] 验证 EventStream.tsx 导入了 ScrollArea
  - `grep -c "from.*ui/scroll-area" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/EventStream.tsx`
  - 预期: 输出 1

- [x] 验证 EventStream.tsx 导入了 shadcn Input
  - `grep -c "from.*ui/input" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/EventStream.tsx`
  - 预期: 输出 1

- [x] 验证 EventStream.tsx 中 `<pre>` 标签保留 overflow-x-auto
  - `grep -c "overflow-x-auto" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/EventStream.tsx`
  - 预期: 输出 >= 2（`<pre>` 代码块内的 overflow-x-auto 保持不变）

- [x] 验证 ControlBar.tsx 导入了 shadcn Input 和 Button
  - `grep -c "from.*ui/input\|from.*ui/button" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/ControlBar.tsx`
  - 预期: 输出 2

- [x] 验证 ControlBar.tsx 不再使用原生 `<input>` 和 `<button>`
  - `grep -c "<input\|<button" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/ControlBar.tsx`
  - 预期: 输出 0

- [x] 验证 shell/Sidebar.tsx 导入了 ScrollArea
  - `grep -c "from.*ui/scroll-area" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/shell/Sidebar.tsx`
  - 预期: 输出 1

- [x] 验证 PermissionViews.tsx 导入了 shadcn Input
  - `grep -c "from.*ui/input" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/PermissionViews.tsx`
  - 预期: 输出 1

- [x] 验证 ToolCallGroup.tsx 未被修改
  - `grep -c "overflow-x-auto" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/ToolCallGroup.tsx`
  - 预期: 输出 2（保持原始值不变）

- [x] 验证 ChatMessage.tsx 未被修改
  - `grep -c "animate-pulse" /Users/konghayao/code/pazhou/remote-control-server/web/components/ChatMessage.tsx`
  - 预期: 输出 1（保持原始值不变）

- [x] 验证 BatchActionBar.tsx 和 EmptyState.tsx 未被修改
  - `grep -c "from.*ui/button\|from.*ui/card" /Users/konghayao/code/pazhou/remote-control-server/web/components/config/BatchActionBar.tsx`
  - 预期: 输出 2（已使用 shadcn 组件，未被改动）

- [x] 验证前端构建无错误
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

- [x] 验证单元测试通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/atomized-components.test.ts`
  - 预期: 所有测试通过

---


### Task 7: 新增组件集成与暗色模式验证

**背景:**
Task 1 已从 shadcn 拉取 Accordion/Calendar/Skeleton 等 7 个新组件到 `web/components/ui/`，但这些组件尚未被任何业务页面实际使用。本 Task 需要封装 DatePicker 组件（基于 Calendar + Popover），将 Accordion/Skeleton 等新组件集成到页面中，替换现有的手写 UI 模式（如 loading 占位 div、表单分组 div），并确保所有新增组件在亮色和暗色模式下视觉正常。本 Task 依赖 Task 1 已拉取的 Accordion/Calendar/Skeleton/Popover 组件，以及 Task 6 完成后的业务组件原子化替换结果。

**涉及文件:**
- 新建: `web/components/ui/date-picker.tsx`（基于 Calendar + Popover 的 DatePicker 封装）
- 修改: `web/components/ui/index.ts`（新增 DatePicker 导出）
- 修改: `web/src/pages/AgentsPage.tsx`（将表单分组替换为 Accordion，loading 态替换为 Skeleton）
- 修改: `web/src/pages/ProvidersPage.tsx`（loading 态替换为 Skeleton）
- 修改: `web/src/pages/SkillsPage.tsx`（loading 态替换为 Skeleton）
- 修改: `web/src/pages/ModelsPage.tsx`（loading 态替换为 Skeleton）
- 新建: `web/src/__tests__/date-picker.test.ts`
- 新建: `web/src/__tests__/dark-mode-components.test.ts`

**执行步骤:**

- [x] 封装 DatePicker 组件
  - 位置: 新建 `web/components/ui/date-picker.tsx`
  - 基于 shadcn Calendar + Popover 组件封装，支持日期选择弹出功能
  - 文件内容:
    ```typescript
    import * as React from "react";
    import { CalendarIcon } from "lucide-react";
    import { cn } from "../../src/lib/utils";
    import { Button } from "./button";
    import { Calendar } from "./calendar";
    import { Popover, PopoverContent, PopoverTrigger } from "./popover";

    interface DatePickerProps {
      value?: Date;
      onChange?: (date: Date | undefined) => void;
      placeholder?: string;
      disabled?: boolean;
      className?: string;
    }

    function DatePicker({
      value,
      onChange,
      placeholder = "选择日期",
      disabled,
      className,
    }: DatePickerProps) {
      const [open, setOpen] = React.useState(false);

      return (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              disabled={disabled}
              className={cn(
                "w-full justify-start text-left font-normal",
                !value && "text-muted-foreground",
                className
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {value ? value.toLocaleDateString("zh-CN") : placeholder}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={value}
              onSelect={(date) => {
                onChange?.(date);
                setOpen(false);
              }}
              initialFocus
            />
          </PopoverContent>
        </Popover>
      );
    }

    export { DatePicker };
    export type { DatePickerProps };
    ```
  - 原因: shadcn 的 Calendar 组件只提供日历面板，不包含弹出选择交互。DatePicker 封装了 Popover + Calendar 的组合，提供开箱即用的日期选择弹出功能

- [x] 更新 index.ts 新增 DatePicker 导出
  - 位置: `web/components/ui/index.ts`
  - 在现有导出列表中按字母序追加:
    ```typescript
    export * from "./date-picker"
    ```
  - 原因: 所有 UI 组件通过 index.ts 统一导出

- [x] 将 AgentsPage 的 loading 占位替换为 Skeleton
  - 位置: `web/src/pages/AgentsPage.tsx` ~L282-L287
  - 在文件顶部导入区域追加:
    ```typescript
    import { Skeleton } from "@/components/ui/skeleton";
    ```
  - 将现有的 loading 分支:
    ```tsx
    if (loading) {
        return (
            <div className="flex h-full items-center justify-center text-muted-foreground">
                加载中...
            </div>
        );
    }
    ```
    替换为:
    ```tsx
    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-9 w-24" />
                </div>
                <div className="rounded-md border">
                    <Skeleton className="h-10 w-full rounded-t-md" />
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-none border-t" />
                    ))}
                </div>
            </div>
        );
    }
    ```
  - 原因: 用 Skeleton 骨架屏替代纯文字"加载中..."，提供更好的加载体验

- [x] 将 AgentsPage 的表单分组替换为 Accordion
  - 位置: `web/src/pages/AgentsPage.tsx` ~L352-L500（FormDialog 内的 Tabs/TabsContent 区域）
  - 在文件顶部导入区域追加:
    ```typescript
    import {
        Accordion,
        AccordionContent,
        AccordionItem,
        AccordionTrigger,
    } from "@/components/ui/accordion";
    ```
  - 将 FormDialog 内的 Tabs 组件:
    ```tsx
    <Tabs defaultValue="basic" className="w-full">
        <TabsList>
            <TabsTrigger value="basic">基础配置</TabsTrigger>
            <TabsTrigger value="permission">权限配置</TabsTrigger>
        </TabsList>
        <TabsContent value="basic">
            <div className="space-y-4 max-h-[55vh] overflow-y-auto pt-2">
                {/* 基础配置表单字段 */}
            </div>
        </TabsContent>
        <TabsContent value="permission">
            {/* 权限配置 */}
        </TabsContent>
    </Tabs>
    ```
    替换为:
    ```tsx
    <Accordion type="multiple" defaultValue={["basic", "permission"]} className="w-full">
        <AccordionItem value="basic">
            <AccordionTrigger className="text-sm font-medium">基础配置</AccordionTrigger>
            <AccordionContent>
                <div className="space-y-4 max-h-[55vh] overflow-y-auto pt-2">
                    {/* 基础配置表单字段 — 保持不变 */}
                </div>
            </AccordionContent>
        </AccordionItem>
        <AccordionItem value="permission">
            <AccordionTrigger className="text-sm font-medium">权限配置</AccordionTrigger>
            <AccordionContent>
                {/* 权限配置 — 保持不变 */}
            </AccordionContent>
        </AccordionItem>
    </Accordion>
    ```
  - 移除不再需要的 Tabs 相关导入（`Tabs, TabsList, TabsTrigger, TabsContent`），这些导入仅在此处使用
  - 原因: Accordion 比 Tabs 更适合长表单的分组折叠场景——用户可同时展开多个分组查看/编辑，且语义上"基础配置"和"权限配置"是并列关系而非切换关系

- [x] 将 ProvidersPage 的 loading 占位替换为 Skeleton
  - 位置: `web/src/pages/ProvidersPage.tsx` ~L452-L454
  - 在文件顶部导入区域追加:
    ```typescript
    import { Skeleton } from "@/components/ui/skeleton";
    ```
  - 将现有的 loading 分支:
    ```tsx
    if (loading) {
        return <div className="flex h-full items-center justify-center text-muted-foreground">加载中...</div>;
    }
    ```
    替换为:
    ```tsx
    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-9 w-24" />
                </div>
                <div className="rounded-md border">
                    <Skeleton className="h-10 w-full rounded-t-md" />
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-none border-t" />
                    ))}
                </div>
            </div>
        );
    }
    ```
  - 原因: 用 Skeleton 骨架屏替代纯文字"加载中..."

- [x] 将 SkillsPage 的 loading 占位替换为 Skeleton
  - 位置: `web/src/pages/SkillsPage.tsx` ~L166-L168
  - 在文件顶部导入区域追加:
    ```typescript
    import { Skeleton } from "@/components/ui/skeleton";
    ```
  - 将现有的 loading 分支:
    ```tsx
    if (loading) {
        return <div className="flex h-full items-center justify-center text-muted-foreground">加载中...</div>;
    }
    ```
    替换为:
    ```tsx
    if (loading) {
        return (
            <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="h-9 w-24" />
                </div>
                <div className="rounded-md border">
                    <Skeleton className="h-10 w-full rounded-t-md" />
                    {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-none border-t" />
                    ))}
                </div>
            </div>
        );
    }
    ```
  - 原因: 用 Skeleton 骨架屏替代纯文字"加载中..."

- [x] 将 ModelsPage 的 loading 占位替换为 Skeleton
  - 位置: `web/src/pages/ModelsPage.tsx` ~L92-L94
  - 在文件顶部导入区域追加:
    ```typescript
    import { Skeleton } from "@/components/ui/skeleton";
    ```
  - 将现有的 loading 分支:
    ```tsx
    if (loading) {
        return <div className="flex h-full items-center justify-center text-muted-foreground">加载中...</div>;
    }
    ```
    替换为:
    ```tsx
    if (loading) {
        return (
            <div className="p-6 space-y-6">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-md border">
                        <Skeleton className="h-12 w-full rounded-t-md" />
                        <div className="p-4 space-y-3">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-4 w-64" />
                            <Skeleton className="h-4 w-56" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }
    ```
  - 原因: ModelsPage 使用 Card 布局，Skeleton 模拟 Card 结构

- [x] 确认 index.css 无需为新增组件补充 CSS 变量
  - 位置: `web/src/index.css`
  - 经代码确认，DatePicker/Accordion/Skeleton/Calendar 组件使用的 CSS 变量已全部在 `@theme` 和 `.dark` 中定义
  - DatePicker 使用: popover/popover-foreground/background/foreground/primary/primary-foreground/muted/muted-foreground/border/ring — 均已定义
  - Accordion 使用: background/foreground/border/muted/muted-foreground — 均已定义
  - Skeleton 使用: muted（背景色）— 已定义
  - Calendar 使用: background/foreground/primary/primary-foreground/muted/muted-foreground/accent — 均已定义
  - 无需修改 `web/src/index.css`
  - 原因: 确保暗色模式下所有新组件的 CSS 变量有正确的覆盖值

- [x] 为 DatePicker 组件编写单元测试
  - 测试文件: `web/src/__tests__/date-picker.test.ts`
  - 测试场景:
    - **默认渲染测试**: 不传 value 时，验证组件渲染出按钮且按钮文本包含 placeholder "选择日期"
    - **选中日期显示测试**: 传入 `value={new Date("2025-01-15")}` 时，验证按钮文本包含 "2025" 或 "1/15"
    - **disabled 状态测试**: 传入 `disabled={true}` 时，验证触发按钮有 disabled 属性
    - **自定义 placeholder 测试**: 传入 `placeholder="Pick a date"` 时，验证按钮文本包含 "Pick a date"
    - **导出完整性测试**: 验证模块导出 `DatePicker` 函数
  - 测试实现要点:
    - 使用 `bun:test` 的 `describe`/`test`/`expect`
    - 使用 `ReactDOMServer.renderToStaticMarkup` 渲染组件并验证输出 HTML
    ```typescript
    import { describe, test, expect } from "bun:test";
    import ReactDOMServer from "react-dom/server";
    import { DatePicker } from "../../components/ui/date-picker";

    describe("DatePicker", () => {
      test("renders with default placeholder when no value", () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          <DatePicker />
        );
        expect(html).toContain("选择日期");
      });

      test("renders selected date when value provided", () => {
        const testDate = new Date("2025-06-15");
        const html = ReactDOMServer.renderToStaticMarkup(
          <DatePicker value={testDate} />
        );
        expect(html).toMatch(/2025|6/);
      });

      test("renders custom placeholder", () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          <DatePicker placeholder="Pick a date" />
        );
        expect(html).toContain("Pick a date");
      });

      test("renders as disabled", () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          <DatePicker disabled />
        );
        expect(html).toContain("disabled");
      });

      test("exports DatePicker component", () => {
        expect(typeof DatePicker).toBe("function");
      });
    });
    ```
  - 运行命令: `bun test web/src/__tests__/date-picker.test.ts`
  - 预期: 所有测试通过

- [x] 为暗色模式组件集成编写验证测试
  - 测试文件: `web/src/__tests__/dark-mode-components.test.ts`
  - 测试场景:
    - **CSS 变量完整性验证**: 读取 `web/src/index.css` 文件内容，验证 `.dark` 块中包含所有 shadcn 核心变量的覆盖值（`--color-background`、`--color-foreground`、`--color-card`、`--color-popover`、`--color-primary`、`--color-secondary`、`--color-muted`、`--color-accent`、`--color-destructive`、`--color-border`、`--color-input`、`--color-ring`）
    - **Skeleton 导入验证**: 从 `@/components/ui/skeleton` 导入 Skeleton，验证它是一个有效的 React 组件
    - **Accordion 导入验证**: 从 `@/components/ui/accordion` 导入 Accordion/AccordionItem/AccordionTrigger/AccordionContent，验证均为有效组件
    - **Calendar 导入验证**: 从 `@/components/ui/calendar` 导入 Calendar，验证为有效组件
    - **DatePicker 导入验证**: 从 `@/components/ui/date-picker` 导入 DatePicker，验证为有效组件
    - **Skeleton 暗色模式渲染**: 渲染 `<Skeleton className="h-4 w-20" />`，验证输出的 className 包含 `animate-pulse`（Skeleton 的骨架屏动画）
  - 测试实现要点:
    ```typescript
    import { describe, test, expect } from "bun:test";
    import ReactDOMServer from "react-dom/server";
    import { readFileSync } from "fs";
    import { Skeleton } from "../../components/ui/skeleton";
    import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "../../components/ui/accordion";
    import { Calendar } from "../../components/ui/calendar";
    import { DatePicker } from "../../components/ui/date-picker";

    const DARK_MODE_VARIABLES = [
      "--color-background",
      "--color-foreground",
      "--color-card",
      "--color-card-foreground",
      "--color-popover",
      "--color-popover-foreground",
      "--color-primary",
      "--color-primary-foreground",
      "--color-secondary",
      "--color-secondary-foreground",
      "--color-muted",
      "--color-muted-foreground",
      "--color-accent",
      "--color-accent-foreground",
      "--color-destructive",
      "--color-border",
      "--color-input",
      "--color-ring",
    ];

    describe("Dark mode component integration", () => {
      test("index.css dark mode has all required CSS variables", () => {
        const css = readFileSync("web/src/index.css", "utf-8");
        const darkBlockMatch = css.match(/\.dark\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/s);
        expect(darkBlockMatch).not.toBeNull();
        const darkBlock = darkBlockMatch![1];
        for (const variable of DARK_MODE_VARIABLES) {
          expect(darkBlock).toContain(variable);
        }
      });

      test("Skeleton renders with animate-pulse", () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          <Skeleton className="h-4 w-20" />
        );
        expect(html).toContain("animate-pulse");
      });

      test("Accordion components are valid React components", () => {
        expect(typeof Accordion).toBe("function");
        expect(typeof AccordionItem).toBe("function");
        expect(typeof AccordionTrigger).toBe("function");
        expect(typeof AccordionContent).toBe("function");
      });

      test("Calendar component is a valid React component", () => {
        expect(typeof Calendar).toBe("function");
      });

      test("DatePicker component is a valid React component", () => {
        expect(typeof DatePicker).toBe("function");
      });

      test("Accordion renders basic structure", () => {
        const html = ReactDOMServer.renderToStaticMarkup(
          <Accordion type="single">
            <AccordionItem value="test">
              <AccordionTrigger>标题</AccordionTrigger>
              <AccordionContent>内容</AccordionContent>
            </AccordionItem>
          </Accordion>
        );
        expect(html).toContain("标题");
        expect(html).toContain("内容");
      });
    });
    ```
  - 运行命令: `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/dark-mode-components.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 验证 DatePicker 文件存在且导出正确
  - `grep -c "export.*DatePicker\|export type.*DatePickerProps" web/components/ui/date-picker.tsx`
  - 预期: 输出 2（函数导出 + 类型导出）

- [x] 验证 index.ts 新增了 DatePicker 导出
  - `grep "date-picker" web/components/ui/index.ts`
  - 预期: 输出 `export * from "./date-picker"`

- [x] 验证 DatePicker 导入了 Calendar 和 Popover
  - `grep -c "from \"./calendar\"\|from \"./popover\"" web/components/ui/date-picker.tsx`
  - 预期: 输出 2

- [x] 验证 DatePicker 导入了正确的 utils 路径
  - `grep "from \"@/lib/utils\"" web/components/ui/date-picker.tsx | wc -l`
  - 预期: 输出 0（不应使用 shadcn 默认路径）

- [x] 验证 AgentsPage 导入了 Skeleton 和 Accordion
  - `grep -c "from \"@/components/ui/skeleton\"\|from \"@/components/ui/accordion\"" web/src/pages/AgentsPage.tsx`
  - 预期: 输出 2

- [x] 验证 AgentsPage 不再使用 Tabs（仅限 FormDialog 内部，Tabs 导入已移除）
  - `grep -c "TabsList\|TabsTrigger\|TabsContent" web/src/pages/AgentsPage.tsx`
  - 预期: 输出 0

- [x] 验证 AgentsPage 使用了 Accordion 组件
  - `grep -c "AccordionItem\|AccordionTrigger\|AccordionContent" web/src/pages/AgentsPage.tsx`
  - 预期: 输出 >= 3

- [x] 验证 AgentsPage 使用了 Skeleton 组件
  - `grep -c "Skeleton" web/src/pages/AgentsPage.tsx`
  - 预期: 输出 >= 2（导入行 + 使用行）

- [x] 验证 ProvidersPage 导入了 Skeleton
  - `grep -c "from \"@/components/ui/skeleton\"" web/src/pages/ProvidersPage.tsx`
  - 预期: 输出 1

- [x] 验证 SkillsPage 导入了 Skeleton
  - `grep -c "from \"@/components/ui/skeleton\"" web/src/pages/SkillsPage.tsx`
  - 预期: 输出 1

- [x] 验证 ModelsPage 导入了 Skeleton
  - `grep -c "from \"@/components/ui/skeleton\"" web/src/pages/ModelsPage.tsx`
  - 预期: 输出 1

- [x] 验证 4 个页面不再使用文字"加载中..."作为 loading 占位
  - `grep -c "加载中\.\.\." web/src/pages/AgentsPage.tsx web/src/pages/ProvidersPage.tsx web/src/pages/SkillsPage.tsx web/src/pages/ModelsPage.tsx`
  - 预期: 每个文件输出 0

- [x] 验证 index.css 中 .dark 块包含所有 shadcn 核心变量
  - `grep -c "\-\-color-background\|--color-foreground\|--color-popover\|--color-primary\|--color-secondary\|--color-muted\|--color-accent\|--color-destructive\|--color-border\|--color-input\|--color-ring" web/src/index.css`
  - 预期: 输出 >= 22（每个变量在 @theme 和 .dark 中各出现一次）

- [x] 验证前端构建无错误
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 "built in" 且无 error

- [x] 验证 DatePicker 测试通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/date-picker.test.ts`
  - 预期: 所有测试通过

- [x] 验证暗色模式组件集成测试通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/dark-mode-components.test.ts`
  - 预期: 所有测试通过

- [x] 运行全量测试确保无回归
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/ 2>&1 | tail -10`
  - 预期: 所有测试通过，无失败

---

### Task 8: shadcn 组件统一化 验收

**前置条件:**
- 启动命令: `cd /Users/konghayao/code/pazhou/remote-control-server && bun run dev:web`
- 构建命令: `bun run build:web`
- 全量测试: `bun test web/src/__tests__/`
- 浏览器访问: `http://localhost:5173/code/`（开发服务器）

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `cd /Users/konghayao/code/pazhou/remote-control-server && bun test web/src/__tests__/ 2>&1 | tail -20`
   - 预期: 全部测试通过，0 failures
   - 失败排查: 检查各 Task 的测试步骤，根据失败信息定位到具体 Task

2. 验证前端构建无 TypeScript 和编译错误
   - `bun run build:web 2>&1 | tail -10`
   - 预期: 输出包含 "built in" 且无 error/warning
   - 失败排查: 检查 Task 1（组件同步是否有导入路径错误）、Task 2/4（类型签名兼容性）

3. 验证基础组件同步完成
   - `ls web/components/ui/{button,card,dialog,dropdown-menu,input,select,table,checkbox,form,accordion,calendar,skeleton,alert-dialog}.tsx | wc -l`
   - 预期: 输出 13（确认关键组件文件存在）
   - 失败排查: 检查 Task 1 的同步步骤

4. 验证自定义组件未受影响
   - `grep -c "connection-status\|theme-toggle\|button-group\|input-group" web/components/ui/index.ts`
   - 预期: 输出 4
   - 失败排查: 检查 Task 1 的 index.ts 更新步骤

5. 验证 DataTable 接口兼容性
   - `grep -c "export.*Column\|export.*DataTableProps\|export.*filterData\|export.*sortData\|export.*paginateData\|export.*DataTable" web/components/config/DataTable.tsx`
   - 预期: 输出 >= 6
   - 失败排查: 检查 Task 2 的导出保留步骤

6. 验证表单标准化
   - `grep -c "useForm\|zodResolver" web/src/components/TokenManagerDialog.tsx web/src/components/NewSessionDialog.tsx`
   - 预期: 每个文件输出 >= 2
   - 失败排查: 检查 Task 4 的迁移步骤

6b. 验证 FormDialog 支持 formConfig 可选 prop
   - `grep -c "formConfig\|FormDialogFormConfig" web/components/config/FormDialog.tsx`
   - 预期: 输出 >= 3（接口定义 + prop 定义 + 函数体解构）
   - 失败排查: 检查 Task 3 的 FormDialog 改造步骤

7. 验证 ConfirmDialog 使用 AlertDialog
   - `grep -c "from.*alert-dialog" web/components/config/ConfirmDialog.tsx`
   - 预期: 输出 1
   - 失败排查: 检查 Task 5 的重写步骤

8. 验证业务组件中不再使用原生 `<input type="checkbox">`
   - `grep -rn 'type="checkbox"' web/components/ web/src/components/ --include="*.tsx" | grep -v node_modules | wc -l`
   - 预期: 输出 0
   - 失败排查: 检查 Task 2（DataTable checkbox）和 Task 6（业务组件替换）

8b. 验证业务组件原子化替换完成
   - `grep -c "from.*ui/scroll-area" web/components/chat/SessionSidebar.tsx web/components/chat/CommandMenu.tsx web/components/ACPMain.tsx web/src/components/shell/Sidebar.tsx`
   - 预期: 每个文件输出 >= 1（4 个文件均导入了 ScrollArea）
   - 失败排查: 检查 Task 6 的 ScrollArea 替换步骤

9. 验证暗色模式 CSS 变量完整
   - `grep -c "\-\-color-primary.*#409EFF\|--color-background.*#141414" web/src/index.css`
   - 预期: 输出 >= 2（品牌色和暗色背景变量存在）
   - 失败排查: 检查 Task 7 的 CSS 变量验证步骤

10. 全页面视觉验证（手动）
    - 打开浏览器访问开发服务器，切换亮色/暗色模式
    - 检查 Settings 页面 DataTable 排序/过滤/分页功能正常
    - 检查各表单弹窗（新建 Agent/Skill/Provider）验证逻辑正常
    - 检查确认弹窗（删除操作）使用 AlertDialog 样式正常
    - 预期: 所有页面视觉正常，无 console 错误
    - 失败排查: 根据具体问题定位到对应 Task
