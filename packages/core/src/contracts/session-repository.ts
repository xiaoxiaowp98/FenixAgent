import type { EngineSessionId, EnvironmentId } from "../domain/ids";
import type { Session } from "../domain/session";

/**
 * Session 聚合的持久化契约。
 */
export interface SessionRepository {
  /** 创建一条新的平台会话记录。 */
  create(session: Session): Promise<void> | void;
  /** 创建或覆盖保存一条平台会话记录。 */
  save(session: Session): Promise<void> | void;
  /** 按平台 sessionId 读取会话。 */
  getById(sessionId: Session["id"]): Promise<Session | undefined> | Session | undefined;
  /** 使用 engine 原生 session id 反查平台侧会话。 */
  findByEngineSessionId(
    engineSessionId: EngineSessionId,
  ): Promise<Session | undefined> | Session | undefined;
  /** 列出某个 environment 关联的全部会话。 */
  listByEnvironment(environmentId: EnvironmentId): Promise<Session[]> | Session[];
}
