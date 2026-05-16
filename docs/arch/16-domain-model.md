# 领域模型关联图

> 本文描述 RCS 上层领域概念之间的关联关系，不涉及底层存储细节。

---

## 全局关系图

```text
                          ┌─────────────────────────────────────────────┐
                          │                   User                       │
                          │  系统的用户，通过 email/password 注册          │
                          └──────┬──────────────────────┬───────────────┘
                                 │                      │
                    拥有所有资源   │                      │ 登录后获得
                                 ▼                      ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐│┌──────────┐
│Provider  │  │AgentConfig│  │Skill     │  │API Key    │▼│ Session  │
│AI 服务商 │  │Agent 配置 │  │技能(独立)│  │rcs_xxx 密钥│ │(Cookie)  │
│(含Model) │  └────┬─────┘  └──────────┘  └───────────┘ └──────────┘
└──────────┘       │
     │             │ 引用 Provider 下的 Model
     │             │        绑定知识库
     │             │        指定权限
                   │
                   │ agentConfigId（UUID 强绑定）或 agentName（兼容过渡）
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Environment（环境）                            │
│                                                                      │
│  资源管理层 — 调度 Agent Instance 生命周期，传递 AgentConfig 配置     │
│  职责：                                                              │
│  ① 调度 Instance 的生命周期（spawn / stop / autoStart）              │
│  ② 根据 AgentConfig 拉取 Skill，同步到 workspace                     │
│  ③ 同步 MCP 服务器配置到 workspace                                   │
│  ④ 同步 KnowledgeBase 绑定到 workspace（注入 MCP knowledge 端点）    │
│                                                                      │
│  两种来源：                                                           │
│  ① 用户在控制面板创建（持久，可 autoStart）                            │
│  ② acp-link 通过 /acp/ws 注册（临时，断连即删）                       │
└───────┬──────────────────────┬─────────────────────┬─────────────────┘
        │                      │                     │
   1:N 拥有会话           1:N 可以 spawn         被路由到
        │                      │                     │
        ▼                      ▼                     ▼
┌──────────────┐     ┌────────────────┐     ┌────────────────┐
│   Session    │     │   Instance     │     │Channel Binding │
│   会话       │     │   运行实例     │     │ Channel 绑定   │
│              │     │                │     │                │
│ 一次对话记录 │     │ 一个 acp-link  │     │ 聊天群 → Agent │
│ 关联到某个   │     │ 子进程         │     │ 的路由规则     │
│ Environment  │     │ 独立端口+进程  │     │                │
└──────┬───────┘     └───────┬────────┘     └───────┬────────┘
       │                     │                      │
       │                     │ 消息双向转发          │ IM 消息路由
       │                     │                      │
       │                     ▼                      ▼
       │              ┌────────────────┐     ┌────────────────┐
       │              │  acp-link 进程 │◄────│   Hermes      │
       │              │  (AI Agent 本体)│     │  IM 网关      │
       │              └────────────────┘     └────────────────┘
       │
       │ 关联
       ▼
┌──────────────┐     ┌────────────────┐
│ ScheduledTask│     │ KnowledgeBase  │
│ 定时任务     │     │ 知识库         │
│              │     │                │
│ 指定在哪个   │     │ Agent 通过     │
│ Environment  │     │ binding 关联   │
│ 上执行       │     │                │
└──────┬───────┘     └────────────────┘
       │
  1:N 执行记录
       │
       ▼
┌──────────────┐
│ExecutionLog  │
│ 执行日志     │
└──────────────┘
```

---

## 核心概念详解

### User（用户）

用户是所有资源的所有者。通过 better-auth 注册，登录后获得 cookie session。

用户拥有：Environment、Session、Provider、AgentConfig、Skill、McpServer、KnowledgeBase、ScheduledTask、API Key。

### Environment（环境）

**Environment 是 RCS 的资源管理层**。它不直接承载业务逻辑，而是负责调度和管理 Agent 运行所需的各类资源。

**核心职责**：

1. **调度 Instance 生命周期**：根据策略决定是否 spawn 新的 Instance（`spawn / stop / autoStart`），统一管理 spawn 决策
2. **根据 AgentConfig 拉取 Skill**：spawn 时将 AgentConfig 关联的 Skill 同步到 workspace
3. **同步 MCP 服务器配置**：将 AgentConfig 中配置的 MCP 服务器（包括 KnowledgeBase 的 MCP 端点）写入 workspace
4. **同步 KnowledgeBase 绑定**：通过 MCP knowledge 端点将知识库注入 Agent 运行环境

关键属性：

- **workspacePath**：Agent 的工作目录（如 `/home/user/my-project`）
- **agentName**：指定用哪个 AgentConfig（如 `build`、`general`）
- **status**：`idle`（未运行）、`active`（在线）、`disconnected`（已断连）
- **secret**：认证令牌，acp-link 和 instance 用它连接 RCS
- **autoStart**：服务器启动时是否自动 spawn 实例
- **maxSessions**：并发实例上限

**两种生命周期**：

1. **持久环境**：用户在控制面板创建，存在数据库里。断连后保留，可重新 spawn。
2. **临时环境**：acp-link 通过 `/acp/ws` 直接注册，只存在于连接期间。WebSocket 断开即删除。

**和 AgentConfig 的关系**：Environment 通过 `agentName` 字段引用 AgentConfig。spawn Instance 时，Environment 作为配置传递层，将 AgentConfig 的完整配置（Model、Skill、MCP、Permission 等）注入 workspace。

**和 Instance 的关系**：Environment 调度 Instance，不是 Instance 的容器。Instance 是进程级别的概念，由 Environment 按需 spawn 和管理。一个 Environment 可以有多个 Instance（受 maxSessions 限制）。

### Instance（运行实例）

Instance 是一个 **acp-link 子进程**。当用户要和 Environment 里的 Agent 对话时，RCS 会 spawn 一个 acp-link 进程作为本地代理。

一个 Environment 可以有**多个 Instance**（多实例），每个有独立的端口和进程。

Instance 只存在于内存——它是进程级别的概念，服务器重启就没了。

**和 Environment 的关系**：Instance 由 Environment 调度 spawn。Environment 作为资源管理层，决定何时 spawn Instance（用户手动、autoStart、IM 消息触发等）。spawn 时，Environment 将 workspacePath、AgentConfig 配置（Model、Skill、MCP、Permission 等）注入 Instance 的 workspace。

**生命周期**：

```text
spawn（用户点击"启动"或 autoStart）
  → 分配端口（8888-8999）
  → spawn acp-link 子进程
  → 从 stdout 捕获 auth token
  → status = "running"

stop（用户点击"停止"或服务器关闭）
  → 关闭 relay 的本地 WS
  → SIGTERM 子进程
  → 5 秒后 SIGKILL
  → status = "stopped"
```

### Session（会话）

Session 是一次**对话记录**。用户和 Agent 之间的聊天历史都关联到一个 Session。

**和 Environment 的关系**：一个 Environment 可以有多个 Session。Session 的 `environmentId` 指向所属的 Environment。

**和 Instance 的关系**：Instance spawn 时会关联一个 Session（`instance.sessionId`）。这个 Session 是 Environment 下找到或创建的第一个。多实例时，每个 Instance 可以关联不同的 Session。

**ID 格式**：

- `session_xxx`：标准 Web Session
- `cse_xxx`：Code Session（v2 协议）
- `ses_xxx`：ACP Agent 返回的 Session ID（前端使用的格式）

前端需要通过 `resolveExistingSessionId` 在这些格式间转换。

### AgentConfig（Agent 配置）

AgentConfig 定义了一个 Agent 的**行为参数**：

- 用哪个 Model（`model` 字段）
- 系统提示词（`prompt`）
- 权限规则（`permission`：哪些工具可以自动执行、哪些需要确认）
- 关联哪些知识库（`knowledge` JSONB）
- 运行参数（steps、temperature、topP 等）

**内置 Agent**：`build`、`plan`、`general`、`explore`、`title`、`summary`、`compaction`——这些不能删除，但可以修改配置。

**和 Environment 的关系**：Environment 的 `agentName` 引用 AgentConfig 的 `name`。

**和 KnowledgeBase 的关系**：通过 `agent_knowledge_binding` 表做多对多绑定。AgentConfig 的 `knowledge` JSONB 字段存储知识库 ID 列表，`agent-knowledge.ts` 的 `syncAgentKnowledgeBindings()` 负责同步到 binding 表。

### Provider（服务商，包含 Model）

Provider 是 AI 服务商（如 OpenAI、Anthropic）。Model 是 Provider 的子属性，不作为独立领域概念。

- 一个 Provider 包含多个 Model（1:N）
- Model 的数据层面仍有独立的 DB 表（`model`），但上层领域概念中 Model 归属于 Provider
- AgentConfig 的 `model` 字段引用 Provider 下的某个 Model ID（字符串匹配，非外键）
- Provider 的 `apiKey` 存储在数据库中（响应只返回 keyHint）
- Model 的管理入口在 Provider 详情页内，不再有独立的 Model 列表页

### McpServer（MCP 服务器）— 独立资源

MCP (Model Context Protocol) 服务器是给 Agent 提供外部工具的**独立资源**，与 AgentConfig 是引用关系，不是包含关系。

两种类型：
- **local**：通过命令行启动（如 `npx -y @modelcontextprotocol/server-github`）
- **remote**：通过 URL 连接

McpServer 的配置在 Agent 运行时通过 workspace 的 `.opencode/opencode.json` 注入。

### Skill（技能）— 独立资源

Skill 是 Markdown 格式的指令文件（SKILL.md），给 Agent 补充特定领域的知识和操作指南。

- 元数据存在数据库，内容存在文件系统 `~/.agents/skills/<name>/SKILL.md`
- 支持两种 scope：全局（不绑定环境）和 workspace（绑定到特定 Environment）

### Channel Binding（Channel 绑定）

Channel Binding 定义了一条**路由规则**：来自某个聊天平台某个群的消息，转发给哪个 Agent。

```
Channel Binding:
  platform = "feishu"        ← 哪个平台
  chatId  = "oc_xxxxx"       ← 哪个聊天群（null = 通配符，匹配该平台所有群）
  agentId = "env_xxxxx"      ← 转发给哪个 Environment 的 Agent
```

匹配规则：精确匹配优先（platform + chatId 完全匹配），找不到就找通配符（platform 匹配但 chatId 为 null）。

**和 Environment 的关系**：`agentId` 就是 Environment 的 ID。消息路由时，先通过 binding 找到 Environment，再查找该 Environment 的 running Instance 或 ACP WS 连接来发送消息。

### ScheduledTask（定时任务）

定时任务定义了"在什么时间、对哪个 Agent、执行什么任务"。

- `cron`：执行周期（如 `0 9 * * *` = 每天早上 9 点）
- `environmentId`：在哪个 Environment 上执行
- `task`：任务描述文本
- 每次执行产生一条 ExecutionLog

**和 Environment 的关系**：Task 绑定到一个 Environment。执行时，找到该 Environment 的 running Instance 发送 prompt。如果没有 Instance，会通过 `opencode run` 直接 spawn 一个临时进程执行。

### KnowledgeBase（知识库）

知识库是用户上传的文档集合，建立向量索引后供 Agent 查询。

**和 AgentConfig 的关系**：通过 `agent_knowledge_binding` 表做**多对多**绑定。一个 Agent 可以查多个知识库，一个知识库可以给多个 Agent 用。

**和 Environment 的关系**：Environment 作为资源管理层，在 spawn Instance 时，根据 AgentConfig 的知识库绑定，在 workspace 配置中注入 MCP knowledge 端点，让 Agent 运行时可以查询。Environment 不直接管理 KnowledgeBase，只负责传递 AgentConfig 中配置的知识库引用。

### Hermes（IM 网关）

Hermes 是 RCS 外部的独立服务，负责对接各种聊天平台（飞书、Telegram、Discord 等）。

RCS 内部的 HermesClient 是一个 WebSocket 客户端，连接 Hermes 后：

1. **收消息**：Hermes 转发聊天消息 → HermesClient → 查 Channel Binding → 路由到对应 Agent
2. **发回复**：订阅 Agent 的 EventBus → 积累 streaming 输出 → prompt_complete 时把完整回复发回 Hermes

---

## 关键关联总结

```text
Environment（环境 / 资源管理层）
  ├── 职责：调度 Instance 生命周期 + 传递 AgentConfig 配置
  ├── 1:N ── Instance（由 Environment 调度 spawn，内存态）
  ├── 1:N ── Session（会话）
  ├── 1:N ── ScheduledTask（定时任务）
  ├── N:1 ── AgentConfig（通过 agentName 字符串匹配，待改为 ID 强绑定）
  └── 1:1 ── ChannelBinding（agentId = environmentId）

AgentConfig（Agent 配置）
  ├── N:1 ── Model（通过 model 字符串匹配，Model 为 Provider 子属性）
  └── M:N ── KnowledgeBase（通过 agent_knowledge_binding 表）

Provider（服务商，包含 Model）
  └── 1:N ── Model（数据层面独立表，领域层面为 Provider 子属性）

Skill（技能）— 独立资源
  └── N:1 ── User（通过 userId）

McpServer（MCP 服务器）— 独立资源
  └── N:1 ── User（通过 userId）

KnowledgeBase（知识库）
  ├── 1:N ── KnowledgeResource（知识资源/文件）
  └── M:N ── AgentConfig（通过 binding 表）

ScheduledTask（定时任务）
  ├── N:1 ── Environment（外键）
  └── 1:N ── ExecutionLog（执行日志）

User（用户）
  └── 1:N ── 所有上述资源（通过 userId 字段）
```

---

## 消息怎么流转

理解领域关联后，最常问的问题是"消息怎么从一端到另一端"。三种入口的消息流：

### 前端发消息给 Agent

```text
前端 → WS /acp/relay/:agentId
          │
          ▼
     有 running Instance？
       │         │
      YES        NO
       │         │
       ▼         ▼
    本地 WS    ACP EventBus → acp-link WS
       │
       ▼
    acp-link 进程 → opencode Agent
```

### 聊天平台发消息给 Agent

```text
飞书/Telegram → Hermes 网关
                    │
                    ▼
              HermesClient（RCS 内）
                    │
                    ▼
           Channel Binding 匹配
           （platform + chatId → agentId）
                    │
                    ▼
           找到 Environment 的 Instance
                    │
                    ▼
           本地 WS → acp-link → Agent

           Agent 回复 → EventBus inbound
                    │
                    ▼
           HermesClient 订阅到 prompt_complete
                    │
                    ▼
           Hermes.send() → 聊天平台
```

### 定时任务执行

```text
cron 触发 → ScheduledTask
              │
              ▼
         查 Task 的 environmentId
              │
              ▼
         找 running Instance
           │         │
          YES        NO
           │         │
           ▼         ▼
        发 prompt   spawn opencode run
        到 Instance  临时进程执行
           │
           ▼
        Agent 执行 → 记录 ExecutionLog
```
