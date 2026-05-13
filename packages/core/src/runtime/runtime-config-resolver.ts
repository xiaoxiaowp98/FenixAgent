import type { AgentRuntimeSpec } from "@mothership/plugin-sdk";
import type {
  AgentConfigRecord,
  ConfigRepository,
  McpServerConfigRecord,
  ModelConfigRecord,
  EngineConfigRecord,
  SkillConfigRecord,
} from "../contracts/config-repository";
import type { Environment } from "../domain/environment";

/**
 * 解析统一运行时配置时的输入。
 */
export interface ResolveRuntimeConfigInput {
  environment: Environment;
}

/**
 * 当运行时配置引用缺失时抛出的具名错误。
 */
export class RuntimeConfigResolutionError extends Error {
  constructor(
    readonly referenceType: "engine" | "model" | "agent" | "skill" | "mcp",
    readonly referenceId: string,
  ) {
    super(`Missing ${referenceType} config: ${referenceId}`);
    this.name = "RuntimeConfigResolutionError";
  }
}

/**
 * 将平台配置域数据解析为 engine 无关的 AgentRuntimeSpec。
 *
 * 这一层负责把 environment 上挂的各种配置引用展开成 engine 可直接消费的
 * 统一结构，避免每个 engine 插件都重复理解平台配置表。
 */
export class RuntimeConfigResolver {
  /** 使用配置仓储初始化 resolver。 */
  constructor(private readonly configRepository: ConfigRepository) {}

  /** 解析某个 environment 的统一运行时配置。 */
  async resolve(input: ResolveRuntimeConfigInput): Promise<AgentRuntimeSpec> {
    const { environment } = input;
    const { config } = environment;

    // 解析顺序遵循“environment 显式指定优先，其次回退到 agent 默认值”。
    const engine = await this.requireEngine(config.engineId);
    const agent = config.agentId ? await this.requireAgent(config.agentId) : null;

    const modelId = config.modelId ?? agent?.modelId;
    const model = modelId ? await this.requireModel(modelId) : null;
    const skills = await Promise.all(config.skillIds.map((id) => this.requireSkill(id)));
    const mcpServers = await Promise.all(config.mcpServerIds.map((id) => this.requireMcpServer(id)));

    return {
      engineId: engine.id,
      model: model
        ? {
            id: model.id,
            provider: model.provider,
            model: model.model,
          }
        : null,
      agent: agent
        ? {
            id: agent.id,
            modelId: agent.modelId,
            prompt: agent.prompt,
          }
        : null,
      skills: skills.map((skill) => ({
        id: skill.id,
      })),
      mcpServers: mcpServers.map((server) => ({
        id: server.id,
        type: server.type,
        enabled: server.enabled,
      })),
    };
  }

  /** 读取 engine 配置；缺失时抛错。 */
  private async requireEngine(id: string): Promise<EngineConfigRecord> {
    const record = await this.configRepository.getEngine(id);
    if (!record) {
      throw new RuntimeConfigResolutionError("engine", id);
    }
    return record;
  }

  /** 读取 model 配置；缺失时抛错。 */
  private async requireModel(id: string): Promise<ModelConfigRecord> {
    const record = await this.configRepository.getModel(id);
    if (!record) {
      throw new RuntimeConfigResolutionError("model", id);
    }
    return record;
  }

  /** 读取 agent 配置；缺失时抛错。 */
  private async requireAgent(id: string): Promise<AgentConfigRecord> {
    const record = await this.configRepository.getAgent(id);
    if (!record) {
      throw new RuntimeConfigResolutionError("agent", id);
    }
    return record;
  }

  /** 读取 skill 配置；缺失时抛错。 */
  private async requireSkill(id: string): Promise<SkillConfigRecord> {
    const record = await this.configRepository.getSkill(id);
    if (!record) {
      throw new RuntimeConfigResolutionError("skill", id);
    }
    return record;
  }

  /** 读取 MCP server 配置；缺失时抛错。 */
  private async requireMcpServer(id: string): Promise<McpServerConfigRecord> {
    const record = await this.configRepository.getMcpServer(id);
    if (!record) {
      throw new RuntimeConfigResolutionError("mcp", id);
    }
    return record;
  }
}
