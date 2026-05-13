/** RelayOrchestrator 会话级转发与清理行为测试。 */
import { describe, expect, mock, test } from "bun:test";
import type { EnginePlugin, EngineRuntime } from "@mothership/plugin-sdk";
import {
  EnvironmentService,
  InMemoryConfigRepository,
  InMemoryEnvironmentRepository,
  InMemoryInstanceRepository,
  InMemorySessionRepository,
  InstanceService,
  PluginRegistry,
  RelayOrchestrator,
  RuntimeConfigResolver,
  RuntimeEventBus,
  SessionService,
} from "../index";

function createRelayPlugin(runtime: EngineRuntime): EnginePlugin {
  return {
    meta: {
      id: "opencode",
      displayName: "opencode",
      version: "0.1.0",
      capabilities: {
        multiInstance: true,
      },
    },
    createRuntime() {
      return runtime;
    },
  };
}

describe("RelayOrchestrator", () => {
  // 验证 connect(sessionId) 会调用 engine runtime 的 connectRelay 并返回 relay handle。
  test("connect routes session to engine relay runtime", async () => {
    const sent: string[] = [];
    const close = mock(() => {});
    const send = mock(() => {});
    const eventBus = new RuntimeEventBus();
    const connectRelay = mock(async () => ({
      state: "open" as const,
      send(message: { type: string }) {
        sent.push(message.type);
      },
      close,
    }));
    const runtime: EngineRuntime = {
      async prepareEnvironment(input) {
        return input;
      },
      async startInstance(input) {
        return { instanceId: input.instanceId };
      },
      async stopInstance() {},
      connectRelay,
    };

    const environmentRepository = new InMemoryEnvironmentRepository();
    const instanceRepository = new InMemoryInstanceRepository();
    const sessionRepository = new InMemorySessionRepository();
    const configRepository = new InMemoryConfigRepository({
      engines: [{ id: "opencode" }],
    });
    const environmentService = new EnvironmentService(environmentRepository);
    const sessionService = new SessionService(sessionRepository);
    const resolver = new RuntimeConfigResolver(configRepository);
    const registry = new PluginRegistry();
    registry.register(createRelayPlugin(runtime));

    const environment = await environmentService.createEnvironment({
      userId: "u1",
      name: "demo",
      engineType: "opencode",
      workspacePath: "/tmp/workspace",
      config: {
        engineId: "opencode",
        skillIds: [],
        mcpServerIds: [],
      },
    });
    const instanceService = new InstanceService(
      environmentService,
      sessionService,
      instanceRepository,
      resolver,
      registry,
      eventBus,
    );
    const instance = await instanceService.startInstance(environment.id);
    const session = await sessionService.createSession({
      environmentId: environment.id,
      instanceId: instance.id,
      status: "active",
    });

    const orchestrator = new RelayOrchestrator(sessionService, instanceService, eventBus);
    const relayId = await orchestrator.connect(session.id, { send, close });

    expect(relayId).toStartWith("relay_");
    expect(connectRelay).toHaveBeenCalledTimes(1);

    await eventBus.publish({
      type: "relay_message",
      payload: {
        sessionId: session.id,
        message: { type: "assistant" },
      },
    });

    expect(send).toHaveBeenCalledTimes(1);
    await orchestrator.send(relayId, { type: "user" });
    expect(sent).toEqual(["user"]);
  });

  // 验证 disconnect(relayId) 会关闭 engine relay，并停止后续事件转发。
  test("disconnect cleans relay handle and unsubscribes event forwarding", async () => {
    const forwarded = mock(() => {});
    const close = mock(() => {});
    const eventBus = new RuntimeEventBus();
    const runtime: EngineRuntime = {
      async prepareEnvironment(input) {
        return input;
      },
      async startInstance(input) {
        return { instanceId: input.instanceId };
      },
      async stopInstance() {},
      async connectRelay() {
        return {
          state: "open" as const,
          send() {},
          close,
        };
      },
    };

    const environmentRepository = new InMemoryEnvironmentRepository();
    const instanceRepository = new InMemoryInstanceRepository();
    const sessionRepository = new InMemorySessionRepository();
    const configRepository = new InMemoryConfigRepository({
      engines: [{ id: "opencode" }],
    });
    const environmentService = new EnvironmentService(environmentRepository);
    const sessionService = new SessionService(sessionRepository);
    const resolver = new RuntimeConfigResolver(configRepository);
    const registry = new PluginRegistry();
    registry.register(createRelayPlugin(runtime));

    const environment = await environmentService.createEnvironment({
      userId: "u1",
      name: "demo",
      engineType: "opencode",
      workspacePath: "/tmp/workspace",
      config: {
        engineId: "opencode",
        skillIds: [],
        mcpServerIds: [],
      },
    });
    const instanceService = new InstanceService(
      environmentService,
      sessionService,
      instanceRepository,
      resolver,
      registry,
      eventBus,
    );
    const instance = await instanceService.startInstance(environment.id);
    const session = await sessionService.createSession({
      environmentId: environment.id,
      instanceId: instance.id,
      status: "active",
    });

    const orchestrator = new RelayOrchestrator(sessionService, instanceService, eventBus);
    const relayId = await orchestrator.connect(session.id, { send: forwarded });
    await orchestrator.disconnect(relayId);

    await eventBus.publish({
      type: "relay_message",
      payload: {
        sessionId: session.id,
        message: { type: "assistant" },
      },
    });

    expect(close).toHaveBeenCalledTimes(1);
    expect(forwarded).not.toHaveBeenCalled();
  });
});
