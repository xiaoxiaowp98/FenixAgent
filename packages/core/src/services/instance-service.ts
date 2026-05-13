import type {
  Clock,
  IdGenerator,
  EngineLogger,
  EngineRuntime,
  EngineRuntimeContext,
  SecretResolver,
  WorkspaceResolver,
} from "@mothership/plugin-sdk";
import type { InstanceRepository } from "../contracts/instance-repository";
import type { Environment } from "../domain/environment";
import {
  createInstanceId,
  createEngineSessionId,
  type EnvironmentId,
  type InstanceId,
  type EngineSessionId,
  type SessionId,
} from "../domain/ids";
import type { Instance } from "../domain/instance";
import { RuntimeEventBus } from "../events/runtime-event-bus";
import { PluginRegistry } from "../plugins/plugin-registry";
import { RuntimeConfigResolver } from "../runtime/runtime-config-resolver";
import { EnvironmentService } from "./environment-service";
import { SessionService } from "./session-service";

/**
 * 当 engine 插件尚未注册时抛出的具名错误。
 */
export class EnginePluginNotFoundError extends Error {
  constructor(readonly engineId: string) {
    super(`Engine plugin not found: ${engineId}`);
    this.name = "EnginePluginNotFoundError";
  }
}

/**
 * InstanceService 的可选宿主依赖。
 */
export interface InstanceServiceOptions {
  logger?: EngineLogger;
  workspaceResolver?: WorkspaceResolver;
  secretResolver?: SecretResolver;
  clock?: Clock;
  idGenerator?: IdGenerator;
}

/**
 * 负责 environment -> runtimeSpec -> plugin runtime 的实例生命周期编排。
 *
 * 这是 Core 里最接近“宿主调度器”的一层，主要职责包括：
 * - 解析 environment 关联的统一运行时配置
 * - 惰性创建并缓存 engine runtime
 * - 启停 engine 实例并落库
 * - 绑定 engine session 与平台 session
 * - 为 relay 建立 engine 侧连接
 */
export class InstanceService {
  private readonly runtimeByPluginId = new Map<string, EngineRuntime>();
  private readonly logger: EngineLogger;
  private readonly workspaceResolver: WorkspaceResolver;
  private readonly secretResolver: SecretResolver;
  private readonly clock: Clock;
  private readonly idGenerator: IdGenerator;

  /** 使用仓储、resolver 与 registry 初始化实例服务。 */
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly sessionService: SessionService,
    private readonly instanceRepository: InstanceRepository,
    private readonly runtimeConfigResolver: RuntimeConfigResolver,
    private readonly pluginRegistry: PluginRegistry,
    private readonly eventBus: RuntimeEventBus,
    options: InstanceServiceOptions = {},
  ) {
    this.logger = options.logger ?? {
      info() {},
      warn() {},
      error() {},
    };
    const resolveWorkspaceFromRepository = async (environmentId: string): Promise<string> => {
      const environment = await this.environmentService.getEnvironment(environmentId as EnvironmentId);
      return environment?.workspacePath ?? "";
    };
    this.workspaceResolver = options.workspaceResolver ?? {
      resolveWorkspace(environmentId) {
        return resolveWorkspaceFromRepository(environmentId);
      },
      resolveInjectionDir(environmentId) {
        return resolveWorkspaceFromRepository(environmentId);
      },
    };
    this.secretResolver = options.secretResolver ?? {
      resolveSecret(reference) {
        return reference;
      },
    };
    this.clock = options.clock ?? {
      now() {
        return new Date();
      },
    };
    this.idGenerator = options.idGenerator ?? {
      create(prefix) {
        return `${prefix}_${crypto.randomUUID()}`;
      },
    };
  }

  /**
   * 启动一个 environment 对应的新实例。
   *
   * 启动遵循严格的三段式流程：
   * 1. prepareEnvironment — 让 engine 初始化 workspace 等前置资源
   * 2. injectRuntimeConfig — 将平台统一配置翻译并注入 engine 私有配置
   * 3. startInstance — 真正拉起 engine 进程/运行时
   *
   * 这个顺序是固定的，因为 engine 的配置注入通常依赖 workspace 已就绪，
   * 而进程启动又依赖配置已落盘。
   */
  async startInstance(environmentId: EnvironmentId): Promise<Instance> {
    const environment = await this.requireEnvironment(environmentId);
    // 将 environment 上引用的 engine/model/agent/skill/mcp 展开为
    // engine 可直接消费的统一 runtime spec，避免每个插件重复解析。
    const runtimeSpec = await this.runtimeConfigResolver.resolve({ environment });
    const pluginId = environment.engineType;
    const runtime = this.getRuntime(pluginId);
    const instanceId = createInstanceId();

    const prepared = await runtime.prepareEnvironment({
      environmentId,
      workspacePath: environment.workspacePath,
    });

    // injectRuntimeConfig 是可选的——不是所有 engine 都需要平台注入配置。
    if (runtime.injectRuntimeConfig) {
      await runtime.injectRuntimeConfig({
        environmentId,
        runtimeSpec,
      });
    }

    const started = await runtime.startInstance({
      environmentId,
      instanceId,
    });

    const now = this.clock.now();
    // runtimeMetadata 把 prepare 和 start 两个阶段的 engine 返回信息
    // 都打包存储。Core 不解析这些字段，但 UI 或诊断工具可能需要它们。
    const instance: Instance = {
      id: instanceId,
      environmentId,
      engineInstanceId: started.engineInstanceId,
      status: "running",
      startedAt: now,
      runtimeMetadata: {
        preparedEnvironment: prepared,
        ...(prepared.metadata ? { preparedMetadata: prepared.metadata } : {}),
        ...(started.metadata ? { startedMetadata: started.metadata } : {}),
      },
    };

    await this.instanceRepository.save(instance);
    await this.eventBus.publish({
      type: "instance_started",
      payload: { environmentId, instanceId: instance.id },
    });
    return instance;
  }

  /** 停止一个已启动的实例。 */
  async stopInstance(instanceId: InstanceId): Promise<void> {
    const instance = await this.instanceRepository.getById(instanceId);
    if (!instance) {
      return;
    }

    const environment = await this.requireEnvironment(instance.environmentId);
    const runtime = this.getRuntime(environment.engineType);
    await runtime.stopInstance({
      environmentId: instance.environmentId,
      instanceId,
    });

    const updated: Instance = {
      ...instance,
      status: "stopped",
      stoppedAt: this.clock.now(),
    };
    await this.instanceRepository.save(updated);
    await this.eventBus.publish({
      type: "instance_stopped",
      payload: { environmentId: instance.environmentId, instanceId },
    });
  }

  /** 列出某个 environment 下当前运行中的实例。 */
  async listInstances(environmentId: EnvironmentId): Promise<Instance[]> {
    return await this.instanceRepository.getRunningByEnvironment(environmentId);
  }

  /**
   * 将 engine 原生 session id 绑定到某个实例名下的平台会话。
   *
   * 这是"去重绑定"的关键入口：如果同一个 engine session 之前已经被其他实例
   * 报告过（例如断连重连场景），则只把平台会话重新 assign 到当前实例，
   * 避免为同一个 engine 会话生成多条重复的平台 session 记录。
   */
  async bindEngineSession(
    instanceId: InstanceId,
    engineSessionId: EngineSessionId,
  ) {
    const existing = await this.sessionService.findByEngineSessionId(engineSessionId);
    if (existing) {
      // engine session 已存在 → 只更新 instance 绑定，不创建新记录。
      return (await this.sessionService.assignInstance(existing.id, instanceId)) ?? existing;
    }

    const instance = await this.instanceRepository.getById(instanceId);
    if (!instance) {
      return undefined;
    }

    return await this.sessionService.createSession({
      environmentId: instance.environmentId,
      instanceId,
      engineSessionId,
      status: "active",
    });
  }

  /** 建立某个会话对应实例的 engine relay 句柄。 */
  async connectRelay(sessionId: SessionId) {
    const session = await this.sessionService.getById(sessionId);
    if (!session?.instanceId) {
      throw new Error(`Session is not bound to an instance: ${sessionId}`);
    }

    const instance = await this.instanceRepository.getById(session.instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${session.instanceId}`);
    }

    const environment = await this.requireEnvironment(instance.environmentId);
    const runtime = this.getRuntime(environment.engineType);
    return await runtime.connectRelay({
      environmentId: instance.environmentId,
      instanceId: session.instanceId,
      sessionId,
    });
  }

  /** 将 engine 原生 session 字符串包装为平台 branded 类型。 */
  createEngineSessionId(value: string): EngineSessionId {
    return createEngineSessionId(value);
  }

  /**
   * 读取或惰性初始化指定 engine 对应的 runtime。
   *
   * 每个 engine plugin 在整个 server 进程生命周期内只创建一个 runtime 实例，
   * 所有 environment 共用同一个 runtime。这样 plugin 内部可以自行管理
   * 进程池、连接池等跨实例的共享资源。
   */
  private getRuntime(pluginId: string): EngineRuntime {
    const cached = this.runtimeByPluginId.get(pluginId);
    if (cached) {
      return cached;
    }

    const plugin = this.pluginRegistry.get(pluginId);
    if (!plugin) {
      throw new EnginePluginNotFoundError(pluginId);
    }

    // 将宿主能力（日志、事件总线、仓储适配器等）打包为 context 传给 plugin，
    // 让 plugin 在不直接依赖 server 模块的前提下使用这些能力。
    const runtime = plugin.createRuntime(this.createRuntimeContext());
    this.runtimeByPluginId.set(pluginId, runtime);
    return runtime;
  }

  /** 组装传给 engine runtime 的宿主上下文。 */
  private createRuntimeContext(): EngineRuntimeContext {
    return {
      logger: this.logger,
      eventBus: this.eventBus,
      environments: this.environmentServiceAdapter,
      instances: this.instanceRepository,
      sessions: this.sessionServiceAdapter,
      workspaceResolver: this.workspaceResolver,
      secretResolver: this.secretResolver,
      clock: this.clock,
      idGenerator: this.idGenerator,
    };
  }

  /** 兼容 engine runtime 所需的 environment store 端口。 */
  private readonly environmentServiceAdapter = {
    getById: (environmentId: string) => {
      return this.environmentService.getEnvironment(environmentId as EnvironmentId);
    },
    save: (record: unknown) => {
      // 当前 engine runtime 只需要读 environment，不允许绕过 service 直接写入。
      void record;
    },
    listByUser: (userId: string) => {
      return this.environmentService.listEnvironments(userId);
    },
  };

  /** 兼容 engine runtime 所需的 session store 端口。 */
  private readonly sessionServiceAdapter = {
    create: (record: unknown) => {
      // session 创建统一经由 SessionService / bindEngineSession 控制。
      void record;
    },
    findByEngineSessionId: (engineSessionId: string) => {
      return this.sessionService.findByEngineSessionId(createEngineSessionId(engineSessionId));
    },
    listByEnvironment: (environmentId: string) => {
      return this.sessionService.listByEnvironment(environmentId as EnvironmentId);
    },
  };

  /** 确保 environment 存在，并刷新内部 workspace 索引。 */
  private async requireEnvironment(environmentId: EnvironmentId): Promise<Environment> {
    const environment = await this.environmentService.getEnvironment(environmentId);
    if (!environment) {
      throw new Error(`Environment not found: ${environmentId}`);
    }
    return environment;
  }
}
