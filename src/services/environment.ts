/**
 * environment.ts — barrel re-export
 *
 * 所有实现已拆分到：
 *   environment-core.ts — 共享常量、类型、工具函数
 *   environment-web.ts  — Web 控制面板 CRUD
 *   environment-acp.ts  — ACP/Bridge 注册编排 + Transport 状态操作
 */
export {
  validateWorkspacePath,
  ensureWorkspaceDir,
  sanitizeResponse,
  getOwnedEnvironment,
  deleteEnvironment,
} from "./environment-core";

export type {
  CreateWebEnvironmentParams,
  UpdateWebEnvironmentParams,
} from "./environment-core";

export {
  createWebEnvironment,
  updateWebEnvironment,
  listEnvironmentsWithInstances,
} from "./environment-web";

export {
  registerEnvironment,
  deregisterEnvironment,
  getEnvironment,
  updatePollTime,
  listActiveEnvironments,
  listActiveEnvironmentsResponse,
  listActiveEnvironmentsByUsername,
  reconnectEnvironment,
  markEnvironmentActive,
  markEnvironmentIdle,
  touchEnvironmentPoll,
  updateEnvironmentCapabilities,
  createTemporaryEnvironment,
  registerBridge,
  reconnectBridge,
  deregisterBridge,
  handleAcpConnect,
  handleAcpRegister,
  handleAcpIdentify,
  handleAcpDisconnect,
} from "./environment-acp";

export type {
  BridgeRegistrationInput,
  BridgeRegistrationResult,
} from "./environment-acp";
