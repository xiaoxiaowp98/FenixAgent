// src/services/environment.ts — barrel re-export
// 所有导出名称保持不变，下游 import 路径无需修改。

// ── core ──
export {
  validateWorkspacePath,
  ensureWorkspaceDir,
  KEBAB_CASE_RE,
  generateEnvSecret,
  toResponse,
  sanitizeResponse,
  getOwnedEnvironment,
  deleteEnvironment,
} from "./environment-core";

export type {
  CreateWebEnvironmentParams,
  UpdateWebEnvironmentParams,
} from "./environment-core";

// ── web ──
export {
  createWebEnvironment,
  updateWebEnvironment,
  listEnvironmentsWithInstances,
} from "./environment-web";

// ── acp ──
export {
  getEnvironmentBySecret,
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
