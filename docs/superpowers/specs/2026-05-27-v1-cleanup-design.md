---
name: v1-cleanup
date: 2026-05-27
status: approved
---

# V1 代码清理设计

一次性删除所有 v1 控制面板界面和 API 接口，保留 v2 使用的代码。

## 后端清理

### 删除文件

- `src/routes/v1/environments.ts` — bridge 注册/注销/重连端点（acp-link 通过 WebSocket 连接，不调用这些 REST 端点）
- `src/routes/v1/environments.work.ts` — work poll/ack/stop/heartbeat 端点（旧轮询模式，已被 v2 替代）
- `src/routes/v1/sessions.ts` — session CRUD + events 端点（前端使用 `/web/sessions`）
- `src/schemas/v1-environment.schema.ts` — bridge 注册 schema
- `src/schemas/v1-session.schema.ts` — session schema
- `packages/sdk/src/modules/v1-environment.ts` — V1EnvironmentApi 类
- `packages/sdk/src/modules/v1-session.ts` — V1SessionApi 类

### 搬迁文件

- `src/routes/v1/session-ingress.ts` → `src/routes/v2/session-ingress.ts`
  - 文件在 v1 目录但实际挂载 `/v2/session_ingress`，文件位置应与路径一致
  - 该端点被 HybridTransport 和 worker 进程依赖，属于 v2 核心组件

### 修改文件

| 文件 | 操作 |
|------|------|
| `src/index.ts` | 删除 v1Environments/v1EnvironmentsWork/v1Sessions 的 import 和 `.use()`；更新 session-ingress import 路径 |
| `src/schemas/index.ts` | 移除 v1 schema 的 re-export |
| `src/services/environment.ts` | 移除 registerBridge/deregisterBridge/reconnectBridge 的 re-export |
| `packages/sdk/src/index.ts` | 移除 v1-environment/v1-session 模块的 re-export |
| `web/src/api/sdk.ts` | 移除 v1EnvApi/v1SessionApi 的 import 和 export |

### Service 层策略

`src/services/environment-acp.ts` 中的 bridge 函数和 `src/services/work-dispatch.ts` 中的 work 函数**保留在原文件不删**。原因：

- 这些文件同时包含 v2 使用的函数，逐个删除函数容易引入遗漏
- 删路由入口后这些函数变为 dead code，后续可通过 lint 规则清理
- 降低变更风险

## 前端清理

### 删除路由

- `web/src/routes/_app.tsx` — v1 layout 路由
- `web/src/routes/_app/` 整个目录（14 个路由文件）：
  - `index.tsx`（重定向到 /agent）
  - `$sessionId.tsx`
  - `agents.tsx`、`apikeys.tsx`、`channels.tsx`、`environments.tsx`
  - `knowledge-bases.tsx`、`mcp.tsx`、`models.tsx`、`organizations.tsx`
  - `skills.tsx`、`tasks.tsx`、`workflow.tsx`、`workflow_.$.tsx`

### 删除 Shell 组件

- `web/src/components/shell/` 整个目录（AppShell、Sidebar、Topbar）

### 删除 v1 页面组件

- `web/src/pages/Dashboard.tsx`
- `web/src/pages/SessionDetail.tsx`
- `web/src/pages/EnvironmentsPage.tsx`
- `web/src/pages/AgentsPage.tsx`
- `web/src/pages/ApiKeyManager.tsx`
- `web/src/pages/ChannelsPage.tsx`
- `web/src/pages/KnowledgeBasesPage.tsx`
- `web/src/pages/McpPage.tsx`
- `web/src/pages/ModelsPage.tsx`
- `web/src/pages/OrgsPage.tsx`
- `web/src/pages/SkillsPage.tsx`
- `web/src/pages/TasksPage.tsx`

### 保留的页面组件

- `web/src/pages/LoginPage.tsx` — 全局认证页面，`__root.tsx` 引用
- `web/src/pages/WorkflowPage.tsx` — 工作流编辑器，可能被 v2 使用
- `web/src/pages/agent-panel/` — v2 Agent 面板所有组件不动

### 删除 v1 专用组件

- `SessionList.tsx`、`EnvironmentList.tsx`、`Navbar.tsx`
- `ACPDirectView.tsx`、`ControlBar.tsx`、`IdentityPanel.tsx`
- `PermissionViews.tsx`、`TaskPanel.tsx`
- `TokenManagerDialog.tsx`、`NewSessionDialog.tsx`、`LoadingIndicator.tsx`、`EventStream.tsx`

### 保留的共享组件

- `OrgSwitcher.tsx` — v2 AgentSidebar 使用
- `PermissionTab.tsx` — v2 AgentCreateDialog/AgentConfigDialog 使用
- `FilePickerDialog.tsx` — 共享 chat/ChatInput 使用

### 根路径处理

删除 `_app/index.tsx` 后，在 `web/src/routes/` 根目录新建 `index.tsx`，实现 `/` → `/agent` 的重定向。

`routeTree.gen.ts` 由 Vite 插件自动重新生成，不需要手动编辑。

## 验证

删除完成后依次执行：

1. **`bun run precheck`** — 格式化 + import 排序 + tsc + biome check。最关键步骤，遗漏的引用会被 tsc 捕获。
2. **`bun test src/__tests__/`** — 后端测试。需检查并清理 v1 相关测试文件。
3. **`bun run build:web`** — 前端构建，确认无断裂 import。

## 不在范围内

- 不删除 `src/services/environment-acp.ts`、`src/services/work-dispatch.ts` 中的 v1 专用函数
- 不修改 v2 路由（`/v1/code/sessions` 路径虽含 v1 前缀，但属于 v2 code session 端点）
- 不更新 CLAUDE.md（验证通过后再更新）
