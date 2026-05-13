import type { EnginePlugin, EngineRuntime, EngineRuntimeContext } from "@mothership/plugin-sdk";
import { writeOpencodeRuntimeConfig } from "./runtime/config-writer";
import {
  AcpLinkProcessManager,
  type AcpLinkProcessState,
} from "./process/acp-link-process-manager";
import { createOpencodeRelayHandle } from "./relay/relay-handle";

/**
 * 创建 opencode engine plugin。
 *
 * 这是 control plane 识别 opencode 的标准入口，负责声明插件元信息，
 * 并把 runtime 的真实实现延迟到 `createRuntime()` 时再创建。
 */
export function createEnginePlugin(): EnginePlugin {
  return {
    meta: {
      id: "opencode",
      displayName: "opencode",
      version: "0.1.0",
      capabilities: {
        multiInstance: true,
      },
    },
    createRuntime(ctx) {
      return createOpencodeRuntime(ctx);
    },
  };
}

function createOpencodeRuntime(ctx: EngineRuntimeContext): EngineRuntime {
  const preparedWorkspaces = new Map<string, string>();
  const processManager = new AcpLinkProcessManager();

  /** 读取 prepareEnvironment 阶段缓存过的 workspace。 */
  function requireWorkspace(environmentId: string): string {
    const workspacePath = preparedWorkspaces.get(environmentId);
    if (!workspacePath) {
      throw new Error(`Workspace not prepared for environment: ${environmentId}`);
    }
    return workspacePath;
  }

  /** 确保某个实例已经由本插件启动过本地 acp-link 进程。 */
  function requireProcessState(instanceId: string): AcpLinkProcessState {
    const state = processManager.getProcessState(instanceId);
    if (!state) {
      throw new Error(`Instance process not found: ${instanceId}`);
    }
    return state;
  }

  return {
    async prepareEnvironment(input) {
      // opencode 目前不做额外目录初始化，只记录 workspace 供后续阶段复用。
      preparedWorkspaces.set(input.environmentId, input.workspacePath);
      return input;
    },
    async injectRuntimeConfig(input) {
      await writeOpencodeRuntimeConfig(
        requireWorkspace(input.environmentId),
        input.runtimeSpec,
      );
    },
    async startInstance(input) {
      const state = await processManager.start({
        environmentId: input.environmentId,
        instanceId: input.instanceId,
        workspacePath: requireWorkspace(input.environmentId),
      });

      ctx.logger.info("Started opencode instance", {
        environmentId: input.environmentId,
        instanceId: input.instanceId,
        port: state.port,
      });

      return {
        instanceId: input.instanceId,
        engineInstanceId: state.pid ? String(state.pid) : undefined,
        metadata: {
          // 这些元数据会被平台透传保存，方便 UI 或诊断逻辑直接使用。
          port: state.port,
          token: state.token,
        },
      };
    },
    async stopInstance(input) {
      processManager.stop(input.instanceId);
      ctx.logger.info("Stopping opencode instance", {
        environmentId: input.environmentId,
        instanceId: input.instanceId,
      });
    },
    async connectRelay(input) {
      const state = requireProcessState(input.instanceId);
      return createOpencodeRelayHandle({
        port: state.port,
        // 若 stdout 尚未解析出真实 token，则退回到 instanceId，方便测试替身运行。
        token: state.token ?? input.instanceId,
        sessionId: input.sessionId,
        eventBus: ctx.eventBus,
      });
    },
    async listSessions() {
      return [];
    },
  };
}
