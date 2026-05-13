/**
 * Core 解析后交给 engine 的统一运行时配置结构。
 *
 * 所有 engine 都消费这套结构，避免直接耦合控制面原始配置格式。
 */
/**
 * Engine 可消费的统一 model 配置。
 */
export interface ResolvedModelConfig {
  id: string;
  provider: string;
  model: string;
}

/**
 * Engine 可消费的统一 agent 配置。
 */
export interface ResolvedAgentConfig {
  id: string;
  modelId?: string;
  prompt?: string;
}

/**
 * Engine 可消费的 skill 引用。
 */
export interface ResolvedSkillConfig {
  id: string;
}

/**
 * Engine 可消费的 MCP 服务配置。
 */
export interface ResolvedMcpServerConfig {
  id: string;
  type: "local" | "remote";
  enabled: boolean;
}

/**
 * Engine 可消费的知识绑定。
 */
export interface ResolvedKnowledgeBinding {
  id: string;
  resource: string;
}

/**
 * Core 在启动 engine 前组装出的统一运行时配置契约。
 *
 * 这是平台配置域（engines/models/agents/skills/mcp）与 engine 私有配置
 * 之间的"中间表示"（intermediate representation）。Core 负责把 environment
 * 上引用的各种配置 id 展开为这个结构，engine 只需消费它，无需理解
 * 平台配置的存储格式和引用关系。
 *
 * 该类型位于 plugin-sdk 而非 core，这样第三方插件包只需依赖 SDK 即可编译。
 */
export interface AgentRuntimeSpec {
  /** engine 标识，对应 environment.engineType。 */
  engineId: string;
  /** 解析后的模型配置；可能为 null 如果 environment 未指定。 */
  model: ResolvedModelConfig | null;
  /** 解析后的 agent 配置；可能为 null。 */
  agent: ResolvedAgentConfig | null;
  /** 该 environment 引用的所有 skill 配置。 */
  skills: ResolvedSkillConfig[];
  /** 该 environment 引用的所有 MCP server 配置。 */
  mcpServers: ResolvedMcpServerConfig[];
  /** 可选的知识库绑定列表。 */
  knowledgeBindings?: ResolvedKnowledgeBinding[];
}
