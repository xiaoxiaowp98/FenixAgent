/** InstanceService 生命周期编排的核心回归测试。 */
import { describe, expect, test } from "bun:test";
import type { EnginePlugin, EngineRuntime } from "@mothership/plugin-sdk";
import {
  EnvironmentService,
  InMemoryConfigRepository,
  InMemoryEnvironmentRepository,
  InMemoryInstanceRepository,
  InMemorySessionRepository,
  InstanceService,
  PluginRegistry,
  EnginePluginNotFoundError,
  RuntimeConfigResolver,
  RuntimeEventBus,
  SessionService,
} from "../index";

function createRuntime(overrides: Partial<EngineRuntime> = {}): EngineRuntime {
  return {
    async prepareEnvironment(input) {
      return { ...input };
    },
    async injectRuntimeConfig() {},
    async startInstance(input) {
      return { instanceId: input.instanceId };
    },
    async stopInstance() {},
    async connectRelay() {
      return {
        state: "open",
        send() {},
        close() {},
      };
    },
    ...overrides,
  };
}

function createPlugin(id: string, runtime: EngineRuntime): EnginePlugin {
  return {
    meta: {
      id,
      displayName: id,
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

describe("InstanceService", () => {
  // 验证实例启动链路按 prepare -> inject -> start 的固定顺序执行。
  test("startInstance orchestrates runtime lifecycle in order", async () => {
    const calls: string[] = [];
    const environmentRepository = new InMemoryEnvironmentRepository();
    const instanceRepository = new InMemoryInstanceRepository();
    const sessionRepository = new InMemorySessionRepository();
    const configRepository = new InMemoryConfigRepository({
      engines: [{ id: "opencode" }],
      models: [{ id: "gpt-5", provider: "openai", model: "gpt-5" }],
      agents: [{ id: "general", modelId: "gpt-5", prompt: "hi" }],
    });
    const environmentService = new EnvironmentService(environmentRepository);
    const sessionService = new SessionService(sessionRepository);
    const resolver = new RuntimeConfigResolver(configRepository);
    const registry = new PluginRegistry();
    const eventBus = new RuntimeEventBus();
    const runtime = createRuntime({
      async prepareEnvironment(input) {
        calls.push("prepareEnvironment");
        return { ...input };
      },
      async injectRuntimeConfig() {
        calls.push("injectRuntimeConfig");
      },
      async startInstance(input) {
        calls.push("startInstance");
        return { instanceId: input.instanceId, engineInstanceId: "engine-1" };
      },
    });
    registry.register(createPlugin("opencode", runtime));

    const environment = await environmentService.createEnvironment({
      userId: "u1",
      name: "demo",
      engineType: "opencode",
      workspacePath: "/tmp/workspace",
      config: {
        engineId: "opencode",
        modelId: "gpt-5",
        agentId: "general",
        skillIds: [],
        mcpServerIds: [],
      },
    });

    const service = new InstanceService(
      environmentService,
      sessionService,
      instanceRepository,
      resolver,
      registry,
      eventBus,
    );

    const instance = await service.startInstance(environment.id);

    expect(calls).toEqual(["prepareEnvironment", "injectRuntimeConfig", "startInstance"]);
    expect(instance.environmentId).toBe(environment.id);
    expect(instance.engineInstanceId).toBe("engine-1");
  });

  // 验证 engine 插件未注册时抛出包含 engineId 的具名错误。
  test("startInstance throws named error when plugin is missing", async () => {
    const environmentRepository = new InMemoryEnvironmentRepository();
    const instanceRepository = new InMemoryInstanceRepository();
    const sessionRepository = new InMemorySessionRepository();
    const configRepository = new InMemoryConfigRepository({
      engines: [{ id: "opencode" }],
    });
    const environmentService = new EnvironmentService(environmentRepository);
    const sessionService = new SessionService(sessionRepository);
    const resolver = new RuntimeConfigResolver(configRepository);

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

    const service = new InstanceService(
      environmentService,
      sessionService,
      instanceRepository,
      resolver,
      new PluginRegistry(),
      new RuntimeEventBus(),
    );

    expect(service.startInstance(environment.id)).rejects.toBeInstanceOf(EnginePluginNotFoundError);
    expect(service.startInstance(environment.id)).rejects.toThrow("Engine plugin not found: opencode");
  });
});
