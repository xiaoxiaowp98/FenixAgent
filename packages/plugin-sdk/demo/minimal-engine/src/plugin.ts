/**
 * `@mothership/plugin-sdk` demo engine 的最小实现。
 *
 * 这个文件主要作为第三方插件作者的参考模板，演示 createEnginePlugin、
 * runtime 生命周期方法和 relay handle 的基本组织方式。
 */
import type {
  EnginePlugin,
  EngineRelayHandle,
  EngineRelayMessage,
  EngineRuntime,
  EngineRuntimeContext,
} from "@mothership/plugin-sdk";

// 插件包只需要对外导出这个函数。
// 宿主安装插件包后，通过它创建 EnginePlugin 实例。
export function createEnginePlugin(): EnginePlugin {
  return {
    meta: {
      // 这个 id 必须稳定，宿主会用它把 environment 和插件实现对应起来。
      id: "example",
      displayName: "example",
      version: "0.1.0",
      capabilities: {
        // 可选能力：同一个 environment 是否支持多实例。
        multiInstance: true,
      },
    },

    createRuntime(ctx) {
      return createRuntime(ctx);
    },
  };
}

function createRuntime(ctx: EngineRuntimeContext): EngineRuntime {
  // 在这里维护最小的实例级运行时状态。
  const endpointByInstanceId = new Map<string, string>();

  return {
    async prepareEnvironment(input) {
      // 通常用来准备目录，或者记录 workspace 路径。
      ctx.logger.info("prepareEnvironment", { environmentId: input.environmentId });
      return input;
    },

    async startInstance(input) {
      // 在真实插件里，这里可能会启动本地进程，或创建远端 runtime。
      const endpoint = `wss://engine.example.dev/runtime/${input.instanceId}`;
      endpointByInstanceId.set(input.instanceId, endpoint);

      return {
        instanceId: input.instanceId,
        engineInstanceId: `engine-${input.instanceId}`,
        metadata: { endpoint },
      };
    },

    async stopInstance(input) {
      // 这个方法应该支持重复调用，并且要安全。
      endpointByInstanceId.delete(input.instanceId);
      ctx.logger.info("stopInstance", { instanceId: input.instanceId });
    },

    async connectRelay(input) {
      const endpoint = endpointByInstanceId.get(input.instanceId);
      if (!endpoint) {
        throw new Error(`Missing runtime endpoint for ${input.instanceId}`);
      }

      return createDemoRelayHandle(endpoint, input.sessionId, ctx);
    },
    
    // 可选方法可以在需要时再补：
    // injectRuntimeConfig()
    // listSessions()
    // getHealth()
  };
}

function createDemoRelayHandle(
  endpoint: string,
  sessionId: string | undefined,
  ctx: EngineRuntimeContext,
): EngineRelayHandle {
  let state: "open" | "closed" = "open";

  return {
    get state() {
      return state;
    },

    async send(message: EngineRelayMessage) {
      // 在真实插件里，这里要把消息转发给 engine runtime。
      ctx.logger.info("relay.send", {
        endpoint,
        sessionId,
        messageType: message.type,
      });
    },

    async close() {
      state = "closed";
      await ctx.eventBus.publish({
        type: "relay_closed",
        payload: {
          sessionId,
          reason: "client_closed",
        },
      });
    },
  };
}
