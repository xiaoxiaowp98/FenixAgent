# Agent 知识库运行时集成与控制台 人工验收清单

**生成时间:** 2026-05-06 12:00
**关联计划:** `spec/feature_20260506_F001_agent-knowledge-base/spec-plan-2.md`
**关联设计:** `spec/feature_20260506_F001_agent-knowledge-base/spec-design.md`

---

## 验收前准备

### 环境要求
- [x] [AUTO] 构建前端产物: `cd /Users/liyuan/Work/mothership-beta && bun run build:web`
- [!] [AUTO] 运行知识库集成相关测试: `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/config-agents.test.ts src/__tests__/agent-knowledge.test.ts src/__tests__/knowledge-mcp-route.test.ts src/__tests__/instance-service.test.ts web/src/__tests__/knowledge-bases-page.test.tsx web/src/__tests__/config-agents-page.test.ts web/src/__tests__/config-routing.test.ts`
  - 失败说明: 批量运行时 `src/__tests__/agent-knowledge.test.ts` 稳定失败；最小复现 `bun test src/__tests__/instance-service.test.ts src/__tests__/agent-knowledge.test.ts` 报 `Export named 'countBindingsByKnowledgeBaseIds' not found`，表明 `instance-service.test.ts` 中对 `../services/agent-knowledge` 的 `mock.module()` 污染了后续测试文件，属于 Bun 多文件测试隔离问题。
  - 人工决策: 2026-05-06 用户要求先跳过该问题，继续执行后续人工验收；后续结论需保留此前置失败风险。
- [x] [AUTO/SERVICE] 启动 RCS 服务: `cd /Users/liyuan/Work/mothership-beta && bun run start` (port: 3000)
  - 复用说明: 2026-05-06 用户确认服务已自行启动，后续验收复用现有 `localhost:3000` 实例。

### 测试数据准备
- [x] [MANUAL] 使用可登录账号进入控制台，并准备一个已配置 OpenViking 的知识库
- [x] [MANUAL] 准备一个默认 environment，绑定已配置知识库的 agent

---

## 验收项目

### 场景 1：Agent 知识绑定配置可读可写

#### - [x] 1.1 Agent 配置路由已支持 knowledge 字段
- **来源:** `spec-plan-2.md` Task 4
- **目的:** 确认配置入口可持久化绑定
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "\"knowledge\"|knowledgeBaseCount|syncAgentKnowledgeBindings" src/routes/web/config/agents.ts` → 期望包含: `knowledgeBaseCount`
  2. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "AgentKnowledgeConfig|knowledgeBaseCount|knowledge:" web/src/types/config.ts` → 期望包含: `AgentKnowledgeConfig`

#### - [x] 1.2 Agent 知识绑定服务测试通过
- **来源:** `spec-plan-2.md` Task 4 / `spec-design.md` Agent 配置扩展
- **目的:** 确认绑定同步与默认策略正确
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/config-agents.test.ts src/__tests__/agent-knowledge.test.ts` → 期望包含: `pass`

### 场景 2：知识 MCP 运行时注入与权限裁剪生效

#### - [x] 2.1 知识 MCP 路由与实例注入代码已接通
- **来源:** `spec-plan-2.md` Task 5 / `spec-design.md` 检索工具 API
- **目的:** 确认运行时具备注入入口
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "knowledgeMcpRoutes|app.route\\(\"/\", knowledgeMcpRoutes\\)" src/index.ts` → 期望包含: `knowledgeMcpRoutes`
  2. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "rcs-knowledge|/mcp/knowledge|Authorization" src/services/instance.ts` → 期望包含: `rcs-knowledge`

#### - [x] 2.2 检索工具测试覆盖未绑定拒绝与合法检索
- **来源:** `spec-plan-2.md` Task 5 / `spec-design.md` 实现要点 4-5
- **目的:** 确认知识访问受服务端约束
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/knowledge-mcp-route.test.ts src/__tests__/instance-service.test.ts` → 期望包含: `pass`

#### - [x] 2.3 已绑定 Agent 的运行时可看到知识工具
- **来源:** `spec-plan-2.md` Task 8 / `spec-design.md` 验收标准 6-8
- **目的:** 确认实例侧实际获得知识能力
- **操作步骤:**
  1. [H] 打开 `http://localhost:3000/ctrl/environments`，进入已绑定知识库的 environment 或实例详情，观察实例启动后的工具/MCP 能力信息中存在 `rcs-knowledge` 或 `kb_search` / `kb_read` → 是/否

### 场景 3：知识库控制台页面可访问且可展示状态

#### - [x] 3.1 知识库路由、导航与页面测试通过
- **来源:** `spec-plan-2.md` Task 6 / `spec-design.md` 控制台新增知识库入口
- **目的:** 确认页面入口与交互回归安全
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "knowledge-bases" web/src/App.tsx web/src/components/shell/Sidebar.tsx` → 期望包含: `knowledge-bases`
  2. [A] `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/knowledge-bases-page.test.tsx web/src/__tests__/config-routing.test.ts` → 期望包含: `pass`

#### - [x] 3.2 知识库页能看到列表、详情和错误信息
- **来源:** `spec-plan-2.md` Task 6 / `spec-design.md` 验收标准 1-4
- **目的:** 确认用户可直接管理知识库
- **操作步骤:**
  1. [H] 打开 `http://localhost:3000/ctrl/knowledge-bases`，观察侧边栏存在“知识库”入口且页面能显示知识库列表、状态、资源数与绑定 Agent 数 → 是/否
  2. [H] 打开 `http://localhost:3000/ctrl/knowledge-bases`，选择一个含失败资源的知识库，观察详情区能显示 `lastError` 或最近错误文本 → 是/否

#### - [x] 3.3 知识库页上传入口可操作
- **来源:** `spec-plan-2.md` Task 6 / `spec-design.md` 上传体验
- **目的:** 确认资源入口可被实际使用
- **操作步骤:**
  1. [H] 打开 `http://localhost:3000/ctrl/knowledge-bases`，在详情区执行多文件上传，观察文件选择控件可用且提交后页面出现新增资源或处理中状态 → 是/否

### 场景 4：Agent 编辑弹窗可绑定知识库策略

#### - [x] 4.1 Agent 页面知识页签测试通过
- **来源:** `spec-plan-2.md` Task 7 / `spec-design.md` Agent 配置页集成
- **目的:** 确认回填与保存 payload 正确
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && bun test web/src/__tests__/config-agents-page.test.ts` → 期望包含: `pass`
  2. [A] `cd /Users/liyuan/Work/mothership-beta && bun run build:web` → 期望包含: `built in`

#### - [x] 4.2 Agent 编辑弹窗可配置 knowledge 策略
- **来源:** `spec-plan-2.md` Task 7 / `spec-design.md` Agent 配置页集成
- **目的:** 确认用户可维护绑定关系
- **操作步骤:**
  1. [H] 打开 `http://localhost:3000/ctrl/agents`，进入任一 Agent 编辑弹窗，观察页签包含“基础设置 / 知识库 / 权限”三段结构 → 是/否
  2. [H] 打开 `http://localhost:3000/ctrl/agents`，切到“知识库”页签，观察可多选知识库、设置 `searchFirst` 和 `maxResults`，且显示已选数量提示 → 是/否

#### - [x] 4.3 保存后列表摘要能反映知识库数量
- **来源:** `spec-plan-2.md` Task 7 / `spec-design.md` 前端交互设计 3
- **目的:** 确认绑定结果对用户可见
- **操作步骤:**
  1. [H] 打开 `http://localhost:3000/ctrl/agents`，为 Agent 保存至少一个知识库绑定后返回列表，观察“知识库”列显示更新后的数量摘要 → 是/否

### 场景 5：总体验收与边界回归

#### - [ ] 5.1 知识库集成完整测试与构建无回归
- **来源:** `spec-plan-2.md` Task 8
- **目的:** 确认本阶段交付整体稳定
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && bun test src/__tests__/db-schema.test.ts src/__tests__/knowledge-provider-openviking.test.ts src/__tests__/web-knowledge-bases.test.ts src/__tests__/web-knowledge-resources.test.ts src/__tests__/config-agents.test.ts src/__tests__/agent-knowledge.test.ts src/__tests__/knowledge-mcp-route.test.ts src/__tests__/instance-service.test.ts web/src/__tests__/knowledge-bases-page.test.tsx web/src/__tests__/config-agents-page.test.ts web/src/__tests__/config-routing.test.ts && bun run build:web` → 期望包含: `pass`

#### - [x] 5.2 第一阶段约束仍然成立
- **来源:** `spec-design.md` 与现有 environment / instance 流程的关系 / 验收标准 8
- **目的:** 确认未偏离既定边界
- **操作步骤:**
  1. [A] `cd /Users/liyuan/Work/mothership-beta && rg -n "不修改 ACP 协议|不在 system prompt 中注入大体量知识正文" spec/feature_20260506_F001_agent-knowledge-base/spec-design.md` → 期望包含: `不修改 ACP 协议`
  2. [H] 打开 `http://localhost:3000/ctrl/agents`，检查 Agent 编辑内容仅配置知识库引用与策略，不出现大段知识正文注入界面或 system prompt 自动拼接结果 → 是/否

---

## 验收后清理

- [ ] [AUTO] 终止后台服务 [RCS]: `kill $PID_RCS`

---

## 验收结果汇总

| 场景 | 序号 | 验收项 | [A] | [H] | 结果 |
|------|------|--------|-----|-----|------|
| 场景 1 | 1.1 | Agent 配置路由已支持 knowledge 字段 | 2 | 0 | ✅ |
| 场景 1 | 1.2 | Agent 知识绑定服务测试通过 | 1 | 0 | ✅ |
| 场景 2 | 2.1 | 知识 MCP 路由与实例注入代码已接通 | 2 | 0 | ✅ |
| 场景 2 | 2.2 | 检索工具测试覆盖未绑定拒绝与合法检索 | 1 | 0 | ✅ |
| 场景 2 | 2.3 | 已绑定 Agent 的运行时可看到知识工具 | 0 | 1 | ✅ |
| 场景 3 | 3.1 | 知识库路由、导航与页面测试通过 | 2 | 0 | ✅ |
| 场景 3 | 3.2 | 知识库页能看到列表、详情和错误信息 | 0 | 2 | ✅ |
| 场景 3 | 3.3 | 知识库页上传入口可操作 | 0 | 1 | ✅ |
| 场景 4 | 4.1 | Agent 页面知识页签测试通过 | 2 | 0 | ✅ |
| 场景 4 | 4.2 | Agent 编辑弹窗可配置 knowledge 策略 | 0 | 2 | ✅ |
| 场景 4 | 4.3 | 保存后列表摘要能反映知识库数量 | 0 | 1 | ✅ |
| 场景 5 | 5.1 | 知识库集成完整测试与构建无回归 | 1 | 0 | ⚠️ |
| 场景 5 | 5.2 | 第一阶段约束仍然成立 | 1 | 1 | ✅ |

**验收结论:** ⬜ 全部通过 / ☑ 存在问题
