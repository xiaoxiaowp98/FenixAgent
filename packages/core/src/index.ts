/**
 * `@mothership/core` 的公共导出面。
 *
 * 这里重新导出领域类型、仓储契约、服务和测试工具，
 * 让 server 和 engine 插件都能从单一入口引用 core 能力。
 */
export type {
  Environment,
  EnvironmentConfigRefs,
} from "./domain/environment";
export type { Instance, InstanceStatus } from "./domain/instance";
export type {
  EnvironmentId,
  InstanceId,
  EngineSessionId,
  SessionId,
} from "./domain/ids";
export {
  createEnvironmentId,
  createInstanceId,
  createEngineSessionId,
  createSessionId,
} from "./domain/ids";
export type { Session, SessionStatus } from "./domain/session";
export type {
  AgentConfigRecord,
  ConfigRepository,
  McpServerConfigRecord,
  ModelConfigRecord,
  EngineConfigRecord,
  SkillConfigRecord,
} from "./contracts/config-repository";
export type { EnvironmentRepository } from "./contracts/environment-repository";
export type { InstanceRepository } from "./contracts/instance-repository";
export type { SessionRepository } from "./contracts/session-repository";
export { PluginRegistry } from "./plugins/plugin-registry";
export {
  RuntimeConfigResolutionError,
  RuntimeConfigResolver,
} from "./runtime/runtime-config-resolver";
export type { ResolveRuntimeConfigInput } from "./runtime/runtime-config-resolver";
export type { RuntimeEvent, RuntimeEventListener } from "./events/runtime-event-bus";
export { RuntimeEventBus } from "./events/runtime-event-bus";
export type { CreateEnvironmentInput } from "./services/environment-service";
export { EnvironmentService } from "./services/environment-service";
export type { CreateSessionInput } from "./services/session-service";
export { SessionService } from "./services/session-service";
export type { InstanceServiceOptions } from "./services/instance-service";
export { InstanceService, EnginePluginNotFoundError } from "./services/instance-service";
export type { RelayTransport } from "./services/relay-orchestrator";
export { RelayOrchestrator } from "./services/relay-orchestrator";
export { CoreFacade } from "./services/core-facade";
export {
  InMemoryConfigRepository,
  InMemoryEnvironmentRepository,
  InMemoryInstanceRepository,
  InMemorySessionRepository,
  resetRepositories,
} from "./testing/in-memory-repositories";
export type { InMemoryConfigSnapshot } from "./testing/in-memory-repositories";
