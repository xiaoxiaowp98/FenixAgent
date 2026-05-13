import type { EnvironmentId, InstanceId, EngineSessionId, SessionId } from "./ids";

export type SessionStatus = "idle" | "active" | "archived" | "error";

/**
 * 平台统一会话模型，不直接等同于 engine 原生 session。
 *
 * 它负责把控制面、relay 和 engine 的会话概念映射到一条稳定记录上，
 * 因此允许同时携带平台侧主键和 engine 原生 session id。
 */
export interface Session {
  /** 平台侧稳定主键。 */
  id: SessionId;
  /** 该会话归属的 environment。 */
  environmentId: EnvironmentId;
  /** 当前承载该会话的实例；有些 engine/场景下可能为空。 */
  instanceId?: InstanceId;
  /** engine 原生 session id，用于和平台 session 建立映射。 */
  engineSessionId?: EngineSessionId;
  title?: string;
  /** engine 返回或平台记录的工作目录上下文，用于会话过滤与恢复。 */
  cwd?: string;
  status: SessionStatus;
  createdAt: Date;
  updatedAt: Date;
}
