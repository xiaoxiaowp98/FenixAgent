import type { EnvironmentRepository } from "../contracts/environment-repository";
import type { Environment, EnvironmentConfigRefs } from "../domain/environment";
import { createEnvironmentId, type EnvironmentId } from "../domain/ids";

/**
 * 创建 environment 时需要的输入。
 */
export interface CreateEnvironmentInput {
  userId: string;
  name: string;
  engineType: string;
  workspacePath: string;
  engineConfigRef?: string;
  config: EnvironmentConfigRefs;
}

/**
 * 管理 engine 无关的 environment 聚合。
 *
 * 这里只处理平台侧的 environment 元数据与默认配置引用，
 * 不负责 engine 实例的启动与停止。
 */
export class EnvironmentService {
  /** 使用 environment 仓储初始化服务。 */
  constructor(private readonly environmentRepository: EnvironmentRepository) {}

  /** 创建并保存一个新的 environment。 */
  async createEnvironment(input: CreateEnvironmentInput): Promise<Environment> {
    const now = new Date();
    const environment: Environment = {
      id: createEnvironmentId(),
      userId: input.userId,
      name: input.name,
      engineType: input.engineType,
      workspacePath: input.workspacePath,
      engineConfigRef: input.engineConfigRef,
      config: input.config,
      createdAt: now,
      updatedAt: now,
    };

    await this.environmentRepository.save(environment);
    return environment;
  }

  /** 按 id 读取单个 environment。 */
  async getEnvironment(environmentId: EnvironmentId): Promise<Environment | undefined> {
    return await this.environmentRepository.getById(environmentId);
  }

  /** 列出某个用户的全部 environment。 */
  async listEnvironments(userId: string): Promise<Environment[]> {
    return await this.environmentRepository.listByUser(userId);
  }

  /** 读取 environment 默认关联的平台配置引用集合。 */
  async getConfigRefs(environmentId: EnvironmentId): Promise<EnvironmentConfigRefs | undefined> {
    const environment = await this.getEnvironment(environmentId);
    return environment?.config;
  }
}
