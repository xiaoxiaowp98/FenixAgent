# Agent 知识库执行计划（二）：运行时集成与前端控制台

**目标:** 将知识库与 Agent 配置、运行时检索工具和前端控制台串起来，实现可配置、可上传、可检索的一阶段知识库能力。

**技术栈:** Bun + Hono + React 19 + TypeScript + MCP SDK + bun:test + Vite

**设计文档:** spec/feature_20260506_F001_agent-knowledge-base/spec-design.md

## 改动总览

本计划基于 `spec-plan-1.md` 的数据库、OpenViking 服务编排和知识库 API 继续集成运行时链路。Task 0 只做轻量前置确认；Task 4 扩展 Agent 配置与绑定同步；Task 5 新增服务端知识检索 MCP endpoint，并在实例启动时把知识检索能力写入 workspace `.opencode/opencode.json`；Task 6 新建知识库页面、路由与 API client；Task 7 在 Agent 编辑弹窗中加入知识库绑定页签。经代码确认，仓库目前没有服务端 MCP runtime，因此本计划明确新建一条独立的知识 MCP 路由，而不是复用现有 `config/mcp` inspector 代码。

---

### Task 0: 环境准备（轻量验证）

**背景:**
`spec-plan-1.md` 已完成完整后端环境验证，本文件只确认知识库基础 API 已准备好，避免在前端和运行时集成时重复排查底层问题。

**执行步骤:**

- [x] 确认知识库后端路由文件已存在
  - 运行: `test -f /Users/liyuan/Work/mothership-beta/src/routes/web/knowledge-bases.ts && echo OK`
  - 预期: 输出 `OK`

**检查步骤:**

- [x] 基础路由文件存在
  - `test -f /Users/liyuan/Work/mothership-beta/src/routes/web/knowledge-bases.ts && echo OK`
  - 预期: 输出 `OK`
- [x] 基础后端测试仍可执行
  - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/web-knowledge-bases.test.ts 2>&1 | tail -5`
  - 预期: 输出包含 `pass`

---

### Task 4: Agent 知识绑定与配置 API 扩展

**背景:**
当前 `src/routes/web/config/agents.ts` 的 `AGENT_SETTABLE_FIELDS` 只允许 `model/prompt/steps/mode/permission/...` 等字段，`handleList/handleGet/handleSet/handleCreate` 也完全不知道知识库绑定。知识库页面能创建资源还不够，必须把“Agent 绑定哪些知识库、默认检索策略是什么”写回配置并同步到数据库绑定表，后续运行时检索和前端摘要才有来源。
该 Task 直接修改已有 Agent 配置调用链：`web/src/api/client.ts` 的 `apiListAgents/apiGetAgent/apiSetAgent/apiCreateAgent` 被 `AgentsPage`、`EnvironmentsPage`、`Dashboard` 调用，因此返回结构必须向后兼容并只追加知识字段。

**涉及文件:**
- 修改: `src/routes/web/config/agents.ts`
- 新建: `src/services/agent-knowledge.ts`
- 修改: `web/src/types/config.ts`
- 修改: `web/src/api/client.ts`
- 修改: `src/__tests__/config-agents.test.ts`
- 新建: `src/__tests__/agent-knowledge.test.ts`

**执行步骤:**

- [x] 新建 Agent 知识绑定服务，集中维护配置字段与绑定表同步
  - 新建文件: `/Users/liyuan/Work/mothership-beta/src/services/agent-knowledge.ts`
  - 导出 `syncAgentKnowledgeBindings()`、`listAgentKnowledgeBindings()`、`resolveAgentKnowledgePolicy()`、`countBindingsByKnowledgeBaseIds()` 四个公开方法
  - `syncAgentKnowledgeBindings()` 以 `agentName + knowledgeBaseIds + policy` 为输入，先清理旧绑定，再按数组顺序写入 `agent_knowledge_binding.priority`
  - `resolveAgentKnowledgePolicy()` 统一返回 `searchFirst/maxResults/defaultNamespaces` 的默认值对象，供运行时工具复用
  - 原因: Agent 配置文件和数据库绑定表必须保持单一写入口，否则 `knowledge.knowledgeBaseIds` 与 `agent_knowledge_binding` 会漂移

- [x] 在 Agents 配置路由中加入 `knowledge` 字段白名单和读写逻辑
  - 位置: `/Users/liyuan/Work/mothership-beta/src/routes/web/config/agents.ts` 的 `AGENT_SETTABLE_FIELDS` 集合（~L33-L36）
  - 追加 `knowledge`
  - 在文件顶部新增 `AgentKnowledgePolicy`、`AgentKnowledgeConfig` 类型，并补 `validateKnowledgeConfig()` 校验函数
  - 在 `handleList()` 中追加 `knowledgeBaseCount` 摘要字段；该字段通过 `listAgentKnowledgeBindings()` 计算，不从原始配置推导
  - 在 `handleGet()` 返回值中追加 `knowledge: agent.knowledge ?? null`
  - 在 `handleSet()` 与 `handleCreate()` 中，在 `modifySection("agent", ...)` 写配置完成后调用 `syncAgentKnowledgeBindings(name, filtered.knowledge)`
  - 原因: 现有 `handleSet/handleCreate` 已是 Agent 配置唯一写入口，把绑定同步放这里改动面最小

- [x] 扩展前端配置类型与 API client，保持现有调用点兼容
  - 位置: `/Users/liyuan/Work/mothership-beta/web/src/types/config.ts` 的 `OpenCodeAgent`、`AgentInfo`、`AgentDetail` 定义区域（~L55-L72、~L150-L190）
  - 新增 `AgentKnowledgePolicy`、`AgentKnowledgeConfig` 类型
  - 在 `AgentInfo` 中追加 `knowledgeBaseCount: number`
  - 在 `AgentDetail` 中追加 `knowledge: AgentKnowledgeConfig | null`
  - 位置: `/Users/liyuan/Work/mothership-beta/web/src/api/client.ts` 的 Agent API 段（~L256-L275）
  - 维持函数名不变，只让 `apiListAgents()` 与 `apiGetAgent()` 自动返回新字段
  - 原因: `AgentsPage`、`Dashboard`、`EnvironmentsPage` 依赖这些类型，改 API 结构不能破坏现有调用

- [x] 为 Agent 知识绑定逻辑编写单元测试
  - 测试文件: `/Users/liyuan/Work/mothership-beta/src/__tests__/config-agents.test.ts`
  - 测试场景:
    - `get` 返回 `knowledge` 字段: 配置存在 `knowledgeBaseIds/policy` → 响应原样返回
    - `set` 更新 `knowledge`: 发送新 `knowledgeBaseIds` → 配置写入且旧绑定被覆盖
    - `list` 返回 `knowledgeBaseCount`: Agent 绑定两个知识库 → 摘要为 `2`
  - 测试文件: `/Users/liyuan/Work/mothership-beta/src/__tests__/agent-knowledge.test.ts`
  - 测试场景:
    - `syncAgentKnowledgeBindings`: 新旧绑定切换 → 仅保留新集合且 `priority` 顺序正确
    - `resolveAgentKnowledgePolicy`: 缺省配置 → 返回默认 `searchFirst/maxResults`
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/config-agents.test.ts src/__tests__/agent-knowledge.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] Agent 路由已允许写入 knowledge
  - `rg -n "\"knowledge\"|knowledgeBaseCount|syncAgentKnowledgeBindings" /Users/liyuan/Work/mothership-beta/src/routes/web/config/agents.ts`
  - 预期: 同时匹配字段白名单、摘要字段和同步调用
- [x] 前端 Agent 类型已包含 knowledge
  - `rg -n "AgentKnowledgeConfig|knowledgeBaseCount|knowledge:" /Users/liyuan/Work/mothership-beta/web/src/types/config.ts`
  - 预期: 类型定义存在
- [x] Agent 绑定测试通过
  - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/config-agents.test.ts src/__tests__/agent-knowledge.test.ts`
  - 预期: 输出包含 `pass`

---

### Task 5: 服务端知识检索 MCP 接口与实例注入

**背景:**
设计文档推荐 MCP/tool 作为主路径，但当前仓库只有 `src/services/mcp-inspector.ts` 这样的远端检查能力，没有任何服务端 MCP runtime，也没有在 `spawnInstanceFromEnvironment()` 中写入知识相关配置。为了不改 ACP 协议，本 Task 新增一条 RCS 自己暴露的知识检索 MCP endpoint，并在实例启动时按默认 Agent 绑定把 MCP remote server 配置写进 workspace `.opencode/opencode.json`。
上游依赖 Task 4 的 Agent 绑定解析；下游的 Agent 实际检索能力与端到端验收都依赖本 Task 注入的 `kb_search` / `kb_read` 工具。

**涉及文件:**
- 新建: `src/services/knowledge-runtime.ts`
- 新建: `src/routes/mcp/knowledge.ts`
- 修改: `src/index.ts`
- 修改: `src/services/instance.ts`
- 新建: `src/__tests__/knowledge-mcp-route.test.ts`
- 修改: `src/__tests__/instance-service.test.ts`

**执行步骤:**

- [x] 新建运行时知识服务，封装权限裁剪与 provider 检索
  - 新建文件: `/Users/liyuan/Work/mothership-beta/src/services/knowledge-runtime.ts`
  - 导出 `searchKnowledgeForAgent()`、`readKnowledgeResourceForAgent()`、`resolveBoundKnowledgeBasesForAgent()` 三个公开方法
  - `searchKnowledgeForAgent()` 的入参固定为 `agentName/query/topK/userId?`，内部先查 `agent_knowledge_binding` 的启用集合，再映射为 `knowledge_base.remoteId` 数组调用 provider `search()`
  - `readKnowledgeResourceForAgent()` 必须先校验资源所属知识库是否已绑定当前 agent，再允许读取
  - 返回结构严格对齐设计文档中的 `title/snippet/source/score/knowledgeBaseId/resourceId`
  - 原因: 检索权限必须由 RCS 服务端裁剪，不能接受 Agent 传任意 knowledgeBaseId 越权访问

- [x] 新增知识 MCP 路由，实现 `kb_search` / `kb_read`
  - 新建文件: `/Users/liyuan/Work/mothership-beta/src/routes/mcp/knowledge.ts`
  - 使用 `@modelcontextprotocol/sdk/server` 建立最小 MCP server，工具列表固定暴露 `kb_search`、`kb_read`
  - 路由路径固定为 `GET/POST /mcp/knowledge`
  - 鉴权方式使用 `Authorization: Bearer <environment.secret>`；在路由入口根据 bearer token 解析 `EnvironmentRecord`，再用 `environment.agentName` 作为默认 `agentName`
  - `kb_search` 请求体只接受 `query/topK/agentName?`，当传入的 `agentName` 与环境默认 agent 不一致时直接拒绝
  - `kb_read` 请求体只接受 `resourceId`
  - 原因: 当前仓库没有现成的 MCP runtime，这里需要独立落一条服务端 endpoint，且必须继续利用现有 environment secret 做最小入侵鉴权

- [x] 将知识 MCP 路由注册到主应用
  - 位置: `/Users/liyuan/Work/mothership-beta/src/index.ts` 顶部导入区，新增 `import knowledgeMcpRoutes from "./routes/mcp/knowledge";`
  - 位置: `/Users/liyuan/Work/mothership-beta/src/index.ts` 在 `app.route("/workflow-ui", workflowStaticApp);` 之后、ACP 路由之前
  - 追加 `app.route("/", knowledgeMcpRoutes);`
  - 原因: 该 endpoint 供 Agent runtime 访问，不需要落在 `sessionAuth` 的 `/web` 控制台范围内

- [x] 在实例启动时把知识 MCP server 注入 workspace 配置
  - 位置: `/Users/liyuan/Work/mothership-beta/src/services/instance.ts` 的 `spawnInstanceFromEnvironment()` 中写 `.opencode/opencode.json` 的逻辑块（现有 `config.default_agent = env.agentName;` 附近，~L211-L230）
  - 在读取现有 JSON 后，调用 `listAgentKnowledgeBindings(env.agentName)` 判断默认 agent 是否绑定知识库
  - 当存在绑定时，向 `config.mcp` 写入固定 server，例如:
    - key: `rcs-knowledge`
    - value: `{ type: "remote", url: \`${getBaseUrl()}/mcp/knowledge\`, headers: { Authorization: \`Bearer ${env.secret}\` }, enabled: true, timeout: 15000 }`
  - 同时在 `config.agent[env.agentName].prompt` 不做知识正文注入，只保留原 prompt；不要修改 ACP/relay/session 链路
  - 原因: 设计文档已明确 system prompt 只承载策略不承载知识内容，知识能力应通过运行时工具暴露

- [x] 为知识 MCP 路由与实例注入编写单元测试
  - 测试文件: `/Users/liyuan/Work/mothership-beta/src/__tests__/knowledge-mcp-route.test.ts`
  - 测试场景:
    - `kb_search`: 已绑定知识库且 token 合法 → 返回带 `source/knowledgeBaseId/resourceId` 的结果数组
    - `kb_read`: 资源不属于当前 agent 绑定集合 → 返回鉴权错误
    - 未带 bearer token → 返回 `401`
  - 测试文件: `/Users/liyuan/Work/mothership-beta/src/__tests__/instance-service.test.ts`
  - 测试场景:
    - 默认 agent 绑定知识库时写入 `.opencode/opencode.json` → `mcp.rcs-knowledge` 存在
    - 默认 agent 无绑定时不写入知识 MCP 配置 → 只保留 `default_agent`
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/knowledge-mcp-route.test.ts src/__tests__/instance-service.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 知识 MCP 路由已注册
  - `rg -n "knowledgeMcpRoutes|app.route\\(\"/\", knowledgeMcpRoutes\\)" /Users/liyuan/Work/mothership-beta/src/index.ts`
  - 预期: 匹配到导入与注册
- [x] 实例注入逻辑会写入 rcs-knowledge MCP 配置
  - `rg -n "rcs-knowledge|/mcp/knowledge|Authorization" /Users/liyuan/Work/mothership-beta/src/services/instance.ts`
  - 预期: 匹配到固定 server key、endpoint URL 和 header 注入
- [x] MCP 路由测试通过
  - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/knowledge-mcp-route.test.ts`
  - 预期: 输出包含 `pass`

---

### Task 6: 知识库控制台页面与路由入口

**背景:**
当前控制台只有 `models/agents/skills/mcp/tasks/channels/workflow/environments` 等页面，`parseConfigView()`、`Sidebar` 和 `App` 都不知道知识库页面。`spec-plan-1.md` 的 Task 3-4 已提供后端 API，本 Task 负责新建前端列表/详情/上传页面、补齐 API client 和路由入口，让用户能直接管理知识库。
调用链上，`parseConfigView()` 被 `web/src/__tests__/config-routing.test.ts` 和 `config-mcp-routing.test.ts` 覆盖；`Sidebar` 决定导航入口；`api/client.ts` 是所有配置页共享网络层，本 Task 必须沿用现有模式。

**涉及文件:**
- 修改: `web/src/api/client.ts`
- 新建: `web/src/types/knowledge.ts`
- 新建: `web/src/pages/KnowledgeBasesPage.tsx`
- 修改: `web/src/App.tsx`
- 修改: `web/src/components/shell/Sidebar.tsx`
- 新建: `web/src/__tests__/knowledge-bases-page.test.tsx`
- 修改: `web/src/__tests__/config-routing.test.ts`

**执行步骤:**

- [x] 扩展前端知识库类型与 API client
  - 新建文件: `/Users/liyuan/Work/mothership-beta/web/src/types/knowledge.ts`
  - 定义 `KnowledgeBaseInfo`、`KnowledgeBaseDetail`、`KnowledgeResourceInfo`、`KnowledgeUploadResponse`
  - 位置: `/Users/liyuan/Work/mothership-beta/web/src/api/client.ts` 的 `// --- Config ---` 之前新增知识库 API 段
  - 追加函数:
    - `apiListKnowledgeBases()`
    - `apiGetKnowledgeBase(id: string)`
    - `apiCreateKnowledgeBase(data)`
    - `apiUpdateKnowledgeBase(id, data)`
    - `apiDeleteKnowledgeBase(id)`
    - `apiListKnowledgeResources(id)`
    - `apiUploadKnowledgeResources(id, formData)`
    - `apiImportKnowledgeResourceUrl(id, payload)`
  - `upload` 使用原生 `fetch` + `FormData`，不要复用 JSON `api<T>()`
  - 原因: 现有 `api<T>()` 固定 `Content-Type: application/json`，多文件上传必须单独处理

- [x] 新建知识库页面，包含列表、详情、上传与错误状态展示
  - 新建文件: `/Users/liyuan/Work/mothership-beta/web/src/pages/KnowledgeBasesPage.tsx`
  - 页面结构参考 `web/src/pages/SkillsPage.tsx` 与 `web/src/pages/TasksPage.tsx`
  - 列表区使用 `DataTable` 展示 `名称/状态/资源数/最近更新时间/绑定Agent数`
  - 详情抽屉或侧栏显示 `description/status/lastError/resources`
  - 上传区支持多文件 `<input type="file" multiple>`，调用 `apiUploadKnowledgeResources`
  - 当资源状态为 `error` 时，在列表行和详情区都渲染最近错误文本
  - 原因: 设计文档明确要求列表 + 详情 + 上传入口统一出现在知识库控制台页面

- [x] 把知识库页面挂入前端路由和侧边栏
  - 位置: `/Users/liyuan/Work/mothership-beta/web/src/App.tsx`
  - 在 lazy import 段新增 `KnowledgeBasesPage`
  - 在 `parseConfigView()` 与 `parseRoute()` 的 `configViews` 数组里追加 `"knowledge-bases"`
  - 在 `ViewId` 联合类型中追加 `"knowledge-bases"`
  - 在渲染分支中插入 `configView === "knowledge-bases" ? <KnowledgeBasesPage />`
  - 位置: `/Users/liyuan/Work/mothership-beta/web/src/components/shell/Sidebar.tsx` 的 `NAV_GROUPS`
  - 在“配置”分组中加入 `{ id: "knowledge-bases", label: "知识库", icon: BookOpen }`
  - 调整 `isActive` 判断，不再把 `environments` 与 `agents` 混为一个活动项
  - 原因: 当前侧边栏没有知识库入口，且 `parseConfigView()` 不认识该路由，页面无法访问

- [x] 为知识库页面与路由识别编写单元测试
  - 测试文件: `/Users/liyuan/Work/mothership-beta/web/src/__tests__/knowledge-bases-page.test.tsx`
  - 测试场景:
    - 首次加载调用 `apiListKnowledgeBases` 并渲染知识库名称
    - 选中某一行后展示 `lastError/resources` 详情
    - 选择文件上传后调用 `apiUploadKnowledgeResources`
  - 测试文件: `/Users/liyuan/Work/mothership-beta/web/src/__tests__/config-routing.test.ts`
  - 测试场景:
    - `/ctrl/knowledge-bases` → `parseConfigView()` 返回 `"knowledge-bases"`
    - 现有 `/ctrl/agents`、`/ctrl/mcp` 路由结果保持不变
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/knowledge-bases-page.test.tsx web/src/__tests__/config-routing.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] 路由识别已包含 knowledge-bases
  - `rg -n "knowledge-bases" /Users/liyuan/Work/mothership-beta/web/src/App.tsx /Users/liyuan/Work/mothership-beta/web/src/components/shell/Sidebar.tsx`
  - 预期: App 路由和 Sidebar 导航都命中
- [x] 前端 API client 已包含知识库接口
  - `rg -n "apiListKnowledgeBases|apiUploadKnowledgeResources|apiImportKnowledgeResourceUrl" /Users/liyuan/Work/mothership-beta/web/src/api/client.ts`
  - 预期: 三个函数均存在
- [x] 知识库页面测试通过
  - `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/knowledge-bases-page.test.tsx`
  - 预期: 输出包含 `pass`

---

### Task 7: Agent 配置页知识库绑定 UI

**背景:**
Task 4 已让后端 Agent API 支持 `knowledge` 字段，但现有 `web/src/pages/AgentsPage.tsx` 只有 `basic` 和 `permission` 两个页签，表格列里也没有知识库摘要。要让用户真正可用，必须把知识库多选、默认检索数和 `searchFirst` 策略集成到 Agent 编辑对话框，同时保留原有 `PermissionTab` 交互不回归。
该 Task 直接复用 `apiListKnowledgeBases()`、`apiGetAgent()`、`apiSetAgent()`，输出又会回流到 Task 5 的实例注入与检索鉴权，因此要和 Task 4 的数据结构保持一致。

**涉及文件:**
- 修改: `web/src/pages/AgentsPage.tsx`
- 修改: `web/src/__tests__/config-agents-page.test.ts`

**执行步骤:**

- [x] 在 Agent 页面中加载知识库选项并扩展表单状态
  - 位置: `/Users/liyuan/Work/mothership-beta/web/src/pages/AgentsPage.tsx` 顶部导入区（现有 `apiGetModels` 导入旁边）
  - 新增 `apiListKnowledgeBases`
  - 在组件 state 区新增:
    - `knowledgeOptions`
    - `formKnowledgeBaseIds`
    - `formKnowledgeSearchFirst`
    - `formKnowledgeMaxResults`
  - 在现有 `useEffect(() => { loadAgents(); loadModelOptions(); }, ...)` 中并行调用 `loadKnowledgeOptions()`
  - 原因: 编辑弹窗打开前必须拿到知识库候选集合，避免用户在表单内触发二次等待

- [x] 把编辑弹窗页签从两段扩展为三段，并回填 knowledge 配置
  - 位置: `/Users/liyuan/Work/mothership-beta/web/src/pages/AgentsPage.tsx` 的 `activeTab` state（现有 `"basic" | "permission"`，~L74）
  - 扩展为 `"basic" | "knowledge" | "permission"`
  - 在 `handleOpenCreate()` 中重置知识表单为默认值：空数组、`true`、`5`
  - 在 `handleOpenEdit()` 调用 `apiGetAgent()` 成功后，从 `detail.knowledge` 回填 `knowledgeBaseIds/policy.searchFirst/policy.maxResults`
  - 在 `handleSave()` 组装 payload 时追加:
    - `knowledge: { knowledgeBaseIds: formKnowledgeBaseIds, policy: { searchFirst: formKnowledgeSearchFirst, maxResults: Number(formKnowledgeMaxResults) } }`
  - 原因: 现有保存逻辑已经是唯一提交点，把知识配置并入同一个 payload 最稳妥

- [x] 在对话框中新增知识库配置页签 UI
  - 位置: `/Users/liyuan/Work/mothership-beta/web/src/pages/AgentsPage.tsx` 的 tab 切换按钮区（现有 `basic/permission` 按钮附近，~L392-L401）
  - 新增“知识库”按钮，放在“基础设置”和“权限”之间
  - 在内容区新增 `activeTab === "knowledge"` 分支，渲染:
    - 多选知识库列表（checkbox 或 token button）
    - `searchFirst` 开关
    - `maxResults` 数字输入框
    - 当前已选知识库数量提示
  - 表格列中追加 `knowledgeBaseCount`，标题为“知识库”
  - 原因: 设计文档要求 Agent 列表页只显示数量摘要，详细绑定关系在编辑弹窗中维护

- [x] 为 Agent 知识页签编写单元测试
  - 测试文件: `/Users/liyuan/Work/mothership-beta/web/src/__tests__/config-agents-page.test.ts`
  - 测试场景:
    - 读取 `AgentDetail.knowledge` 时正确回填 `knowledgeBaseIds`
    - `activeTab="knowledge"` 时渲染 `searchFirst/maxResults`
    - 保存时提交的 payload 包含 `knowledge.knowledgeBaseIds` 与 `policy.maxResults`
  - 运行命令: `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/config-agents-page.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [x] AgentsPage 已包含 knowledge 页签与表单字段
  - `rg -n "knowledge|knowledgeBaseCount|searchFirst|maxResults" /Users/liyuan/Work/mothership-beta/web/src/pages/AgentsPage.tsx`
  - 预期: 匹配到页签、表单状态和 payload 组装
- [x] Agent 页面测试通过
  - `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/config-agents-page.test.ts`
  - 预期: 输出包含 `pass`
- [x] 前端构建通过
  - `cd /Users/liyuan/Work/mothership-beta && bun run build:web 2>&1 | tail -5`
  - 预期: 输出包含 `built in` 且无 error

---

### Task 8: Agent 知识库功能总体验收

**前置条件:**
- 启动命令: `cd /Users/liyuan/Work/mothership-beta && bun run start`
- 前端构建: `cd /Users/liyuan/Work/mothership-beta && bun run build:web`
- 测试数据准备: 启动可访问的 OpenViking 实例，创建一个默认 environment 并绑定已配置知识库的 agent

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/db-schema.test.ts src/__tests__/knowledge-provider-openviking.test.ts src/__tests__/web-knowledge-bases.test.ts src/__tests__/web-knowledge-resources.test.ts src/__tests__/config-agents.test.ts src/__tests__/agent-knowledge.test.ts src/__tests__/knowledge-mcp-route.test.ts src/__tests__/instance-service.test.ts web/src/__tests__/knowledge-bases-page.test.tsx web/src/__tests__/config-agents-page.test.ts web/src/__tests__/config-routing.test.ts && bun run build:web`
   - 预期: 后端、前端测试全部通过，前端构建成功
   - 失败排查: 先按 Task 1-7 对应测试文件逐一排查；如仅出现既有 Bun mock 污染问题，优先确认本 feature 新增测试是否独立通过

2. 验证控制台知识库页面可访问并识别路由
   - `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/config-routing.test.ts web/src/__tests__/knowledge-bases-page.test.tsx`
   - 预期: `/ctrl/knowledge-bases` 被识别为配置页路由，页面列表与详情测试通过
   - 失败排查: 检查 Task 6 的 `web/src/App.tsx`、`web/src/components/shell/Sidebar.tsx`、`web/src/pages/KnowledgeBasesPage.tsx`

3. 验证 Agent 配置可保存知识库绑定
   - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/config-agents.test.ts src/__tests__/agent-knowledge.test.ts web/src/__tests__/config-agents-page.test.ts`
   - 预期: 后端绑定同步、前端回填与保存 payload 断言全部通过
   - 失败排查: 检查 Task 4 与 Task 7 的 `agents.ts`、`agent-knowledge.ts`、`AgentsPage.tsx`

4. 验证实例启动后会注入知识 MCP 配置且检索工具受绑定约束
   - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/knowledge-mcp-route.test.ts src/__tests__/instance-service.test.ts`
   - 预期: `.opencode/opencode.json` 中存在 `mcp.rcs-knowledge`，未绑定资源读取被拒绝
   - 失败排查: 检查 Task 5 的 `src/routes/mcp/knowledge.ts`、`src/services/knowledge-runtime.ts`、`src/services/instance.ts`

5. 验证资源上传失败信息能回显到控制台
   - `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/web-knowledge-resources.test.ts web/src/__tests__/knowledge-bases-page.test.tsx`
   - 预期: 失败状态回写 `lastError`，前端详情区可渲染错误文本
   - 失败排查: 检查 Task 3 的上传编排与 Task 6 的详情渲染
