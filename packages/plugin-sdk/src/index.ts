/**
 * `@mothership/plugin-sdk` 的公共导出面。
 *
 * 第三方 engine 插件通常只需要依赖这个包，而不需要直接引用 core。
 */
export type {
  ConnectRelayInput,
  InjectRuntimeConfigInput,
  ListEngineSessionsInput,
  PrepareEnvironmentInput,
  PreparedEnvironment,
  EngineHealthCheckInput,
  EnginePlugin,
  EnginePluginMeta,
  EngineRuntime,
  StartInstanceInput,
  StartedInstance,
  StopInstanceInput,
} from "./engine-plugin";
export type {
  AgentRuntimeSpec,
  ResolvedAgentConfig,
  ResolvedKnowledgeBinding,
  ResolvedMcpServerConfig,
  ResolvedModelConfig,
  ResolvedSkillConfig,
} from "./engine-runtime-spec";
export type {
  Clock,
  EnvironmentStorePort,
  IdGenerator,
  InstanceStorePort,
  EngineLogger,
  EngineRuntimeContext,
  RuntimeEventBus,
  SecretResolver,
  SessionStorePort,
  WorkspaceResolver,
} from "./engine-runtime-context";
export type {
  EngineHealthStatus,
  EngineRelayHandle,
  EngineRelayMessage,
  EngineRelayState,
  EngineSessionSummary,
} from "./engine-relay";
