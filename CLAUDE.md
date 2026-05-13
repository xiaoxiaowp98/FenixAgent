# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Remote Control Server (RCS) 是一个基于 Hono + Bun 的 AI Agent 控制面板后端，配合 React + Vite 前端。核心功能包括：

- **ACP 协议支持**：通过 WebSocket 与 acp-link Agent通信，实现远程 Agent 控制和事件流转发
- **配置管理**：Providers/Models/Agents/Skills/MCP 的动态配置，存储于 `~/.config/opencode/opencode.json`
- **会话管理**：通过 SSE 向前端推送会话事件（user/assistant/tool_use/permission_request 等），支持 ACP session/list 按 cwd 过滤
- **认证授权**：better-auth (SQLite) + API Key 认证，支持用户会话和 acp-link 的 Bearer token
- **定时 HTTP 任务**：cron 调度、执行历史记录、失败重试（Drizzle ORM + node-schedule）
- **用户文件系统**：会话级文件读写上传，支持 iframe 预览（`/web/sessions/:id/user/*`）
- **Channel 层**：多频道通信支持（`/web/channels`）
- **会话分享**：share link 表已创建（readonly/writable 模式），功能开发中

## 常用命令

### 开发与构建

```bash
# 后端开发（热重载）
bun run dev

# 前端开发（Vite dev server，独立进程，Agent到后端）
bun run dev:web

# 生产构建前端（修改前端代码后必须执行！）
bun run build:web

# 启动生产服务器
bun run start

# 类型检查
bun run typecheck
```

**重要**：后端通过 `serveStatic` 挂载 `web/dist/` 目录（见 `src/index.ts`）。修改任何前端代码后，**必须**执行 `bun run build:web` 重新构建，否则更改不会生效。

### 测试

```bash
# 运行所有后端测试（Bun test）
bun test src/__tests__

# 运行特定测试文件
bun test src/__tests__/config-service.test.ts

# 前端全部测试（从项目根目录运行）
bun test web/src/__tests__/

# 前端单个测试文件
bun test web/src/__tests__/app-i18n.test.ts
```

**注意**：前端代码在 `web/` 目录，但没有独立的 `package.json`。所有依赖在根目录 `package.json`，构建命令需要从项目根目录执行。前端测试使用 `import.meta.dirname` 解析文件路径，从项目根目录运行即可。

### 工作目录注意事项

Bash 的 `cd` 命令会改变 persistent CWD。当在 `web/` 目录执行命令后，后续相对路径会出错。解决方案：

- 使用绝对路径
- 或在每次命令前重新 `cd` 到项目根

```bash
# 错误示例
cd web && bunx vite build && ls src/  # 这里的 src/ 是相对于 web/ 的

# 正确示例
cd web && bunx vite build && cd .. && ls src/
```

## 架构关键点

### 后端架构 (Hono + Bun)

**入口**：`src/index.ts`

- 挂载所有路由：`/v1/*`（兼容）、`/web/*`（控制面板 API）、`/acp/*`（ACP 协议）
- 静态文件服务：`/ctrl/*` → `web/dist/`（构建后的前端）
- iframe 预览重定向：`/ctrl/:sessionId/user/*` → `/web/sessions/:id/user/*?preview=true`
- 启动时初始化：skills 目录迁移（`migrateSkillsDir`）、定时任务调度器（`startScheduler`）
- 优雅关闭：清理 WebSocket 连接、instances、调度器

**认证层**：

- `src/auth/better-auth.ts`：better-auth 实例，session + email/password
- `src/auth/api-key-service.ts`：per-user API Key（SQLite），用于 acp-link 认证
- `src/auth/middleware.ts`：`sessionAuth` 中间件，验证 better-auth session
- `src/auth/jwt.ts`：JWT 工具（遗留代码，部分功能仍在使用）

**配置服务**：`src/services/config.ts`

- 存储路径：`~/.config/opencode/opencode.json`
- 写入互斥锁：防止并发写入损坏配置
- deep merge：`setSection` 会合并而非覆盖现有配置
- **子服务**：`skill.ts`、`instance.ts`、`task.ts`、`scheduler.ts`、`session.ts` 负责特定功能的 CRUD 和调度

**传输层**：`src/transport/`

- `acp-ws-handler.ts`：处理 `/acp/ws` 连接（acp-link 注册）
- `acp-relay-handler.ts`：处理 `/acp/relay/:agentId` 连接（前端与 Agent 的中继），拦截 `list_sessions` 由服务端直接响应
- `event-bus.ts`：事件总线，连接会话事件和 ACP 连接
- `sse-writer.ts`：SSE 事件规范化

**内存存储**：`src/store.ts`

- `environments` Map：Agent 注册信息（断开时直接删除，不保留 offline）
- `sessions` Map：会话元数据（environment 删除时关联 session 也会被删除）
- `sessionWorkers` Map：Worker 状态（`storeGetSessionWorker`、`storeUpsertSessionWorker`）
- `tokens` Map：遗留 token 存储（`storeCreateToken`、`storeGetUserByToken`）
- 辅助查询：`storeListSessionsForAgentByCwd`（按 cwd 过滤 session）、`storeListAcpAgentsByUserId`

**数据库持久化**：`src/db/schema.ts`（Drizzle ORM + SQLite）

- better-auth 表：`user`、`session`、`account`、`verification`
- 自定义表：`apiKey`、`mcpTool`、`scheduledTask`、`taskExecutionLog`、`shareLink`、`shareEventSnapshot`、`environment`

### ACP 协议要点

acp-link 是连接 AI Agent 和 RCS 的桥梁，通过 WebSocket 进行双向通信。

#### 认证方式

acp-link 有两种认证方式（优先级从高到低）：

1. **Per-user API Key**（SQLite）：`Authorization: Bearer rcs_xxx` 或 `?token=rcs_xxx`
2. **全局 API Key**（环境变量）：`RCS_API_KEYS=key1,key2`，回退到系统用户

#### WebSocket 端点

**`/acp/ws`** — acp-link 注册端点

- 认证：API Key（Bearer token 或 query param）
- 消息格式：NDJSON（每行一个 JSON + `\n`）

**关键消息类型**：

```json
// acp-link 发送注册请求
{"type": "register", "agent_name": "my-agent", "max_sessions": 1, "capabilities": {...}}

// 服务器响应注册成功
{"type": "registered", "agent_id": "env_xxx"}

// acp-link 也可以先通过 REST 注册，再通过 WS 绑定
{"type": "identify", "agent_id": "env_xxx"}

// 保活（双向）
{"type": "keep_alive"}

// 任意业务消息（透传到 EventBus）
{"type": "user", "content": "..."}
```

**`/acp/relay/:agentId`** — 前端与 Agent 的中继端点

- 认证：better-auth session（cookie-based）
- 用途：前端通过此 WebSocket 与 acp-link 通信，服务器双向转发消息
- `keep_alive` 消息在 relay 层被拦截，不透传到前端（防止 "Unknown message type: keep_alive" 错误）
- `list_sessions` 消息由 relay 层拦截，服务端直接按 ACP `AgentSessionInfo` 格式响应（支持 `cwd` 过滤）
- relay 断连时不关闭 acp-link 子进程（只关闭 WebSocket 连接），仅用户显式删除时才终止进程
- 多实例隔离：relay URL 携带 `?sessionId=xxx` 参数，`agentLocalWsMap` 按 **instanceId** 做 key（非 agentId），同一环境多个实例各有独立的本地 WS 连接
- 消息流向：
  - 前端 → relay → acp-link（`direction: "outbound"`）
  - acp-link → relay → 前端（`direction: "inbound"`）

#### REST 注册端点（必须）

**`/v1/environments/bridge`** — acp-link 标准 REST 注册

- **POST**：注册新 agent，返回 `environment_id` 和 `session_id`
- **DELETE** `/bridge/:id`：注销 agent
- **POST** `/:id/bridge/reconnect`：重连（标记 status 为 `active`）

**acp-link 标准连接流程**：

1. REST POST `/v1/environments/bridge` → 获取 `environment_id`
2. WebSocket 连接 `/acp/ws?token=xxx`
3. 发送 `{"type": "identify", "agent_id": "env_xxx"}` 绑定连接

#### 保活机制

| 方向 | 间隔 | 说明 |
|------|------|------|
| 服务器 → acp-link | 20s | `keep_alive` 数据帧，防止反向Agent超时断开 |
| acp-link → 服务器 | 60s | 无活动则关闭连接（检测死连接） |
| 服务器 → 前端 relay | 20s | `keep_alive` 保持 relay 连接 |

#### 连接状态管理

- **注册**：创建 `EnvironmentRecord`（`workerType="acp"`），状态为 `active`
- **断开**：WS 断开时**直接删除内存记录和关联 session**（不保留 offline 状态），但 acp-link 子进程不会被杀掉（除非用户显式删除）
- **注销**：DELETE `/v1/environments/bridge/:id` 直接删除记录（不是标记 `deregistered`）
- **自动会话**：注册时若无 session，自动创建一个默认 session
- **超时清理**：`disconnect-monitor` 检测到 ACP agent 超时也会直接删除记录

### 前端架构 (React + Vite)

**构建配置**：`web/vite.config.ts`

- Tailwind CSS v4 使用 `@tailwindcss/vite` 插件（**不是** tailwind.config.js）
- base path: `/ctrl/`
- 路径别名：`@/src` → `web/src`，`@/components` → `web/components`

**样式系统**：`web/src/index.css`

- Tailwind v4 with `@theme` directive
- `@plugin "@tailwindcss/typography"` 用于 prose 类
- 颜色系统：brand blue (#409EFF)，深色侧边栏 (#1a1f2e)

**组件层级**：

- `web/src/App.tsx`：路由 + better-auth session 管理
- `web/src/components/shell/`：AppShell、Sidebar（应用外壳）
- `web/src/components/config/`：DataTable、FormDialog、StatusBadge（配置页通用组件）
- `web/src/components/`：FilePickerDialog、PermissionTab、SessionDetail 等功能组件
- `web/src/pages/`：Dashboard、ModelsPage、AgentsPage、SkillsPage、McpPage、TasksPage、ChannelsPage、LoginPage、ApiKeyManager 等
- `web/src/acp/`：ACP 客户端（`client.ts`、`types.ts`），处理 session/list、session/load、session/resume 等 ACP 协议

**状态管理**：

- 本地状态：useState + useCallback
- 远程数据：API client (`web/src/api/client.ts`) + fetch
- 认证状态：better-auth session（cookie-based）

**API Client 模式**：

```typescript
async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "include", // 关键：携带 better-auth session cookie
    body: body ? JSON.stringify(body) : undefined,
  });
  // ...错误处理
}
```

## 配置文件格式

### `~/.config/opencode/opencode.json`

```json
{
  "providers": { "provider-id": { "baseURL": "...", "apiKey": "..." } },
  "models": { "model-id": { "provider": "provider-id", "model": "..." } },
  "agents": { "agent-id": { "model": "model-id", "prompt": "...", "permission": {...} } },
  "skills": { "skill-name": { "description": "...", "content": "..." } },
  "mcp": { "server-id": { "command": "...", "args": [...] } }
}
```

**重要**：`setSection` 使用 deep merge，修改嵌套字段时需注意不会意外合并数组。

### 配置 API 规范

**统一格式**：`POST /web/config/:module`

| Module | 说明 |
|--------|------|
| `providers` | AI 服务商管理 |
| `models` | 模型配置 |
| `agents` | Agent 配置 |
| `skills` | Skill 管理 |
| `mcp` | MCP 服务器配置 |

**请求格式**：

```jsonc
{
  "action": "list" | "get" | "set" | "create" | "delete" | "enable" | "disable",
  // ... 其他字段按 action 而定
}
```

**响应格式**：

```jsonc
// 成功
{ "success": true, "data": { ... } }

// 失败
{ "success": false, "error": { "code": "NOT_FOUND", "message": "..." } }
```

**错误码**：`NOT_FOUND`、`ALREADY_EXISTS`、`VALIDATION_ERROR`、`CONFIG_READ_ERROR`、`CONFIG_WRITE_ERROR`、`FORBIDDEN`

### API Key 安全策略

- 用户提交明文 Key 时，服务端替换为 `{env:RCS_SECRET_<provider_name>}` 存入配置文件
- 实际密文存入环境变量（`.env` 或系统环境变量）
- API 响应只返回 `keyHint`（尾 4 位），如 `***ab12`

### Skills 存储路径

```
~/.agents/skills/           ← 启用的 skills
~/.agents/skills/_disabled/  ← 禁用的 skills
```

**历史**：旧路径为 `~/.config/opencode/skills/`，RCS 启动时自动迁移，创建 `.migrated` 标记文件防止重复迁移。

### Permission 权限系统

Agent 权限从旧版 `tools`（布尔值）升级为 `permission`（三态）：

| 旧格式 | 新格式 |
|--------|--------|
| `tools: { bash: true, edit: false }` | `permission: { bash: "allow", edit: "deny" }` |

**权限值**：

- `"ask"` — 询问用户
- `"allow"` — 允许
- `"deny"` — 拒绝

**工具类型**：

- **规则型**（支持通配符）：read, edit, glob, grep, list, bash, task, external_directory, lsp, skill
- **开关型**（仅三态）：todowrite, question, webfetch, websearch, codesearch, doom_loop

**示例**：

```jsonc
{
  "permission": {
    "bash": "allow",              // 全局允许
    "read": { "*.env": "deny" },  // 通配符规则
    "skill": { "internal-*": "allow" }
  }
}
```

### 内置 Agent 保护

以下 Agent 为内置，不可删除（可修改配置）：

- `build`、`plan`、`general`、`explore`、`title`、`summary`、`compaction`

### MCP 服务器配置

MCP (Model Context Protocol) 支持两种类型：

**Local**（命令行启动）：

```jsonc
{
  "type": "local",
  "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
  "environment": { "GITHUB_TOKEN": "{env:GITHUB_TOKEN}" },
  "enabled": true,
  "timeout": 5000
}
```

**Remote**（URL 连接）：

```jsonc
{
  "type": "remote",
  "url": "https://api.mcp.example.com/sse",
  "headers": { "Authorization": "Bearer {env:MCP_TOKEN}" },
  "enabled": true,
  "timeout": 5000
}
```

## 数据库

- SQLite：`data/db.sqlite`（gitignored）
- ORM：Drizzle ORM
- Schema：`src/db/schema.ts`
- 表：
  - better-auth：`user`、`session`、`account`、`verification`
  - 自定义：`apiKey`、`mcpTool`（MCP Tool 缓存）、`scheduledTask`（定时任务）、`taskExecutionLog`（执行日志）、`shareLink`（分享链接）、`shareEventSnapshot`（分享事件快照）、`environment`（环境持久化）

迁移：无正式迁移系统，better-auth 自动创建表。RCS 启动时自动执行表创建（`CREATE TABLE IF NOT EXISTS`）。

## 测试策略

### 运行命令

```bash
# 后端全部测试
bun test src/__tests__/

# 后端单个测试文件
bun test src/__tests__/store.test.ts

# 前端全部测试（从项目根目录运行）
bun test web/src/__tests__/

# 前端单个测试文件
bun test web/src/__tests__/app-i18n.test.ts
```

### tsconfig

后端 `tsconfig.json` 已配置为自包含（不依赖外部 `tsconfig.base.json`）：
- `target: ES2022`、`module: ES2022`、`moduleResolution: bundler`
- `types: ["bun"]`（依赖 `@types/bun`，已安装在 devDependencies）
- 前端有独立的 `web/tsconfig.json`

### 后端测试 (Bun test)

- 路径：`src/__tests__/*.test.ts`
- 模式：单元测试为主，临时文件/目录用于 config 测试
- Mock：使用 `mock.module()` 模拟依赖，需在 `import` 语句之前注册
- 注释规范：每个 `test(...)` 上方补一行中文注释，和 test label 基本匹配即可；如果测试较复杂，可补充少量说明

#### Mock 注意事项

1. **mock.module 必须在 import 之前调用**：Bun test 要求 mock 在模块加载前注册
2. **mock 隔离限制**：`mock.module()` 在同一进程中全局生效。当多个测试文件 mock 同一模块（如 `../config`）时，后加载的测试可能继承前一个测试的 mock 缓存，导致导入失败。表现为 `SyntaxError: Export named 'xxx' not found`
3. **db/better-auth mock**：测试中若需要 mock 中间件链，必须同时 mock `../db`、`../auth/better-auth`、`../auth/api-key-service`，否则动态导入会失败
4. **store 函数无 mock**：`src/store.ts` 是纯内存 Map，测试直接调用 `storeReset()` 清理状态

#### 已知测试问题

- **`middleware.test.ts` 和 `routes.test.ts`**：在 `bun test src/__tests__/` 全局运行时，因 mock 缓存污染可能无法加载 `auth/middleware.ts`（报 `Export named 'xxx' not found`）。单独运行这两个文件时正常。这是 bun test 的 mock 隔离限制，非代码 bug
- **`routes.test.ts` Web Session Routes**：32 个测试预期 UUID-based 认证（`?uuid=` query param），但当前 `/web/sessions` 路由使用 `sessionAuth`（better-auth cookie）。需要更新测试或实现新的 API 端点
- **文件路由测试**：`files-route.test.ts` 和 `file-api.test.ts` 中路由路径已从 `/files` 更新为 `/user`，需确保同步

### 前端测试 (Bun test)

- 路径：`web/src/__tests__/*.ts` 和 `*.test.tsx`
- 运行框架：Bun test（不是 vitest，尽管 `bun test` 兼容 vitest API）
- i18n 测试：检查中文文本是否存在（`app-i18n.test.ts` 等）
- 组件测试：使用 React Testing Library + ReactDOMServer
- **文件读取路径**：使用 `import.meta.dirname` 或 `join(import.meta.dirname, "..")` 构建 web 根目录，不使用相对路径字符串（如 `"src/App.tsx"`），因为 CWD 可能不是 `web/`
- **shadcn 组件导入**：使用相对路径如 `../../components/ui/skeleton`（从 `__tests__/` 出发）
- 注释规范：每个 test(...) 上方补一行中文注释，和 test label 基本匹配即可；如果测试逻辑较复杂或存在隐藏前提，可补充说明

## 状态字段映射

两套 StatusBadge 组件，注意区分：

1. **`web/src/components/Navbar.tsx`**（会话/环境状态）
   - `active` → 活跃, `running` → 运行中, `idle` → 空闲
   - `inactive` → 离线, `requires_action` → 待操作
   - `archived` → 已归档, `error` → 错误, `disconnected` → 已断开

2. **`web/components/config/StatusBadge.tsx`**（配置页状态）
   - `configured` → 已配置, `enabled` → 已启用
   - `unconfigured` → 未配置, `disabled` → 已禁用
   - `builtIn` → 内置, `custom` → 自定义
   - `primary` → 主模型, `subagent` → 子Agent, `all` → 全部

## 权限配置

Permission 选项（`web/src/components/PermissionTab.tsx`）：

- `ask` → 询问
- `allow` → 允许
- `deny` → 拒绝

## 常见陷阱

1. **前端修改未生效**：后端直接挂载 `web/dist/`，修改前端代码后必须 `bun run build:web` 重新构建
2. **前端构建后路径错误**：Vite base 设为 `/ctrl/`，部署时需确保反向Agent匹配
3. **配置写入竞争**：多请求同时修改配置可能损坏，`services/config.ts` 有锁机制但非分布式
4. **WebSocket 断连**：反向Agent timeout 需 > 30s（Bun idleTimeout 默认）
5. **状态 Badge 混淆**：两个不同文件中的 StatusBadge，状态值不同
6. **工作目录漂移**：Bash `cd web` 后，相对路径命令会失败
7. **acp-link 实例 spawn 认证**：acp-link 本地 WS 始终启用 auth（`authEnabled: true`），会自动生成 64 位 hex token，不受 `--group`、`ACP_RCS_TOKEN`、`--no-auth` 参数控制。relay 连接时必须从 acp-link stdout 中用正则 `Token:\s*([a-f0-9]{64})` 捕获实际 token，通过 `?token=` 传递。不能假设环境 secret 能复用为本地 WS 认证 token
8. **acp-link 实例端口残留**：服务器重启时不会自动杀掉已 spawn 的 acp-link 子进程。若旧进程仍占用端口（如 8888），新实例 spawn 会因 `EADDRINUSE` 失败，导致 relay 找不到 running instance（报 "Agent not found or offline"）。重启服务器前应先清理残留的 acp-link 进程（`restart-server.sh` 脚本已包含清理逻辑）
9. **acp-link standalone 模式**：spawn 时不设 `ACP_RCS_URL`，acp-link 只做本地代理不连 RCS upstream。opencode 子进程由本地 WS 连接触发启动（即 relay 连接时才启动 agent）
10. **relay 断连不杀进程**：前端断连（刷新、关闭 dashboard）不应终止 acp-link 子进程，只在用户显式点击删除时才关闭。前端断连只关闭 WebSocket 连接
11. **keep_alive 不透传前端**：relay 层拦截 `keep_alive` 消息，不转发给前端，否则前端报 "Unknown message type: keep_alive"
12. **文件 API 路径**：文件系统路由已改为 `/web/sessions/:id/user/*`（不是 `/files/*`），前端 API client 同步使用 `/user` 路径
13. **API 响应兼容**：改造 API 响应格式时，必须保留旧字段（如 `instance_status`、`instance_id`）直到前端所有引用处都已迁移，否则 `isOnline` 等检查会失效
14. **多实例 relay 路由**：`agentLocalWsMap` 按 instanceId 做 key，不是 agentId。relay URL 须携带 `?sessionId=` 参数才能路由到正确实例，否则所有实例消息混入同一信道
15. **Split Button 可见性**：多实例下拉按钮应在环境在线时就显示（而非仅在多实例时），用户需要随时能"新建实例"
16. **ACP vs RCS session ID**：ACP agent 返回 `ses_xxx` 格式 session ID，RCS 内部用 `session_xxx`/`cse_xxx`。文件 API、FilePickerDialog 等需要 workspace 的操作必须用 RCS session ID（通过 `resolveExistingSessionId` 转换）。前端 `ChatInterface` 的 `activeSessionId` 是 ACP session ID，不能直接用于文件 API；需通过 `rcsSessionId` prop 从 `ACPSessionDetail` → `ACPMain` → `ChatInterface` 透传
17. **resolveWorkspacePath 不做 fallback**：当 session 找不到时不能 fallback 到用户第一个 environment（几乎总是 `/tmp`），应直接返回 404。session ID 必须通过 `resolveExistingSessionId`（session↔cse 格式转换）查找
18. **ChatInterface 有两处 ChatInput**：消息列表区域的 ChatInput 和底部发送栏的 ChatInput 是两个独立组件实例，修改 sessionId 传递时必须两处都改
19. **FilePickerDialog 上传始终到 user/**：不管当前浏览哪个目录，上传操作应始终写入 workspace 的 `user/` 子目录

## 代码风格

### 注释约定

- 对外暴露的接口、类型、类和公共方法应补充简洁注释，优先回答“这是什么”和“拿来做什么”
- 字段名不足以表达语义时，补字段级注释；重点解释：
  - 该字段代表的平台语义或业务含义
  - 为什么它和其他相近字段需要并存，例如平台 ID 与 provider 原生 ID
  - Core 只存储不解释的扩展字段，如 metadata、provider 私有引用
- 注释保持短小直接，不把类型定义写成长文档；避免重复代码字面含义
- 仓储接口方法至少说明读取/写入对象、查询维度和异常或缺失时的行为
- runtime / registry / resolver 这类编排组件的方法，优先说明输入输出语义和失败条件
- 测试辅助实现（如 in-memory repository）的方法，至少说明它模拟的正式契约以及 `reset()` 等方法的用途
- ID 工厂、brand 类型、provider session 映射这类容易混淆的基础类型，应明确说明“平台侧”和“provider 侧”的边界

### 前端约束

- **禁止外部字体链接**：不使用 CDN / Google Fonts / jsdelivr 等外部字体资源，统一使用系统原生字体栈（`system-ui`, `-apple-system`, `ui-monospace` 等），保留中文 fallback

### 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| 文件名 | kebab-case | `config-service.test.ts`, `acp-ws-handler.ts`, `StatusBadge.tsx` |
| 组件名 | PascalCase | `DataTable`, `FormDialog`, `PermissionTab` |
| 函数名 | camelCase | `storeGetEnvironment`, `handleAcpWsOpen`, `apiFetchSessions` |
| 常量 | UPPER_SNAKE_CASE | `MAX_WS_MESSAGE_SIZE`, `CONFIG_PATH` |
| 接口/类型 | PascalCase | `EnvironmentRecord`, `SessionEvent`, `AgentInfo` |
| 状态变量 | camelCase + form 前缀 | `formName`, `formModel`, `formSaving` |

### 目录结构约定

- **后端**：
  - `src/routes/`：按 API 版本或功能分组（`v1/`, `v2/`, `web/`, `acp/`）
  - `src/services/`：业务逻辑层（`config.ts`, `skill.ts`, `instance.ts`, `task.ts`, `scheduler.ts`, `session.ts`, `environment.ts`）
  - `src/transport/`：WebSocket/传输层（`acp-ws-handler.ts`, `acp-relay-handler.ts`, `event-bus.ts`）
  - `src/auth/`：认证相关（`better-auth.ts`, `api-key-service.ts`, `middleware.ts`）
  - `src/__tests__/`：测试文件与源码同名，加 `.test.ts` 后缀

- **前端**：
  - `web/src/components/`：通用组件
    - `config/`：配置页专用组件（`DataTable`, `FormDialog`）
    - `shell/`：应用外壳（`AppShell`, `Sidebar`）
    - `ui/`：shadcn 原子组件
  - `web/src/pages/`：页面组件（`Dashboard.tsx`, `ModelsPage.tsx`, `TasksPage.tsx`, `ChannelsPage.tsx`, `SessionDetail.tsx` 等）
  - `web/src/api/`：API 客户端（`client.ts`）
  - `web/src/acp/`：ACP 协议客户端（`client.ts`, `types.ts`）
  - `web/src/__tests__/`：测试文件

### 代码组织模式

1. **功能驱动提交**：一个 git commit 包含完整的端到端功能（后端服务 + API 路由 + 前端页面 + 测试）
2. **配套测试**：每个功能提交都包含对应的单元测试和集成测试
3. **验收清单**：使用 `spec/spec-human-verify.md` 进行人工验收，完成后归档

### Git 提交风格

```
<type>: <简洁的中文标题>

<详细变更列表，每行以 - 开头>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

**类型前缀**：

- `feat:` - 新功能
- `fix:` - 修复 bug
- `refactor:` - 重构（不改变功能）
- `test:` - 测试相关

**示例**：

```
feat: 实现 Permission 配置增强（tools→permission 转换 + PermissionTab UI）
- Skills 目录从 ~/.config/opencode/skills/ 迁移到 ~/.agents/skills/
- Agent tools 布尔值自动转换为 permission 三态（allow/deny/ask）
- 新增 PermissionTab 组件：开关型工具三态 Select、规则型工具通配符规则编辑器
- 修复 PermissionTab useEffect 循环更新导致 React error #185

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

### React 组件模式

1. **状态管理**：使用 `useState` + `useCallback`，避免依赖循环
2. **表单处理**：使用 react-hook-form + zod（`FormDialog` 已封装）
3. **异步操作**：try-catch + toast 错误提示，finally 清理 loading 状态
4. **条件渲染**：使用 `&&` 或三元运算符，避免不必要的 div 包裹

### 后端路由模式

```typescript
import { Hono } from "hono";

const app = new Hono();

// GET /web/resource
app.get("/", sessionAuth, async (c) => {
  const user = c.get("user")!;
  // ... 业务逻辑
  return c.json(data);
});

// POST /web/resource
app.post("/", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json();
  // ... 业务逻辑
  return c.json({ ok: true });
});

export default app;
```

### 错误处理模式

- **前端**：统一使用 `toast.error()` 显示错误信息
- **后端**：返回 `{ error: { type: "...", message: "..." } }` 格式
- **日志**：使用 `src/logger.ts` 的 `log()` 和 `error()`
