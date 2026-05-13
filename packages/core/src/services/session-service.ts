import type { SessionRepository } from "../contracts/session-repository";
import type { EnvironmentId, InstanceId, EngineSessionId, SessionId } from "../domain/ids";
import { createSessionId } from "../domain/ids";
import type { Session, SessionStatus } from "../domain/session";

/**
 * 创建平台会话时需要的输入。
 */
export interface CreateSessionInput {
  environmentId: EnvironmentId;
  instanceId?: InstanceId;
  engineSessionId?: EngineSessionId;
  title?: string;
  cwd?: string;
  status?: SessionStatus;
}

/**
 * 负责平台会话创建与 engineSessionId 映射。
 *
 * SessionService 只维护平台侧会话记录及其与 engine session 的绑定关系，
 * 不直接处理消息流或 relay 生命周期。
 */
export class SessionService {
  /** 使用 session 仓储初始化服务。 */
  constructor(private readonly sessionRepository: SessionRepository) {}

  /** 创建一条新的平台 session 记录。 */
  async createSession(input: CreateSessionInput): Promise<Session> {
    const now = new Date();
    const session: Session = {
      id: createSessionId(),
      environmentId: input.environmentId,
      instanceId: input.instanceId,
      engineSessionId: input.engineSessionId,
      title: input.title,
      cwd: input.cwd,
      status: input.status ?? "idle",
      createdAt: now,
      updatedAt: now,
    };

    await this.sessionRepository.create(session);
    return session;
  }

  /** 用 engine session 反查平台 session。 */
  async findByEngineSessionId(engineSessionId: EngineSessionId): Promise<Session | undefined> {
    return await this.sessionRepository.findByEngineSessionId(engineSessionId);
  }

  /** 按平台 sessionId 读取会话。 */
  async getById(sessionId: SessionId): Promise<Session | undefined> {
    return await this.sessionRepository.getById(sessionId);
  }

  /** 列出某个 environment 的全部会话。 */
  async listByEnvironment(environmentId: EnvironmentId): Promise<Session[]> {
    return await this.sessionRepository.listByEnvironment(environmentId);
  }

  /** 绑定 engineSessionId 到已有平台会话。 */
  async bindEngineSession(
    sessionId: SessionId,
    engineSessionId: EngineSessionId,
  ): Promise<Session | undefined> {
    const current = await this.sessionRepository.getById(sessionId);
    if (!current) {
      return undefined;
    }

    const updated: Session = {
      ...current,
      engineSessionId,
      updatedAt: new Date(),
    };
    await this.sessionRepository.save(updated);
    return updated;
  }

  /** 将某个会话绑定到指定 instance。 */
  async assignInstance(sessionId: SessionId, instanceId: InstanceId): Promise<Session | undefined> {
    const current = await this.sessionRepository.getById(sessionId);
    if (!current) {
      return undefined;
    }

    const updated: Session = {
      ...current,
      instanceId,
      updatedAt: new Date(),
    };
    await this.sessionRepository.save(updated);
    return updated;
  }
}
