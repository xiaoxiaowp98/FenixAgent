/**
 * Engine 配置的解析结果。
 */
export interface EngineConfigRecord {
  id: string;
  baseURL?: string;
  apiKey?: string;
}

/**
 * Model 配置的解析结果。
 */
export interface ModelConfigRecord {
  id: string;
  provider: string;
  model: string;
  config?: Record<string, unknown>;
}

/**
 * Agent 配置的解析结果。
 */
export interface AgentConfigRecord {
  id: string;
  modelId?: string;
  prompt?: string;
  config?: Record<string, unknown>;
}

/**
 * Skill 配置的解析结果。
 * Core 目前只关心 skill 的引用标识，具体内容由后续注入层处理。
 */
export interface SkillConfigRecord {
  id: string;
  content?: string;
  config?: Record<string, unknown>;
}

/**
 * MCP 服务配置的解析结果。
 */
export interface McpServerConfigRecord {
  id: string;
  type: "local" | "remote";
  enabled: boolean;
  config?: Record<string, unknown>;
}

/**
 * 平台配置域的读取契约，供 runtime resolver 组装统一运行时配置。
 */
export interface ConfigRepository {
  /** 读取 engine 配置。 */
  getEngine(id: string): Promise<EngineConfigRecord | undefined> | EngineConfigRecord | undefined;
  /** 读取 model 配置。 */
  getModel(id: string): Promise<ModelConfigRecord | undefined> | ModelConfigRecord | undefined;
  /** 读取 agent 配置。 */
  getAgent(id: string): Promise<AgentConfigRecord | undefined> | AgentConfigRecord | undefined;
  /** 读取 skill 配置。 */
  getSkill(id: string): Promise<SkillConfigRecord | undefined> | SkillConfigRecord | undefined;
  /** 读取 MCP server 配置。 */
  getMcpServer(id: string): Promise<McpServerConfigRecord | undefined> | McpServerConfigRecord | undefined;
}
