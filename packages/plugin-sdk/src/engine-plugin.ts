import type {
    EngineRelayHandle,
    EngineHealthStatus,
    EngineSessionSummary,
} from "./engine-relay";
import type { EngineRuntimeContext } from "./engine-runtime-context";
import type { AgentRuntimeSpec } from "./engine-runtime-spec";

/**
 * Engine 插件的静态元信息和能力声明。
 */
export interface EnginePluginMeta {
    /** 插件稳定标识，供注册和查找使用。 */
    id: string;
    /** 面向 UI 或日志展示的人类可读名称。 */
    displayName: string;
    /** 插件版本。 */
    version: string;
    /** Core 可依赖的显式能力开关。 */
    capabilities: {
        /** 是否支持同一 environment 启动多个实例。 */
        multiInstance: boolean;
    };
}

/** 创建 engine 运行前的环境准备输入。 */
export interface PrepareEnvironmentInput {
    environmentId: string;
    workspacePath: string;
}

/** 环境准备完成后返回的标准化结果。 */
export interface PreparedEnvironment {
    environmentId: string;
    workspacePath: string;
    metadata?: Record<string, unknown>;
}

/** 注入统一运行时配置时的输入。 */
export interface InjectRuntimeConfigInput {
    environmentId: string;
    runtimeSpec: AgentRuntimeSpec;
}

/** 启动 engine 实例时的输入。 */
export interface StartInstanceInput {
    environmentId: string;
    instanceId: string;
}

/** engine 实例启动成功后的返回值。 */
export interface StartedInstance {
    instanceId: string;
    engineInstanceId?: string;
    metadata?: Record<string, unknown>;
}

/** 停止 engine 实例时的输入。 */
export interface StopInstanceInput {
    environmentId: string;
    instanceId: string;
}

/** 建立 relay 通道时的输入。 */
export interface ConnectRelayInput {
    environmentId: string;
    instanceId: string;
    sessionId?: string;
}

/** 查询 engine 原生会话列表时的过滤条件。 */
export interface ListEngineSessionsInput {
    environmentId: string;
    cwd?: string;
}

/** 主动探测 engine 实例健康状态时的输入。 */
export interface EngineHealthCheckInput {
    environmentId: string;
    instanceId?: string;
}

/**
 * 单个 engine 在运行期需要实现的能力集合。
 *
 * 这是一个"生命周期接口"：每个方法的调用顺序由 Core 编排，
 * plugin 只需实现每一步的具体行为。调用顺序为：
 *
 *   prepareEnvironment → injectRuntimeConfig? → startInstance
 *                      → connectRelay → (消息流转) → stopInstance
 *
 * 标记 `?` 的方法为可选：Core 在调用前会检查方法是否存在。
 */
export interface EngineRuntime {
    type: "memory" | "websocket" | "http";
    status: "idle" | "running" | "stop" | "error";
    channel: EngineChannel;
    /** 启动前准备 workspace、目录或附加元数据。 */
    prepareEnvironment(
        input: PrepareEnvironmentInput,
    ): Promise<PreparedEnvironment>;
    /** 将统一 runtime spec 翻译并注入到 engine 私有配置文件。 */
    // injectRuntimeConfig?(input: InjectRuntimeConfigInput): Promise<void>;
    /** 启动一个新的 engine 实例（进程、容器或远端运行时）。 */
    startInstance(input: StartInstanceInput): Promise<StartedInstance>;
    /** 建立与 engine 的实时消息 relay 通道。 */
    connectRelay(input: ConnectRelayInput): Promise<EngineRelayHandle>;
    /** 停止一个已启动的 engine 实例并释放资源。 */
    stopInstance(input: StopInstanceInput): Promise<void>;
    /** 列出 engine 侧已有会话，用于恢复/发现已有工作上下文。 */
    // listSessions?(
    //     input: ListEngineSessionsInput,
    // ): Promise<EngineSessionSummary[]>;
    /** 主动探测 engine 实例健康状态。 */
    // getHealth?(input: EngineHealthCheckInput): Promise<EngineHealthStatus>;
}

export interface EngineChannel {
    type: "ws" | "stdio";
    uri: () => string;
}

/**
 * Engine 插件主入口。
 *
 * 每个 npm 包导出一个 `createEnginePlugin()` 工厂函数，
 * 返回实现此接口的对象。Core 通过 `PluginRegistry` 管理所有已注册插件，
 * 在需要时调用 `createRuntime(ctx)` 获取运行期能力。
 */
export interface EnginePlugin {
    /** 插件静态元信息（id、名称、版本、能力声明）。 */
    meta: EnginePluginMeta;
    /** 基于宿主提供的受控上下文创建 engine runtime 实例。 */
    createRuntime(ctx: EngineRuntimeContext): EngineRuntime;
}
