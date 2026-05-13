/**
 * Engine runtime 可见的宿主能力端口定义。
 *
 * 这些接口刻意保持抽象，方便插件在不依赖具体 server 实现的前提下运行和测试。
 */
/**
 * Engine 运行时使用的统一日志出口。
 */
export interface EngineLogger {
  /** 记录常规运行信息。 */
  info(message: string, metadata?: Record<string, unknown>): void;
  /** 记录可恢复的异常或退化行为。 */
  warn(message: string, metadata?: Record<string, unknown>): void;
  /** 记录错误信息，通常用于启动、连接或注入失败。 */
  error(message: string, metadata?: Record<string, unknown>): void;
}

/**
 * Engine 向宿主发布运行时事件的最小接口。
 */
export interface RuntimeEventBus {
  /** 发布 engine 生命周期或会话相关事件。 */
  publish(event: { type: string; payload?: unknown }): Promise<void> | void;
}

/**
 * Engine 可访问的 environment 持久化读写能力。
 */
export interface EnvironmentStorePort {
  /** 按 environment 标识读取记录。 */
  getById(id: string): Promise<unknown> | unknown;
  /** 保存 environment 记录。 */
  save(record: unknown): Promise<void> | void;
  /** 列出某个用户可见的 environment。 */
  listByUser(userId: string): Promise<unknown[]> | unknown[];
}

/**
 * Engine 可访问的 instance 持久化读写能力。
 */
export interface InstanceStorePort {
  /** 保存 instance 记录。 */
  save(record: unknown): Promise<void> | void;
  /** 查询某个 environment 下正在运行的实例。 */
  getRunningByEnvironment(environmentId: string): Promise<unknown[]> | unknown[];
  /** 更新实例当前状态。 */
  updateStatus(instanceId: string, status: string): Promise<void> | void;
}

/**
 * Engine 可访问的 session 持久化读写能力。
 */
export interface SessionStorePort {
  /** 创建一条新的会话记录。 */
  create(record: unknown): Promise<void> | void;
  /** 用 engine 原生 session id 回查平台会话。 */
  findByEngineSessionId(engineSessionId: string): Promise<unknown> | unknown;
  /** 列出某个 environment 下的会话。 */
  listByEnvironment(environmentId: string): Promise<unknown[]> | unknown[];
}

/**
 * 解析 engine 运行所需工作目录的能力。
 */
export interface WorkspaceResolver {
  /** 返回 environment 对应的主 workspace 目录。 */
  resolveWorkspace(environmentId: string): Promise<string> | string;
  /** 返回配置注入、临时文件等资源的写入目录。 */
  resolveInjectionDir(environmentId: string): Promise<string> | string;
}

/**
 * 解析密钥引用或环境变量占位符。
 */
export interface SecretResolver {
  /** 将引用值解析为 engine 最终可用的密钥。 */
  resolveSecret(reference: string): Promise<string> | string;
}

/**
 * 统一时间来源，方便测试和可重复性控制。
 */
export interface Clock {
  /** 返回当前时间。 */
  now(): Date;
}

/**
 * 统一 ID 生成入口，避免 engine 自己拼接不一致格式。
 */
export interface IdGenerator {
  /** 基于前缀生成一个新的运行时标识。 */
  create(prefix: string): string;
}

/**
 * Core 提供给 engine runtime 的受控宿主能力集合。
 *
 * 设计意图：
 * - engine 只能通过这个 context 访问宿主能力，不能直接 import server 模块
 * - 所有端口都是接口（port），不是具体实现，方便测试时替换为 mock
 * - 这层抽象让 plugin 可以独立于 server 进程进行单元测试
 */
export interface EngineRuntimeContext {
  /** 统一日志出口，由宿主决定日志去向（控制台 / 文件 / 远程）。 */
  logger: EngineLogger;
  /** 运行时事件总线，用于向 Core 发布 relay 消息、生命周期事件等。 */
  eventBus: RuntimeEventBus;
  /** Environment 仓储的只读/受限写入视图。 */
  environments: EnvironmentStorePort;
  /** Instance 仓储的受限视图。 */
  instances: InstanceStorePort;
  /** Session 仓储的受限视图。 */
  sessions: SessionStorePort;
  /** 解析 environment 对应的 workspace 目录路径。 */
  workspaceResolver: WorkspaceResolver;
  /** 解析 `{env:XXX}` 占位符和密钥引用。 */
  secretResolver: SecretResolver;
  /** 统一时间来源，确保可测试性。 */
  clock: Clock;
  /** 统一 ID 生成器，确保 ID 格式一致性。 */
  idGenerator: IdGenerator;
}
