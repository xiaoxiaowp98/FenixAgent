/**
 * Core 内部与 engine runtime 之间共享的最小事件总线实现。
 *
 * 它只解决“发布/订阅”这一件事，不承担事件持久化、重放或跨进程分发职责。
 */
/**
 * Core 运行期事件的最小结构。
 */
export interface RuntimeEvent {
  type: string;
  payload?: unknown;
}

/**
 * RuntimeEventBus 的订阅回调。
 */
export type RuntimeEventListener = (event: RuntimeEvent) => void | Promise<void>;

/**
 * 给 Core 与 engine runtime 共用的轻量事件总线。
 */
export class RuntimeEventBus {
  private readonly listeners = new Set<RuntimeEventListener>();

  /** 发布一条运行时事件给当前所有订阅者。 */
  async publish(event: RuntimeEvent): Promise<void> {
    for (const listener of this.listeners) {
      await listener(event);
    }
  }

  /** 订阅事件流，并返回取消订阅函数。 */
  subscribe(listener: RuntimeEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
