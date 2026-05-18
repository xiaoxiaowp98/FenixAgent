/**
 * Transport 接口 — Agent 通信的抽象层。
 *
 * AgentExecutor 通过此接口与 AI Agent 通信，
 * 不依赖具体的 WebSocket/HTTP 实现。
 */

/** Agent 请求参数 */
export interface AgentRequest {
  prompt: string;
  agent?: string;
  skill?: string;
  cwd?: string;
  signal?: AbortSignal;
}

/** Agent 响应结果 */
export interface AgentResponse {
  stdout: string;
  exit_code: number;
  tokens?: { input: number; output: number };
  model?: string;
  latency_ms?: number;
}

/** Agent 会话 — 单次连接内可多次执行请求 */
export interface AgentSession {
  execute(request: AgentRequest): Promise<AgentResponse>;
}

/** Transport — 连接管理 + 会话创建 */
export interface Transport {
  connect(agentId: string, options?: { cwd?: string }): Promise<AgentSession>;
  disconnect?(): Promise<void>;
  isReady?(): boolean;
}
