import type { EngineRelayHandle, EngineRelayMessage, RuntimeEventBus } from "@mothership/plugin-sdk";

const INSTANCE_LOCAL_WS_HOST = "127.0.0.1";
const RELAY_KEEPALIVE_INTERVAL_MS = 20_000;

interface RelayWebSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data: string | Buffer }) => void) | null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

interface OpencodeRelayHandleOptions {
  port: number;
  token: string;
  sessionId?: string;
  eventBus: RuntimeEventBus;
  webSocketFactory?: (url: string) => RelayWebSocket;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

/**
 * 过滤 acp-link 上游消息，只向 Core 透传真正的业务事件。
 *
 * relay 层会拦掉 keep_alive 和由 keep_alive 触发的伪错误，
 * 避免它们污染控制面的统一事件流。
 */
function forwardFilteredLines(
  text: string,
  forward: (message: EngineRelayMessage) => void,
): void {
  for (const line of text.split("\n").filter((entry) => entry.trim())) {
    const message = JSON.parse(line) as EngineRelayMessage & {
      message?: string;
      payload?: { message?: string };
    };

    if (message.type === "keep_alive") {
      continue;
    }

    const errorMessage =
      typeof message.message === "string"
        ? message.message
        : typeof message.payload?.message === "string"
          ? message.payload.message
          : undefined;

    if (message.type === "error" && errorMessage?.includes("keep_alive")) {
      continue;
    }

    forward(message);
  }
}

/**
 * opencode 本地 WebSocket relay 的具体实现。
 *
 * 核心职责：
 * - 直连 acp-link 暴露的本地 WS（127.0.0.1:${port}/ws）
 * - 定期发送 keep_alive 防止空闲连接被 acp-link 或 OS 关闭
 * - 把 acp-link 上行消息过滤后发布到 RuntimeEventBus
 * - 把 Core 下行的 relay 消息转发到 acp-link
 */
class OpencodeRelayHandle implements EngineRelayHandle {
  readonly state = "open" as const;
  private readonly webSocket: RelayWebSocket;
  private readonly keepAliveTimer: ReturnType<typeof setInterval>;
  private closed = false;

  constructor(private readonly options: OpencodeRelayHandleOptions) {
    const createWebSocket = options.webSocketFactory ?? ((url) => new WebSocket(url) as RelayWebSocket);
    // 直连 acp-link 本地 WS；token 来自 acp-link 启动时 stdout 打印的 64 位 hex。
    this.webSocket = createWebSocket(
      `ws://${INSTANCE_LOCAL_WS_HOST}:${options.port}/ws?token=${encodeURIComponent(options.token)}`,
    );
    // 每 20s 发送一次 keep_alive，保持与 acp-link 的本地 WS 连接活跃。
    this.keepAliveTimer = (options.setIntervalFn ?? setInterval)(() => {
      if (this.webSocket.readyState === 1) {
        this.webSocket.send(JSON.stringify({ type: "keep_alive" }));
      }
    }, RELAY_KEEPALIVE_INTERVAL_MS);

    this.webSocket.onmessage = (event) => {
      if (this.closed) {
        return;
      }

      const text = typeof event.data === "string" ? event.data : event.data.toString();
      // 过滤掉 keep_alive 和因 keep_alive 引起的伪错误消息，
      // 只把真正的业务事件发布到 Core 的共享事件总线。
      forwardFilteredLines(text, (message) => {
        void this.options.eventBus.publish({
          type: "relay_message",
          payload: {
            sessionId: this.options.sessionId,
            message,
          },
        });
      });
    };

    this.webSocket.onclose = (event) => {
      if (this.closed) {
        return;
      }

      this.closed = true;
      (this.options.clearIntervalFn ?? clearInterval)(this.keepAliveTimer);
      // 通知 Core：engine 侧 relay 连接已断开，Core 可以据此清理资源。
      void this.options.eventBus.publish({
        type: "relay_closed",
        payload: {
          sessionId: this.options.sessionId,
          code: event.code,
          reason: event.reason,
        },
      });
    };
  }

  /** 向本地 acp-link relay 转发一条消息。 */
  async send(message: EngineRelayMessage): Promise<void> {
    this.webSocket.send(JSON.stringify(message));
  }

  /** 关闭当前 relay 连接，但不会停止底层进程。 */
  async close(code?: number, reason?: string): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    (this.options.clearIntervalFn ?? clearInterval)(this.keepAliveTimer);
    this.webSocket.onmessage = null;
    this.webSocket.close(code, reason);
  }
}

/**
 * 创建一个面向 opencode 本地 WS 的 EngineRelayHandle。
 */
export function createOpencodeRelayHandle(
  options: OpencodeRelayHandleOptions,
): EngineRelayHandle {
  return new OpencodeRelayHandle(options);
}
