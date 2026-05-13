import type { EnvironmentId, InstanceId, EngineSessionId, SessionId } from "../domain/ids";
import type { Environment } from "../domain/environment";
import type { Session } from "../domain/session";
import { EnvironmentService, type CreateEnvironmentInput } from "./environment-service";
import { InstanceService } from "./instance-service";
import { RelayOrchestrator, type RelayTransport } from "./relay-orchestrator";
import { SessionService } from "./session-service";

/**
 * 给 apps/server 使用的 Core 门面，隐藏底层服务编排细节。
 *
 * HTTP 层只与这一个门面交互，避免路由代码直接理解环境、实例、会话和 relay
 * 之间的内部协作关系。
 */
export class CoreFacade {
  /** 使用底层核心服务初始化 facade。 */
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly sessionService: SessionService,
    private readonly instanceService: InstanceService,
    private readonly relayOrchestrator: RelayOrchestrator,
  ) {}

  /** 创建一个新的 environment。 */
  async createEnvironment(input: CreateEnvironmentInput): Promise<Environment> {
    return await this.environmentService.createEnvironment(input);
  }

  /** 按 id 读取单个 environment。 */
  async getEnvironment(environmentId: EnvironmentId): Promise<Environment | undefined> {
    return await this.environmentService.getEnvironment(environmentId);
  }

  /** 列出某个用户的全部 environment。 */
  async listEnvironments(userId: string): Promise<Environment[]> {
    return await this.environmentService.listEnvironments(userId);
  }

  /** 启动指定 environment 的 engine 实例。 */
  async startEnvironmentInstance(environmentId: EnvironmentId) {
    return await this.instanceService.startInstance(environmentId);
  }

  /** 停止指定实例。 */
  async stopEnvironmentInstance(instanceId: InstanceId): Promise<void> {
    await this.instanceService.stopInstance(instanceId);
  }

  /** 列出某个 environment 当前运行中的实例。 */
  async listEnvironmentInstances(environmentId: EnvironmentId) {
    return await this.instanceService.listInstances(environmentId);
  }

  /** 绑定 engineSessionId 并返回平台 session。 */
  async bindEngineSession(instanceId: InstanceId, engineSessionId: EngineSessionId): Promise<Session | undefined> {
    return await this.instanceService.bindEngineSession(instanceId, engineSessionId);
  }

  /** 建立统一 relay。 */
  async connectRelay(sessionId: SessionId, transport: RelayTransport): Promise<string> {
    return await this.relayOrchestrator.connect(sessionId, transport);
  }

  /** 断开 relay。 */
  async disconnectRelay(relayId: string): Promise<void> {
    await this.relayOrchestrator.disconnect(relayId);
  }

  /** 列出某个 environment 的平台会话。 */
  async listSessions(environmentId: EnvironmentId): Promise<Session[]> {
    return await this.sessionService.listByEnvironment(environmentId);
  }

  /** 按平台 sessionId 读取会话。 */
  async getSession(sessionId: SessionId): Promise<Session | undefined> {
    return await this.sessionService.getById(sessionId);
  }
}
