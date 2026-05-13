/**
 * Core 测试专用的内存仓储实现集合。
 *
 * 它们刻意模拟正式 repository contract，而不是追求完整数据库行为，
 * 目标是让服务层单元测试能在无外部依赖的情况下验证编排逻辑。
 */
import type {
  AgentConfigRecord,
  ConfigRepository,
  McpServerConfigRecord,
  ModelConfigRecord,
  EngineConfigRecord,
  SkillConfigRecord,
} from "../contracts/config-repository";
import type { EnvironmentRepository } from "../contracts/environment-repository";
import type { InstanceRepository } from "../contracts/instance-repository";
import type { SessionRepository } from "../contracts/session-repository";
import type { Environment } from "../domain/environment";
import type { EnvironmentId, InstanceId, EngineSessionId } from "../domain/ids";
import type { Instance } from "../domain/instance";
import type { Session } from "../domain/session";

/**
 * 面向测试的内存版 environment 仓储。
 */
export class InMemoryEnvironmentRepository implements EnvironmentRepository {
  private readonly environments = new Map<EnvironmentId, Environment>();

  /** 按 id 读取 environment。 */
  getById(id: EnvironmentId): Environment | undefined {
    return this.environments.get(id);
  }

  /** 保存 environment 到内存。 */
  save(environment: Environment): void {
    this.environments.set(environment.id, environment);
  }

  /** 按 userId 过滤 environment。 */
  listByUser(userId: string): Environment[] {
    return Array.from(this.environments.values()).filter((environment) => environment.userId === userId);
  }

  /** 清空内存中的 environment 数据。 */
  reset(): void {
    this.environments.clear();
  }
}

/**
 * 面向测试的内存版 instance 仓储。
 */
export class InMemoryInstanceRepository implements InstanceRepository {
  private readonly instances = new Map<InstanceId, Instance>();

  /** 保存 instance 到内存。 */
  save(instance: Instance): void {
    this.instances.set(instance.id, instance);
  }

  /** 按 id 读取 instance。 */
  getById(instanceId: InstanceId): Instance | undefined {
    return this.instances.get(instanceId);
  }

  /** 返回指定 environment 下 running 状态的实例。 */
  getRunningByEnvironment(environmentId: EnvironmentId): Instance[] {
    return Array.from(this.instances.values()).filter(
      (instance) => instance.environmentId === environmentId && instance.status === "running",
    );
  }

  /** 仅更新某个实例的状态字段。 */
  updateStatus(instanceId: InstanceId, status: Instance["status"]): void {
    const current = this.instances.get(instanceId);
    if (!current) {
      return;
    }

    this.instances.set(instanceId, {
      ...current,
      status,
    });
  }

  /** 清空内存中的 instance 数据。 */
  reset(): void {
    this.instances.clear();
  }
}

/**
 * 面向测试的内存版 session 仓储。
 */
export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, Session>();

  /** 创建一条 session 记录。 */
  create(session: Session): void {
    this.sessions.set(String(session.id), session);
  }

  /** 保存 session 到内存。 */
  save(session: Session): void {
    this.sessions.set(String(session.id), session);
  }

  /** 按平台 sessionId 读取会话。 */
  getById(sessionId: Session["id"]): Session | undefined {
    return this.sessions.get(String(sessionId));
  }

  /** 通过 engineSessionId 反查 session。 */
  findByEngineSessionId(engineSessionId: EngineSessionId): Session | undefined {
    return Array.from(this.sessions.values()).find(
      (session) => session.engineSessionId === engineSessionId,
    );
  }

  /** 列出某个 environment 下的 session。 */
  listByEnvironment(environmentId: EnvironmentId): Session[] {
    return Array.from(this.sessions.values()).filter(
      (session) => session.environmentId === environmentId,
    );
  }

  /** 清空内存中的 session 数据。 */
  reset(): void {
    this.sessions.clear();
  }
}

/**
 * 初始化内存配置仓储时使用的种子数据。
 */
export interface InMemoryConfigSnapshot {
  engines?: EngineConfigRecord[];
  models?: ModelConfigRecord[];
  agents?: AgentConfigRecord[];
  skills?: SkillConfigRecord[];
  mcpServers?: McpServerConfigRecord[];
}

/**
 * 面向测试的内存版配置仓储。
 */
export class InMemoryConfigRepository implements ConfigRepository {
  private readonly engines = new Map<string, EngineConfigRecord>();
  private readonly models = new Map<string, ModelConfigRecord>();
  private readonly agents = new Map<string, AgentConfigRecord>();
  private readonly skills = new Map<string, SkillConfigRecord>();
  private readonly mcpServers = new Map<string, McpServerConfigRecord>();

  /** 使用一组初始快照预填充配置仓储。 */
  constructor(snapshot: InMemoryConfigSnapshot = {}) {
    this.seed(snapshot);
  }

  /** 读取 engine 配置。 */
  getEngine(id: string): EngineConfigRecord | undefined {
    return this.engines.get(id);
  }

  /** 读取 model 配置。 */
  getModel(id: string): ModelConfigRecord | undefined {
    return this.models.get(id);
  }

  /** 读取 agent 配置。 */
  getAgent(id: string): AgentConfigRecord | undefined {
    return this.agents.get(id);
  }

  /** 读取 skill 配置。 */
  getSkill(id: string): SkillConfigRecord | undefined {
    return this.skills.get(id);
  }

  /** 读取 MCP server 配置。 */
  getMcpServer(id: string): McpServerConfigRecord | undefined {
    return this.mcpServers.get(id);
  }

  /** 清空全部内存配置数据。 */
  reset(): void {
    this.engines.clear();
    this.models.clear();
    this.agents.clear();
    this.skills.clear();
    this.mcpServers.clear();
  }

  /** 将初始快照写入各类内存映射。 */
  private seed(snapshot: InMemoryConfigSnapshot): void {
    for (const engine of snapshot.engines ?? []) {
      this.engines.set(engine.id, engine);
    }

    for (const model of snapshot.models ?? []) {
      this.models.set(model.id, model);
    }

    for (const agent of snapshot.agents ?? []) {
      this.agents.set(agent.id, agent);
    }

    for (const skill of snapshot.skills ?? []) {
      this.skills.set(skill.id, skill);
    }

    for (const mcpServer of snapshot.mcpServers ?? []) {
      this.mcpServers.set(mcpServer.id, mcpServer);
    }
  }
}

/**
 * 批量清空一组支持 reset 的测试仓储。
 *
 * 用于在同一测试文件里复用仓储实例时，显式恢复到干净状态。
 */
export function resetRepositories(...repositories: Array<{ reset(): void }>): void {
  for (const repository of repositories) {
    repository.reset();
  }
}
