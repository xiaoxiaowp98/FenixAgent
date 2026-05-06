# Agent 知识库执行计划（一）：后端基础设施

**目标:** 为知识库能力补齐 SQLite 数据模型、OpenViking 适配层和知识库管理/资源上传后端 API，不改 ACP 协议主链路。

**技术栈:** Bun + Hono + Drizzle ORM + SQLite + bun:test

**设计文档:** spec/feature_20260506_F001_agent-knowledge-base/spec-design.md

## 改动总览

本计划先落后端基础设施。Task 1 建立知识库/资源/绑定三张表，并补充 `OpenViking` 适配配置；Task 2 单独完成 `OpenViking` 服务接入与部署编排；Task 3 在服务层和 `/web/knowledge-bases` 路由上实现知识库 CRUD；Task 4 追加资源上传、状态同步和错误回写。经代码确认，仓库当前工作树中不存在可直接复用的 `kb/` 目录，因此第一阶段明确采用官方 `ghcr.io/volcengine/openviking` 镜像作为独立服务，通过 `docker-compose.yml`、`ov.conf` 挂载和 `src/services/knowledge-provider/openviking.ts` 适配层完成集成。

---

### Task 0: 环境准备

**背景:**
确保 Bun 构建与测试链路在当前仓库可用，避免后续新增数据库表与 Hono 路由时被环境问题干扰。

**执行步骤:**

- [x] 验证 Bun 与类型检查命令可用
  - 运行: `cd /Users/liyuan/Work/mothership-beta && bun --version && bun run typecheck`
  - 预期: 输出 bun 版本号，`tsc --noEmit` 无配置错误
- [x] 验证后端测试框架可用
  - 运行: `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/db-schema.test.ts`
  - 预期: 现有数据库 schema 测试通过

**检查步骤:**

- [x] 类型检查可执行
  - `cd /Users/liyuan/Work/mothership-beta && bun run typecheck 2>&1 | tail -5`
  - 预期: 无 `error TS` 输出
- [x] 后端测试框架正常
  - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/db-schema.test.ts 2>&1 | tail -5`
  - 预期: 输出包含 `pass`

---

### Task 1: 知识库数据模型与 OpenViking 适配层

**背景:**
当前 `src/db/schema.ts` 与 `src/db/index.ts` 只覆盖认证、环境、任务和 MCP 缓存表，知识库元数据完全缺失。后续路由与 Agent 绑定都依赖统一的数据库主模型和服务端 provider 抽象，因此必须先补齐表结构、配置入口和 `OpenViking` HTTP 适配器。
当前代码状态中 `src/config.ts` 尚未暴露知识服务地址，`docker-compose.yml` 也没有知识服务环境变量；经代码确认仓库不存在 `kb/` 目录，因此本 Task 明确采用“RCS 直连 OpenViking”的实现路径。

**涉及文件:**
- 修改: `src/config.ts`
- 修改: `src/db/schema.ts`
- 修改: `src/db/index.ts`
- 新建: `src/services/knowledge-provider/types.ts`
- 新建: `src/services/knowledge-provider/openviking.ts`
- 修改: `src/__tests__/db-schema.test.ts`
- 新建: `src/__tests__/knowledge-provider-openviking.test.ts`

**执行步骤:**

- [x] 在运行时配置中加入知识服务地址与认证字段
  - 位置: `/Users/liyuan/Work/mothership-beta/src/config.ts` 的 `config` 常量定义内（现有 `acpxGUrl` 字段之后，~L23）
  - 新增 `knowledgeProvider`, `knowledgeBaseUrl`, `knowledgeApiKey`, `knowledgeRequestTimeoutMs` 四个字段，默认值分别固定为 `openviking`、`http://localhost:8090`、空字符串、`15000`
  - 原因: `openviking.ts` 需要统一从配置层读取服务地址和鉴权头，避免在服务层散落环境变量解析逻辑

- [x] 在 Drizzle schema 中新增知识库三张表
  - 位置: `/Users/liyuan/Work/mothership-beta/src/db/schema.ts` 的 `environment` 表定义之后、`scheduledTask` 表定义之前（~L125）
  - 新增 `knowledgeBase` 表，字段包含 `id/userId/name/slug/description/provider/remoteId/status/lastError/createdAt/updatedAt`
  - 新增 `knowledgeResource` 表，字段包含 `id/knowledgeBaseId/sourceType/sourceName/sourcePath/remoteId/status/lastError/createdAt/updatedAt`
  - 新增 `agentKnowledgeBinding` 表，字段包含 `id/agentName/knowledgeBaseId/priority/enabled/createdAt/updatedAt`
  - 为 `slug + user_id`、`knowledge_base_id`、`agent_name` 等高频查询字段补索引
  - 原因: 后续列表页、绑定裁剪和状态聚合都需要可查询的持久化元数据，不能继续塞进 `~/.config/opencode/opencode.json`

- [x] 在数据库初始化 SQL 中补齐三张表与索引创建
  - 位置: `/Users/liyuan/Work/mothership-beta/src/db/index.ts` 的 `initDb()` SQL 块中，放在 `environment` 索引之后、`scheduled_task` 创建之前（~L153-L166）
  - 追加 `CREATE TABLE IF NOT EXISTS knowledge_base / knowledge_resource / agent_knowledge_binding`
  - 追加 `CREATE INDEX IF NOT EXISTS idx_knowledge_base_user_slug`、`idx_knowledge_resource_kb`、`idx_agent_knowledge_binding_agent` 等索引
  - 不新增破坏性迁移分支；保持和现有 `environment`、`scheduled_task` 一样的“启动时建表”模式
  - 原因: 现有项目没有正式 migration 系统，知识库表必须沿用 `initDb()` 的启动自建策略

- [x] 补齐 OpenViking provider 抽象与 HTTP 适配实现
  - 新建文件: `/Users/liyuan/Work/mothership-beta/src/services/knowledge-provider/types.ts`
  - 定义 `KnowledgeProvider` 接口、`KnowledgeSearchResult`、`KnowledgeResourceSnapshot`、`KnowledgeBaseSnapshot` 等服务端类型；方法签名对齐设计文档中的 `createKnowledgeBase/addResource/listResources/search/readResource`
  - 新建文件: `/Users/liyuan/Work/mothership-beta/src/services/knowledge-provider/openviking.ts`
  - 在文件顶部集中实现 `buildHeaders()`、`requestJson()`、`normalizeProviderError()`、`normalizeStatus()` 辅助函数
  - 在 `OpenVikingKnowledgeProvider` 类中实现五个公开方法，统一用 `fetch` 调远端 HTTP API，并把远端状态映射到本地 `empty/indexing/ready/error`、`pending/processing/ready/error`
  - 原因: 后续知识库服务层、上传编排和检索工具都应只依赖 `KnowledgeProvider` 接口，而不是散落的 OpenViking 接口细节

- [x] 为 schema 与 provider 适配层编写单元测试
  - 测试文件: `/Users/liyuan/Work/mothership-beta/src/__tests__/db-schema.test.ts`
  - 测试场景:
    - `knowledge_base` 列完整性: `PRAGMA table_info(knowledge_base)` → 包含 `slug/status/remote_id/last_error`
    - `knowledge_resource` 外键级联: 删除 `knowledge_base` 记录 → 资源记录同步删除
    - `agent_knowledge_binding` 索引查询字段: 插入绑定记录后按 `agent_name` 查询可命中
  - 测试文件: `/Users/liyuan/Work/mothership-beta/src/__tests__/knowledge-provider-openviking.test.ts`
  - 测试场景:
    - `createKnowledgeBase`: 远端返回 `remoteId/status` → 适配结果包含规范化状态
    - `addResource`: 远端错误响应 → 抛出归一化 `Error.message`
    - `search`: 远端多知识库结果 → 归一化为包含 `title/snippet/source/score/resourceId`
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/db-schema.test.ts src/__tests__/knowledge-provider-openviking.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] Schema 已包含知识库表定义
  - `rg -n "knowledgeBase|knowledgeResource|agentKnowledgeBinding" /Users/liyuan/Work/mothership-beta/src/db/schema.ts`
  - 预期: 输出三张表定义
- [x] 初始化 SQL 已包含知识库建表语句
  - `rg -n "CREATE TABLE IF NOT EXISTS knowledge_base|knowledge_resource|agent_knowledge_binding" /Users/liyuan/Work/mothership-beta/src/db/index.ts`
  - 预期: 三条建表语句均存在
- [x] OpenViking 适配层可通过单测
  - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/knowledge-provider-openviking.test.ts`
  - 预期: 输出包含 `pass`

---

### Task 2: OpenViking 服务接入与部署编排

**背景:**
知识库 provider 适配层只有在独立 `OpenViking` 服务稳定可用时才有意义。当前仓库的 `docker-compose.yml` 只编排了 `rcs`，还没有知识服务、配置挂载、数据卷和健康检查；如果不把这部分单独收口，执行计划的人很容易写完业务代码却没有可用的 HTTP 知识底座。
该 Task 依赖 Task 1 中的运行时配置字段；Task 3-4 的 CRUD、上传和状态同步都默认 `OpenViking` 已经通过 Compose 暴露为可访问的 `http://openviking:1933`。

**涉及文件:**
- 修改: `docker-compose.yml`
- 新建: `deploy/openviking/ov.conf.example`
- 新建: `docs/openviking.md`

**执行步骤:**

- [x] 在 Compose 中新增独立 `openviking` 服务
  - 位置: `/Users/liyuan/Work/mothership-beta/docker-compose.yml` 的 `services:` 段，在现有 `rcs:` 之前新增 `openviking:`
  - 使用官方镜像 `ghcr.io/volcengine/openviking:latest`
  - 暴露端口 `1933:1933`、`8020:8020`
  - 挂载 `./deploy/openviking/ov.conf:/app/ov.conf` 与 `openviking-data:/app/data`
  - 增加健康检查 `curl -fsS http://127.0.0.1:1933/health || exit 1`
  - 原因: 第一阶段已确定用官方镜像提供 HTTP API 和 Console，不再自建 Python 包装服务

- [x] 把 RCS 连接地址改为容器内服务发现地址
  - 位置: `/Users/liyuan/Work/mothership-beta/docker-compose.yml` 的 `rcs.environment` 段（现有 `ACPX_G_URL` 之后）
  - 新增 `RCS_KNOWLEDGE_PROVIDER=openviking`、`RCS_KNOWLEDGE_BASE_URL=http://openviking:1933`、`RCS_KNOWLEDGE_API_KEY=`
  - 在 `rcs` 服务中补 `depends_on: { openviking: { condition: service_healthy } }`
  - 原因: RCS 在 Compose 网络内应通过服务名访问 OpenViking，而不是宿主机端口

- [x] 提供 OpenViking 配置模板文件
  - 新建文件: `/Users/liyuan/Work/mothership-beta/deploy/openviking/ov.conf.example`
  - 写入最小可运行 JSON 配置，至少包含 `storage.workspace`、`embedding.dense`、`vlm` 三段
  - 在文件头部用注释说明复制为 `deploy/openviking/ov.conf` 后再填真实模型配置
  - 原因: 官方镜像必须挂载 `ov.conf`，没有模板会导致执行阶段缺少配置基线

- [x] 增加服务启动与验活文档
  - 新建文件: `/Users/liyuan/Work/mothership-beta/docs/openviking.md`
  - 写明:
    - 配置文件准备位置
    - `docker compose up -d openviking`
    - `curl http://localhost:1933/health`
    - `http://localhost:8020` Console 入口
    - 常见失败排查：模型配置缺失、端口占用、健康检查失败
  - 原因: 本仓库原本没有知识服务运行说明，计划执行后需要有落地文档支撑人工验收

- [x] 为部署编排补结构校验与文档检查
  - 测试文件: 无新增测试文件，使用结构检查命令作为本 Task 的自动化验证
  - 测试场景:
    - Compose 包含 `openviking` 服务与健康检查
    - `ov.conf.example` 存在且包含 `embedding`、`vlm`
    - 文档包含 `docker compose up -d openviking` 与 `/health`
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && rg -n "openviking|1933|8020|healthcheck" docker-compose.yml && rg -n "\"embedding\"|\"vlm\"" deploy/openviking/ov.conf.example && rg -n "docker compose up -d openviking|/health" docs/openviking.md`
  - 预期: 三组检查均有命中

**检查步骤:**

- [x] Compose 已包含 openviking 服务
  - `rg -n "^  openviking:|ghcr.io/volcengine/openviking|1933:1933|8020:8020" /Users/liyuan/Work/mothership-beta/docker-compose.yml`
  - 预期: 匹配到服务名、镜像和端口映射
- [x] RCS 已指向容器内 OpenViking 地址
  - `rg -n "RCS_KNOWLEDGE_BASE_URL=http://openviking:1933|RCS_KNOWLEDGE_PROVIDER=openviking" /Users/liyuan/Work/mothership-beta/docker-compose.yml`
  - 预期: 匹配到两个环境变量
- [x] 配置模板与文档存在
  - `test -f /Users/liyuan/Work/mothership-beta/deploy/openviking/ov.conf.example && test -f /Users/liyuan/Work/mothership-beta/docs/openviking.md && echo OK`
  - 预期: 输出 `OK`

---

### Task 3: 知识库服务层与管理路由

**背景:**
前端需要独立于 Agent 配置页管理知识库实体，但当前 `src/index.ts` 只挂载了 `sessions/environments/api-keys/config/instances/tasks/channels` 等既有路由，根本没有知识库入口。Task 1-2 产出的 schema/provider/服务编排会被本 Task 的服务层直接依赖；Task 4 的资源上传也要复用这里的详情查询和状态聚合逻辑。
经代码确认，现有 `web/config` 只适用于 `providers/models/agents/skills/mcp` 这类配置文件模块，知识库元数据应新增独立 `src/routes/web/knowledge-bases.ts`，而不是继续挤进 `POST /web/config/*`。

**涉及文件:**
- 新建: `src/services/knowledge-base.ts`
- 新建: `src/routes/web/knowledge-bases.ts`
- 修改: `src/index.ts`
- 新建: `src/__tests__/web-knowledge-bases.test.ts`

**执行步骤:**

- [x] 新建知识库服务层，封装数据库 CRUD 与状态聚合
  - 新建文件: `/Users/liyuan/Work/mothership-beta/src/services/knowledge-base.ts`
  - 导出公开方法 `listKnowledgeBasesByUserId()`、`getKnowledgeBaseDetail()`、`createKnowledgeBase()`、`updateKnowledgeBase()`、`deleteKnowledgeBase()`、`countKnowledgeBaseBindings()`
  - 在 `createKnowledgeBase()` 中完成 `slug` 去重校验、调用 `OpenVikingKnowledgeProvider.createKnowledgeBase()`、写入 `knowledge_base` 表
  - 在 `getKnowledgeBaseDetail()` 中聚合 `knowledge_resource` 数量、绑定 agent 数量和最近错误，统一输出给路由层
  - 在 `deleteKnowledgeBase()` 中先删除 `agent_knowledge_binding`，再删除 `knowledge_base` 主记录，保持删除结果幂等
  - 原因: 路由层应保持和 `src/routes/web/environments.ts` 一样的薄控制器模式，业务判断集中在 service

- [x] 新增知识库管理 REST 路由
  - 新建文件: `/Users/liyuan/Work/mothership-beta/src/routes/web/knowledge-bases.ts`
  - 参照 `src/routes/web/environments.ts` 的风格实现:
    - `GET /knowledge-bases`
    - `POST /knowledge-bases`
    - `GET /knowledge-bases/:id`
    - `PATCH /knowledge-bases/:id`
    - `DELETE /knowledge-bases/:id`
  - 统一使用 `sessionAuth`，从 `c.get("user")!.id` 传入 service
  - `POST` 与 `PATCH` 请求体只接受 `name/slug/description` 三个业务字段，不接受客户端直接写 `provider/status/remoteId`
  - `DELETE` 返回 `{ ok: true }` 风格，和现有 `api-keys`、`instances` 删除接口保持一致
  - 原因: 知识库状态只能由服务端和 provider 回写，避免前端越权篡改远端状态

- [x] 将知识库路由挂到主应用
  - 位置: `/Users/liyuan/Work/mothership-beta/src/index.ts` 顶部导入区（现有 `webChannels` 之后，~L18）
  - 新增 `import webKnowledgeBases from "./routes/web/knowledge-bases";`
  - 位置: `/Users/liyuan/Work/mothership-beta/src/index.ts` 的 `/web` 路由挂载区（`app.route("/web", webChannels);` 之后，~L122-L126）
  - 追加 `app.route("/web", webKnowledgeBases);`
  - 原因: 该路由是控制台业务 API，不属于 `/web/config` 模块，也不应进入 ACP 路径

- [x] 为知识库管理 API 编写路由测试
  - 测试文件: `/Users/liyuan/Work/mothership-beta/src/__tests__/web-knowledge-bases.test.ts`
  - 测试场景:
    - `POST /web/knowledge-bases`: 合法 `name/slug` → 返回 `201` 与 `kb_` 前缀 id
    - `GET /web/knowledge-bases`: 多条记录 → 返回当前用户列表和绑定数量摘要
    - `PATCH /web/knowledge-bases/:id`: 更新描述 → `updatedAt` 变化且其他字段保留
    - `DELETE /web/knowledge-bases/:id`: 删除后再次查询 → 返回 `404`
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/web-knowledge-bases.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 主应用已挂载知识库路由
  - `rg -n "webKnowledgeBases|app.route\\(\"/web\", webKnowledgeBases\\)" /Users/liyuan/Work/mothership-beta/src/index.ts`
  - 预期: 同时匹配导入与路由挂载
- [x] 知识库路由包含 CRUD 端点
  - `rg -n "app\\.(get|post|patch|delete)\\(\"/knowledge-bases" /Users/liyuan/Work/mothership-beta/src/routes/web/knowledge-bases.ts`
  - 预期: 匹配到五个端点
- [x] 路由测试通过
  - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/web-knowledge-bases.test.ts`
  - 预期: 输出包含 `pass`

---

### Task 4: 资源上传编排与状态回写

**背景:**
知识库实体创建后还无法承载资源，当前仓库中也没有任何可复用的文件上传入口与知识状态机。Task 3 已提供知识库详情路由，本 Task 在同一条路由文件上扩展资源上传和列表能力，并把远端处理状态与错误信息回写到 `knowledge_resource` / `knowledge_base`。
上游依赖 Task 1 的 provider 适配层和 Task 3 的知识库查询；下游的 Agent 检索与前端详情页都依赖本 Task 写入的资源状态、`lastError` 和资源列表接口。

**涉及文件:**
- 修改: `src/services/knowledge-base.ts`
- 修改: `src/routes/web/knowledge-bases.ts`
- 新建: `src/services/knowledge-upload.ts`
- 新建: `src/__tests__/web-knowledge-resources.test.ts`

**执行步骤:**

- [x] 新建资源上传编排服务，负责临时文件、provider 调用与状态更新
  - 新建文件: `/Users/liyuan/Work/mothership-beta/src/services/knowledge-upload.ts`
  - 导出 `uploadKnowledgeResource()`、`importKnowledgeResourceFromUrl()`、`listKnowledgeResources()`、`refreshKnowledgeResourceStatus()` 四个公开方法
  - 在 `uploadKnowledgeResource()` 中将上传文件先写入 `/Users/liyuan/Work/mothership-beta/data/knowledge-upload/<userId>/<kbId>/`，再调用 `KnowledgeProvider.addResource()`
  - 写入本地记录时先落 `pending`，provider 成功返回后更新 `remoteId/status`；失败时同时回写 `knowledge_resource.lastError` 与 `knowledge_base.lastError`
  - 原因: 设计文档要求“上传文件先进入 RCS 临时区，再由 RCS 转发给 OpenViking”，该临时区不能混入 workspace 文件 API

- [x] 在知识库服务层中补充资源列表与状态汇总输出
  - 位置: `/Users/liyuan/Work/mothership-beta/src/services/knowledge-base.ts` 中 `getKnowledgeBaseDetail()` 的返回组装逻辑
  - 增加 `resourcesCount/recentResources/lastError` 字段，并调用 `listKnowledgeResources()` 聚合前 20 条资源摘要
  - 在 `create/update/delete` 路径中统一通过 `touchKnowledgeBaseUpdatedAt()` 更新父级 `updatedAt`
  - 原因: 前端详情页需要一次请求拿到资源列表和索引状态，不应额外拼多次状态查询

- [x] 在知识库路由中新增资源上传与查询端点
  - 位置: `/Users/liyuan/Work/mothership-beta/src/routes/web/knowledge-bases.ts` 的 CRUD 路由之后
  - 新增:
    - `POST /knowledge-bases/:id/resources/upload`
    - `POST /knowledge-bases/:id/resources/url`
    - `GET /knowledge-bases/:id/resources`
  - `upload` 使用 `await c.req.formData()` 读取 `files` 多文件字段，逐个调用 `uploadKnowledgeResource()`
  - `url` 请求体接受 `url` 与可选 `sourceName`
  - `GET` 返回标准化资源数组，字段包含 `id/sourceName/sourceType/status/lastError/createdAt/updatedAt`
  - 原因: 设计文档已明确把上传与列表拆成独立 API，本阶段不改 SSE，只走轮询查询状态

- [x] 为资源上传与状态回写编写单元测试
  - 测试文件: `/Users/liyuan/Work/mothership-beta/src/__tests__/web-knowledge-resources.test.ts`
  - 测试场景:
    - 文件上传成功: `multipart/form-data` 上传单文件 → 返回 `pending/processing` 且数据库有 `sourcePath`
    - URL 导入失败: provider 抛错 → 响应体包含 `lastError`，知识库主表同步进入 `error`
    - 资源列表查询: 同一知识库存在多条资源 → 按 `updatedAt` 倒序返回
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/web-knowledge-resources.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 资源路由已存在
  - `rg -n "resources/upload|resources/url|resources\\)\" /Users/liyuan/Work/mothership-beta/src/routes/web/knowledge-bases.ts`
  - 预期: 匹配到上传、URL 导入和列表三个端点
- [x] 上传编排服务写入独立临时目录
  - `rg -n "data/knowledge-upload" /Users/liyuan/Work/mothership-beta/src/services/knowledge-upload.ts`
  - 预期: 匹配到固定临时目录常量
- [x] 资源测试通过
  - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/web-knowledge-resources.test.ts`
  - 预期: 输出包含 `pass`

---

### Task 5: 后端基础设施验收

**前置条件:**
- 启动命令: `cd /Users/liyuan/Work/mothership-beta && bun run start`
- 测试数据准备: 设置 `RCS_KNOWLEDGE_BASE_URL` 指向可访问的 OpenViking 测试实例，准备一组可上传的本地文档文件

**端到端验证:**

1. 运行本阶段完整测试套件确保无回归
   - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/db-schema.test.ts src/__tests__/knowledge-provider-openviking.test.ts src/__tests__/web-knowledge-bases.test.ts src/__tests__/web-knowledge-resources.test.ts`
   - 预期: 四个测试文件全部通过
   - 失败排查: 先检查 Task 1 的 schema/provider 单测，再检查 Task 3-4 的路由测试

2. 验证 OpenViking Compose 服务编排已就绪
   - `cd /Users/liyuan/Work/mothership-beta && rg -n "^  openviking:|ghcr.io/volcengine/openviking|1933:1933|8020:8020|healthcheck" docker-compose.yml && test -f deploy/openviking/ov.conf.example && test -f docs/openviking.md`
   - 预期: `docker-compose.yml` 命中镜像、端口和健康检查，模板与文档文件存在
   - 失败排查: 检查 Task 2 的 `docker-compose.yml`、`deploy/openviking/ov.conf.example`、`docs/openviking.md`

3. 验证知识库 CRUD 路由可访问
   - `cd /Users/liyuan/Work/mothership-beta && rg -n "app\\.get\\(\"/knowledge-bases\"|app\\.post\\(\"/knowledge-bases\"|app\\.patch\\(\"/knowledge-bases/:id\"|app\\.delete\\(\"/knowledge-bases/:id\"" src/routes/web/knowledge-bases.ts`
   - 预期: 四类 CRUD 端点全部存在
   - 失败排查: 检查 Task 3 的 `src/routes/web/knowledge-bases.ts`

4. 验证数据库初始化包含知识库三张表
   - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/db-schema.test.ts`
   - 预期: `knowledge_base`、`knowledge_resource`、`agent_knowledge_binding` 相关断言全部通过
   - 失败排查: 检查 Task 1 的 `src/db/schema.ts` 与 `src/db/index.ts`

5. 验证资源上传 API 已落在知识库路由内
   - `cd /Users/liyuan/Work/mothership-beta && rg -n "resources/upload|resources/url|GET /knowledge-bases/:id/resources" src/routes/web/knowledge-bases.ts src/__tests__/web-knowledge-resources.test.ts`
   - 预期: 路由定义与测试覆盖同时存在
   - 失败排查: 检查 Task 4 的上传编排与测试文件
