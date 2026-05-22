/**
 * 从后端 Zod schema 重导出纯类型。
 * SDK 模块类使用这些类型作为方法参数和返回值。
 * 注意：此处仅导出 type（通过 `export type`），不引入 Zod runtime。
 */

// ── Common ──
export type { PaginationParams } from "../../../src/schemas/common.schema";
export type { OkResponse, StatusOkResponse } from "../../../src/schemas/common.schema";

// ── Environment ──
export type {
  EnvironmentInfo,
  EnvironmentListResponse,
  CreateEnvironmentRequest,
  UpdateEnvironmentRequest,
  EnterEnvironmentResponse,
  ListInstancesResponse,
  UpdateEnvironmentResponse,
  DeleteEnvironmentResponse,
} from "../../../src/schemas/environment.schema";

// ── Instance ──
export type {
  InstanceInfo,
  InstanceStatus,
  SpawnInstanceFromEnvironmentRequest,
  InstanceListResponse,
  DeleteInstanceResponse,
} from "../../../src/schemas/instance.schema";

// ── Session ──
export type {
  SessionResponse,
  SessionSummary,
  SessionEvent,
  SessionHistory,
  SessionListResponse,
  SendEventResponse,
  InterruptResponse,
} from "../../../src/schemas/session.schema";

// ── Config ──
export type {
  ConfigAction,
  ConfigBody,
  ProviderInfo,
  ProviderDetail,
  ModelEntry,
  ModelConfig,
  AgentInfo,
  AgentDetail,
  SkillInfo,
  SkillSourceInfo,
  McpServerInfo,
  McpServerDetail,
  McpToolInfo,
  McpInspectResult,
} from "../../../src/schemas/config.schema";

// ── Task ──
export type {
  TaskInfo,
  ExecutionLogInfo,
  PaginatedLogs,
  CreateTaskRequest,
  UpdateTaskRequest,
  DeleteTaskResponse,
  ToggleTaskResponse,
  TriggerTaskResponse,
  ClearTaskLogsResponse,
} from "../../../src/schemas/task.schema";

// ── File ──
export type {
  FileEntry,
  FileListResponse,
  FileContent,
  FileUploadResponse,
  FileWriteResult,
} from "../../../src/schemas/file.schema";

// ── S3 File ──
export type {
  S3PresignGetQuery,
  S3PresignGetResponse,
  S3PresignPutBody,
  S3PresignPutResponse,
  S3FileListQuery,
  S3FileEntry,
  S3FileListResponse,
  S3UploadResponse,
} from "../../../src/schemas/s3-file.schema";

// ── Knowledge ──
export type {
  KnowledgeBaseInfo,
  KnowledgeResourceItem,
  CreateKnowledgeBaseRequest,
  UpdateKnowledgeBaseRequest,
  KnowledgeBaseListResponse,
  DeleteKnowledgeBaseResponse,
  UploadKnowledgeResourcesResponse,
  ImportKnowledgeUrlResponse,
  DeleteKnowledgeResourceResponse,
} from "../../../src/schemas/knowledge.schema";

// ── Channel ──
export type {
  ChannelProviderDescriptor,
  HermesStatus,
  ChannelBinding,
  CreateChannelBindingRequest,
  ChannelProviderListResponse,
  ChannelBindingListResponse,
  CreateChannelBindingResponse,
  DeleteChannelBindingResponse,
  UpdateChannelBindingResponse,
} from "../../../src/schemas/channel.schema";

// ── V1 ──
export type { BridgeRegistrationRequest, BridgeRegistrationResponse } from "../../../src/schemas/v1-environment.schema";
export type {
  CreateSessionRequest,
  UpdateSessionRequest,
  SendEventsRequest,
  V1CreateSessionResponse,
  V1GetSessionResponse,
  V1SendEventsResponse,
} from "../../../src/schemas/v1-session.schema";

// ── V2 ──
export type { CreateCodeSessionRequest, CreateCodeSessionResponse, CodeSessionBridgeResponse } from "../../../src/schemas/v2-code-session.schema";
export type { UpdateWorkerRequest, GetWorkerResponse, UpdateWorkerResponse, WorkerHeartbeatResponse } from "../../../src/schemas/v2-worker.schema";
export type {
  WorkerEventsRequest,
  WorkerStateRequest,
  WorkerEventsResponse,
} from "../../../src/schemas/v2-worker-events.schema";
