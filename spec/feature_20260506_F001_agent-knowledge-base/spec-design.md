# Feature: 20260506_F001 - agent-knowledge-base

## 需求背景

当前 RCS 已具备以下基础能力：

- 前端配置页可管理 `agents`、`skills`、`mcp`
- 后端可为 environment 绑定默认 agent，并在实例启动时写入 workspace 下的 `.opencode/opencode.json`
- Agent 侧已经具备通过 MCP / 工具主动调用外部能力的扩展基础

但系统尚未提供“知识库”能力，导致以下问题：

- 用户无法在控制台中上传项目知识、文档、规范、示例代码等上下文材料
- Agent 无法按需检索项目知识，只能依赖 prompt、skill 或用户临时粘贴内容
- 项目级知识与 Agent 配置、MCP 配置、Skill 配置之间没有统一关联关系

本 feature 的目标是在 RCS 中引入第一阶段知识库能力，并明确采用现成开源项目 `OpenViking` 作为知识底座，优先完成接入和管理能力，后续再视使用效果决定是否做定制化替换或增强。

## 目标

- 在 RCS 控制台新增知识库管理能力，支持创建知识库、上传资源、查看索引状态
- 支持在 Agent 配置中绑定一个或多个知识库，但仅保存引用关系，不写入知识正文
- 支持 Agent 通过检索工具使用知识库，第一阶段采用 `OpenViking` 独立服务承载知识存储与检索
- 保持现有 ACP / relay / environment 启动链路稳定，第一阶段不改 ACP 协议，不做 system prompt 大规模注入

## 方案设计

### 总体架构

第一阶段采用“RCS 控制面 + OpenViking 独立知识服务 + Agent 检索工具”三层结构：

```text
Web UI
  │
  ▼
RCS (Hono + Bun)
  │
  ├── Knowledge Base 管理 API
  ├── Agent 绑定配置
  ├── 上传编排 / 权限控制 / 状态聚合
  └── MCP / Tool 暴露层
          │
          ▼
OpenViking Service
  ├── Resource ingest
  ├── Skill / Resource tree
  ├── Semantic indexing
  └── Retrieval / Read API
          │
          ▼
Agent (via MCP/tool)
```

职责划分如下：

- `RCS` 负责用户侧管理体验、Agent 绑定关系、上传入口、鉴权、运行时知识权限裁剪
- `OpenViking` 负责知识资源存储、解析、分层组织、向量化与检索
- `Agent` 通过 MCP 或内置工具按需检索知识库，不直接持有知识全集

该结构保证后续若替换 `OpenViking` 为自研服务，RCS 上层 UI / API / Agent 配置模型可以保持稳定。

### 为什么不采用 ACP 注入 system

本方案明确不将知识正文通过 ACP 直接注入 system prompt，原因如下：

- 当前实例启动链路只负责注入 `default_agent`，并未提供稳定的“服务端动态拼接 system prompt”机制
- 知识库通常体量较大，直接注入会带来 token 成本、截断风险、更新滞后问题
- 注入式方案无法天然支持来源引用、按需检索、命中可观测性与权限过滤
- 一旦后续知识库更换实现，prompt 注入方案难以抽象为统一接口

第一阶段仅允许在 agent prompt 中加入轻量规则，例如：

- 涉及项目知识时优先检索知识库
- 回答时优先引用检索结果
- 检索无结果时再回退为通用推理

换言之，`system` 只承载“检索策略”，不承载“知识内容”。

### 为什么主路径选择 MCP / Tool

推荐 Agent 使用知识库的主路径为 `MCP/tool` 调用，而不是 skill 本体或 prompt 注入。

原因如下：

- 检索是运行时、按需、可裁剪的行为，更适合建模为工具调用
- MCP 已经是现有系统中的受支持扩展面，前后端均已有配置和管理能力
- 工具调用可天然返回结构化结果，例如片段、标题、资源路径、摘要、分数、来源 URI
- 后续不论底层是 `OpenViking`、自研 RAG，还是外部托管知识服务，上层工具协议都可以维持稳定

Skill 在该方案中仍有价值，但角色应是“检索策略封装”，而不是“知识内容承载”。例如后续可以提供一个内置 skill：

- `project-kb-search`: 指导 Agent 在回答项目信息前先调用检索工具

### 分期范围

#### Phase 1：接入与可用性优先

第一阶段仅完成以下能力：

- 知识库基础数据模型与 CRUD
- 上传资源到知识库
- 触发 `OpenViking` ingest / add_resource
- 展示资源列表、索引状态、最近错误
- Agent 与知识库的绑定关系管理
- 暴露 `kb_search` / `kb_read` 检索工具

第一阶段不包含：

- 复杂召回策略调优
- 多租户跨用户共享知识库
- 自动增量同步 Git 仓库
- 检索命中重排与多路召回融合
- 基于对话自动写回长期记忆

#### Phase 2：增强检索策略

后续可迭代：

- 目录级 / tag 级知识权限
- 搜索模板和查询扩写
- Agent 自动检索策略与引用格式约束
- 与 workflow / task 调度场景打通

### 数据模型设计

第一阶段不将知识库正文、切片、向量索引存入 `~/.config/opencode/opencode.json`。该配置文件只适合轻量配置，不适合承载高频状态与大体量知识元数据。

RCS 侧新增数据库表用于管理知识库元数据与绑定关系，建议模型如下：

#### `knowledgeBase`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | 主键，`kb_xxx` |
| `userId` | text | 所属用户 |
| `name` | text | 展示名称，用户可编辑 |
| `slug` | text | 稳定标识，kebab-case，用户内唯一 |
| `description` | text nullable | 描述 |
| `provider` | text | 固定为 `openviking`，为后续替换预留 |
| `remoteId` | text nullable | OpenViking 中对应的 knowledge/resource 根标识 |
| `status` | text | `empty` / `indexing` / `ready` / `error` |
| `lastError` | text nullable | 最近一次索引错误 |
| `createdAt` | integer | 创建时间 |
| `updatedAt` | integer | 更新时间 |

#### `knowledgeResource`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | 主键 |
| `knowledgeBaseId` | text | 所属知识库 |
| `sourceType` | text | `upload` / `url` / `directory` |
| `sourceName` | text | 文件名或来源名 |
| `sourcePath` | text nullable | RCS 本地缓存路径或来源路径 |
| `remoteId` | text nullable | OpenViking resource id |
| `status` | text | `pending` / `processing` / `ready` / `error` |
| `lastError` | text nullable | 最近一次处理错误 |
| `createdAt` | integer | 创建时间 |
| `updatedAt` | integer | 更新时间 |

#### `agentKnowledgeBinding`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | text | 主键 |
| `agentName` | text | 绑定的 agent 名 |
| `knowledgeBaseId` | text | 绑定的知识库 id |
| `priority` | integer | 顺序，数值越小越优先 |
| `enabled` | integer | 是否启用 |

其中：

- `knowledgeBase` 和 `knowledgeResource` 放在 SQLite 中，便于做状态展示、重试、错误追踪
- Agent 配置中只保存“引用型字段”，不保存知识正文

### Agent 配置扩展

当前 agent 配置白名单仅允许如下字段：`model`、`prompt`、`steps`、`mode`、`permission`、`variant`、`temperature`、`top_p`、`disable`、`hidden`、`color`、`description`。

为支持知识库绑定，建议新增以下字段：

```ts
type AgentKnowledgePolicy = {
  searchFirst?: boolean;
  maxResults?: number;
  defaultNamespaces?: string[];
};

type AgentKnowledgeConfig = {
  knowledgeBaseIds: string[];
  policy?: AgentKnowledgePolicy;
};
```

最终写入 agent 配置的字段建议为：

```json
{
  "knowledge": {
    "knowledgeBaseIds": ["kb_proj_docs", "kb_api_refs"],
    "policy": {
      "searchFirst": true,
      "maxResults": 5
    }
  }
}
```

设计原则：

- `knowledgeBaseIds` 只存 RCS 内部 knowledge base id，不直接暴露 OpenViking 原始 id
- `policy` 只描述默认检索策略，不控制底层知识内容
- 若 agent 未绑定知识库，则 `kb_search` 工具默认不可用或返回空集合

### OpenViking 接入方式

第一阶段将 `OpenViking` 视为独立服务，RCS 通过 HTTP API 与其交互。

RCS 侧新增一个 `knowledge-provider/openviking.ts` 适配层，屏蔽以下细节：

- 服务地址与认证
- `add_resource`、资源查询、检索查询等具体接口格式
- 上传文件时的临时文件处理
- 异步索引状态查询与错误归一化

适配层对上暴露统一接口：

```ts
interface KnowledgeProvider {
  createKnowledgeBase(input: { slug: string; name: string; description?: string }): Promise<{ remoteId: string }>;
  addResource(input: { knowledgeBaseRemoteId: string; filePath?: string; url?: string; wait?: boolean }): Promise<{ resourceRemoteId: string }>;
  listResources(input: { knowledgeBaseRemoteId: string }): Promise<Array<...>>;
  search(input: {
    knowledgeBaseRemoteIds: string[];
    query: string;
    topK: number;
  }): Promise<Array<...>>;
  readResource(input: { resourceRemoteId: string }): Promise<...>;
}
```

这样后续替换底层知识服务时，只需改适配层，不需要重写页面和 Agent 接口。

### API 设计

#### 1. 知识库管理 API

新增基础路由：

- `GET /web/knowledge-bases`
- `POST /web/knowledge-bases`
- `GET /web/knowledge-bases/:id`
- `PATCH /web/knowledge-bases/:id`
- `DELETE /web/knowledge-bases/:id`

返回字段重点包括：

- 基本元信息
- 当前状态
- 已绑定 agent 数量
- 资源数量
- 最近错误

#### 2. 资源上传 API

新增：

- `POST /web/knowledge-bases/:id/resources/upload`
- `POST /web/knowledge-bases/:id/resources/url`
- `GET /web/knowledge-bases/:id/resources`

行为约束：

- 上传文件先进入 RCS 临时区，再由 RCS 转发给 `OpenViking`
- 上传结果立即返回 `pending/processing`
- 前端轮询或 SSE 获取状态更新

#### 3. Agent 绑定 API

建议将绑定能力合并进现有 agent config API，而不是做独立配置模块，避免用户理解负担。

新增/扩展：

- `POST /web/config/agents` 的 `get/set/create`
- 支持读写 `knowledge` 字段
- `list` 返回可选摘要，例如已绑定知识库数量

#### 4. 检索工具 API

第一阶段提供两种暴露方式，选其一实现即可，推荐优先 MCP：

- 方式 A：RCS 内置一个 MCP server，向 Agent 暴露 `kb_search` / `kb_read`
- 方式 B：RCS 直接在 Agent 运行环境中注册内置工具

推荐 A 的原因：

- 与现有 MCP 页面和工具发现能力一致
- 边界清晰，后续可单独演进
- 更容易复用到不同 agent / workflow 场景

### 检索工具协议

建议最小工具集如下：

#### `kb_search`

输入：

```json
{
  "query": "如何启动 workflow proxy",
  "agentName": "general",
  "topK": 5
}
```

处理规则：

- 服务端根据 `agentName` 查出已绑定且启用的知识库
- 将这些知识库映射为对应的 `OpenViking` remote ids
- 调用 `OpenViking` 检索
- 对结果做归一化并返回

输出：

```json
{
  "results": [
    {
      "title": "workflow proxy 设计",
      "snippet": "...",
      "source": "kb://agent-knowledge-base/spec-design.md",
      "score": 0.91,
      "knowledgeBaseId": "kb_proj_docs",
      "resourceId": "res_xxx"
    }
  ]
}
```

#### `kb_read`

输入：

```json
{
  "resourceId": "res_xxx"
}
```

输出：

- 返回更完整的资源内容、摘要或章节内容
- 供 Agent 在 search 命中后进一步展开阅读

### 前端交互设计

#### 1. 控制台新增知识库入口

新增一级页面 `KnowledgeBasesPage.tsx`，风格对齐现有配置页。

列表字段建议：

- 名称
- 状态
- 资源数
- 最近更新时间
- 绑定 agent 数

详情视图建议包含：

- 基本信息
- 资源列表
- 上传入口
- 索引状态 / 错误信息
- 绑定的 agents

#### 2. 上传体验

第一阶段优先支持：

- 单文件上传
- 多文件批量上传
- 目录上传（若浏览器能力允许）
- URL 导入（可选）

可直接复用现有 `SkillsPage` 的目录上传交互结构，但知识库上传不要求 `SKILL.md` 约束。

#### 3. Agent 配置页集成

在 `AgentsPage` 编辑弹窗中新增“知识库”页签或区块，支持：

- 多选知识库
- 设置默认检索数 `maxResults`
- 设置 `searchFirst`

默认不在 agent 列表页展示过多知识库细节，只展示数量摘要即可，避免表格过重。

### 与现有 environment / instance 流程的关系

该方案不修改现有 environment / instance 的主链路，只做两点最小关联：

- environment 仍通过 `agentName` 选择默认 agent
- instance 启动后，agent 若具备 `kb_search` 工具能力，即可按其 agent 配置绑定自动访问对应知识库

也就是说：

- 不需要在 `spawnInstanceFromEnvironment` 中写入知识正文
- 不需要修改 ACP session/list、relay、keep_alive 逻辑
- 不需要改文件 API 和 workspace 路由

这可显著降低回归风险。

## 实现要点

1. `OpenViking` 必须以独立服务方式接入，RCS 不直接内嵌其运行时，避免 Bun/Node 与 Python 进程深度耦合。
2. 知识库元数据必须落 SQLite，而不是继续塞进全局配置文件。
3. Agent 配置只保存知识库引用和策略，不能保存知识正文或切片结果。
4. 检索权限必须在 RCS 服务端根据 agent 绑定关系裁剪，不能让 Agent 任意指定 knowledge base id 越权查询。
5. `kb_search` 返回结果需要包含来源信息，保证 Agent 可引用、可解释、可审计。
6. 第一阶段只做“资源型知识库”，不引入自动记忆写回，避免把长期 memory 和项目知识混在一起。
7. 若 `OpenViking` 暂时不支持某些资源状态查询，RCS 需自行维护最小状态机并允许用户手动重试。

## 约束一致性

当前仓库下不存在 `spec/global/constraints.md` 与 `spec/global/architecture.md`，因此本节仅说明与现有代码结构的一致性：

- 遵循现有后端分层：路由放在 `src/routes/web/`，业务逻辑放在 `src/services/`
- 前端保持现有配置页与控制台页面模式，不额外引入新的前端状态管理框架
- 不修改 ACP 协议和 relay 主路径，避免影响现有 environment / session / instance 能力
- 复用现有 MCP 扩展思路，而不是新增并行的 agent 外挂协议

## 验收标准

- [ ] 控制台新增知识库页面，支持查看知识库列表与详情
- [ ] 用户可创建、编辑、删除知识库，并看到 `empty`、`indexing`、`ready`、`error` 等状态
- [ ] 用户可向知识库上传文件资源，RCS 能成功调用 `OpenViking` 完成资源导入
- [ ] 资源导入失败时，前端可看到错误状态与最近错误信息
- [ ] Agent 配置页支持绑定一个或多个知识库，并保存 `knowledge` 配置字段
- [ ] 已绑定知识库的 Agent 在运行时可通过 `kb_search` 工具检索知识内容
- [ ] `kb_search` 返回结果包含知识库来源信息，供 Agent 引用和追溯
- [ ] 第一阶段实现不修改 ACP 协议，不在 system prompt 中注入大体量知识正文
