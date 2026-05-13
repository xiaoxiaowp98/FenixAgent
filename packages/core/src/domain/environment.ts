import type { EnvironmentId } from "./ids";

/**
 * Environment 引用的平台配置键集合。
 */
export interface EnvironmentConfigRefs {
  /** 指向平台配置域中的 engine 配置主键。 */
  engineId: string;
  /** 可选的默认 model 配置主键。 */
  modelId?: string;
  /** 可选的默认 agent 配置主键。 */
  agentId?: string;
  /** 启动时需要关联的 skill 配置主键列表。 */
  skillIds: string[];
  /** 启动时需要关联的 MCP server 配置主键列表。 */
  mcpServerIds: string[];
}

/**
 * 用户定义的可启动 engine 运行单元。
 */
export interface Environment {
  id: EnvironmentId;
  userId: string;
  name: string;
  /** engine 类型标识，例如 opencode。用于选择对应插件。 */
  engineType: string;
  /** 该 environment 对应的主工作目录。 */
  workspacePath: string;
  /** engine 私有配置引用；用于定位 engine 特定配置而不是平台通用配置。 */
  engineConfigRef?: string;
  /** 指向平台配置域的通用配置引用集合。 */
  config: EnvironmentConfigRefs;
  createdAt: Date;
  updatedAt: Date;
}
