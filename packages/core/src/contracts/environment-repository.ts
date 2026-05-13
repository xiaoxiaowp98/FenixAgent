import type { Environment } from "../domain/environment";
import type { EnvironmentId } from "../domain/ids";

/**
 * Environment 聚合的持久化契约。
 */
export interface EnvironmentRepository {
  /** 按主键读取单个 environment。 */
  getById(id: EnvironmentId): Promise<Environment | undefined> | Environment | undefined;
  /** 创建或覆盖保存 environment。 */
  save(environment: Environment): Promise<void> | void;
  /** 列出某个用户名下的全部 environment。 */
  listByUser(userId: string): Promise<Environment[]> | Environment[];
}
