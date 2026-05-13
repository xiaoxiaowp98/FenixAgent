import type { Instance } from "../domain/instance";
import type { EnvironmentId, InstanceId } from "../domain/ids";

/**
 * Instance 聚合的持久化契约。
 */
export interface InstanceRepository {
  /** 创建或覆盖保存 instance。 */
  save(instance: Instance): Promise<void> | void;
  /** 按主键读取单个 instance。 */
  getById(instanceId: InstanceId): Promise<Instance | undefined> | Instance | undefined;
  /** 返回某个 environment 下当前处于 running 状态的实例。 */
  getRunningByEnvironment(environmentId: EnvironmentId): Promise<Instance[]> | Instance[];
  /** 单独更新实例状态，避免调用方自己读改写。 */
  updateStatus(instanceId: InstanceId, status: Instance["status"]): Promise<void> | void;
}
