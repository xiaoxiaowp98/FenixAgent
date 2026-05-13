import type { EnvironmentId, InstanceId } from "./ids";

export type InstanceStatus = "starting" | "running" | "stopped" | "error";

/**
 * 某个 environment 一次实际启动出来的 engine 运行实体。
 *
 * 一条 instance 记录代表“平台视角的一次启动”，
 * 不直接等同于 engine 自身的进程号、容器 ID 或远端 runtime ID。
 */
export interface Instance {
  id: InstanceId;
  /** 该实例归属的 environment。 */
  environmentId: EnvironmentId;
  /** engine 自身返回的实例标识；与平台 instance id 分离保存。 */
  engineInstanceId?: string;
  status: InstanceStatus;
  startedAt?: Date;
  stoppedAt?: Date;
  /** engine 扩展元数据，Core 只存储不解释其内部结构。 */
  runtimeMetadata: Record<string, unknown>;
}
