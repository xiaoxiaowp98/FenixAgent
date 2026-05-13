/** opencode relay handle 的过滤、转发与关闭行为测试。 */
import { describe, expect, mock, test } from "bun:test";
import { RuntimeEventBus } from "@mothership/core";
import { createOpencodeRelayHandle } from "../relay/relay-handle";

class FakeWebSocket {
  readyState = 1;
  sent: string[] = [];
  closed = false;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string | Buffer }) => void) | null = null;
  onclose: ((event: { code?: number; reason?: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closed = true;
    this.onclose?.({ code, reason });
  }
}

describe("createOpencodeRelayHandle", () => {
  // 验证上游收到 keep_alive 时不会向前端透传。
  test("filters keep_alive messages from upstream websocket", async () => {
    const eventBus = new RuntimeEventBus();
    const publish = mock(eventBus.publish.bind(eventBus));
    const webSocket = new FakeWebSocket();

    createOpencodeRelayHandle({
      port: 9001,
      token: "token",
      sessionId: "ses-1",
      eventBus: { ...eventBus, publish },
      webSocketFactory: () => webSocket,
      setIntervalFn: (() => 1) as never,
      clearIntervalFn: (() => {}) as never,
    });

    webSocket.onmessage?.({
      data: [
        JSON.stringify({ type: "keep_alive" }),
        JSON.stringify({ type: "error", message: "keep_alive timeout" }),
        JSON.stringify({ type: "assistant", payload: { content: "hello" } }),
      ].join("\n"),
    });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith({
      type: "relay_message",
      payload: {
        sessionId: "ses-1",
        message: { type: "assistant", payload: { content: "hello" } },
      },
    });
  });

  // 验证前端断开时仅清理 relay 转发器，不代表要终止底层进程。
  test("frontend disconnect closes local relay without extra forwarding", async () => {
    const eventBus = new RuntimeEventBus();
    const publish = mock(eventBus.publish.bind(eventBus));
    const webSocket = new FakeWebSocket();
    const handle = createOpencodeRelayHandle({
      port: 9002,
      token: "token",
      sessionId: "ses-2",
      eventBus: { ...eventBus, publish },
      webSocketFactory: () => webSocket,
      setIntervalFn: (() => 1) as never,
      clearIntervalFn: (() => {}) as never,
    });

    await handle.close(1000, "frontend_disconnect");
    webSocket.onmessage?.({
      data: JSON.stringify({ type: "assistant", payload: { content: "late" } }),
    });

    expect(webSocket.closed).toBe(true);
    expect(publish).not.toHaveBeenCalled();
  });
});
