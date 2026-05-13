import type { EngineRelayMessage } from "@mothership/plugin-sdk";
import { RuntimeEventBus } from "../events/runtime-event-bus";
import type { SessionId } from "../domain/ids";
import { SessionService } from "./session-service";
import { InstanceService } from "./instance-service";

/**
 * Core 与外层 relay transport 之间的最小发送接口。
 */
export interface RelayTransport {
  send(message: EngineRelayMessage): Promise<void> | void;
  close?(code?: number, reason?: string): Promise<void> | void;
}

interface ActiveRelay {
  relayId: string;
  sessionId: SessionId;
  transport: RelayTransport;
  handle: {
    send(message: EngineRelayMessage): Promise<void> | void;
    close(code?: number, reason?: string): Promise<void> | void;
  };
  unsubscribe: () => void;
}

/**
 * 基于 sessionId 路由到 engine runtime 的统一 relay 编排器。
 *
 * 这层把“外部 transport”和“engine relay handle”接在一起：
 * - 对外暴露 connect / send / disconnect
 * - 对内订阅 RuntimeEventBus，把 engine 事件转发给 transport
 */
export class RelayOrchestrator {
  private readonly activeRelays = new Map<string, ActiveRelay>();

  /** 使用实例服务与事件总线初始化 orchestrator。 */
  constructor(
    private readonly sessionService: SessionService,
    private readonly instanceService: InstanceService,
    private readonly eventBus: RuntimeEventBus,
  ) {}

  /**
   * 建立一个 session 级别的 relay，返回 relay 标识用于后续 send/disconnect。
   *
   * 连接建立后，orchestrator 会：
   * 1. 通过 InstanceService 获取 engine 侧的 relay handle
   * 2. 订阅 RuntimeEventBus，把 engine 事件（relay_message / relay_closed）
   *    转发到外部 transport（如 WebSocket）
   */
  async connect(sessionId: SessionId, transport: RelayTransport): Promise<string> {
    const session = await this.sessionService.getById(sessionId);
    if (!session?.instanceId) {
      throw new Error(`Session is not bound to an instance: ${sessionId}`);
    }

    const relayId = `relay_${crypto.randomUUID()}`;
    // 获取 engine 侧的 relay 连接句柄，后续 send 直接转发给 engine。
    const handle = await this.instanceService.connectRelay(sessionId);
    // 订阅共享事件总线，将 engine 的 relay 消息和关闭事件桥接到 transport。
    const unsubscribe = this.eventBus.subscribe(async (event) => {
      const payload = event.payload as { sessionId?: SessionId; message?: EngineRelayMessage } | undefined;
      // 事件总线是进程级共享的，必须按 session 过滤，
      // 确保只把属于当前 relay 的事件转发给当前 transport。
      if (payload?.sessionId !== sessionId) {
        return;
      }

      if (event.type === "relay_message" && payload.message) {
        await transport.send(payload.message);
        return;
      }

      if (event.type === "relay_closed") {
        await transport.close?.(1000, "engine_closed");
      }
    });

    this.activeRelays.set(relayId, {
      relayId,
      sessionId,
      transport,
      handle,
      unsubscribe,
    });
    return relayId;
  }

  /** 向 engine relay 发送一条消息。 */
  async send(relayId: string, message: EngineRelayMessage): Promise<void> {
    const relay = this.activeRelays.get(relayId);
    if (!relay) {
      return;
    }

    await relay.handle.send(message);
  }

  /** 主动断开一个 relay，并清理对应订阅。 */
  async disconnect(relayId: string): Promise<void> {
    const relay = this.activeRelays.get(relayId);
    if (!relay) {
      return;
    }

    relay.unsubscribe();
    this.activeRelays.delete(relayId);
    await relay.handle.close(1000, "relay_disconnect");
  }
}
