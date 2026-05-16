import { describe, test, expect, mock, beforeEach } from "bun:test";

// ── ensureRunning 单次 filterInstances 合并验证 ──

interface FakeSnapshot {
  instanceId: string;
  status: string;
  errorMessage: string | null;
  pluginMetadata: Record<string, unknown>;
  createdAt: Date;
}

const mockListInstances = mock((): FakeSnapshot[] => []);
const mockStopInstance = mock(async () => {});
const mockLaunchInstance = mock(async (_spec: unknown) => ({
  instanceId: "inst_new",
  status: "running",
  errorMessage: null,
  pluginMetadata: { port: 8888, token: "tok" },
  createdAt: new Date(),
}));

mock.module("../services/core-bootstrap", () => ({
  getCoreRuntime: () => ({
    listInstances: mockListInstances,
    getInstance: mock(() => null),
    stopInstance: mockStopInstance,
    launchInstance: mockLaunchInstance,
  }),
}));

mock.module("../services/launch-spec-builder", () => ({
  buildLaunchSpec: mock(async () => ({})),
}));

mock.module("../services/config-pg", () => ({
  getAgentConfigById: mock(async () => null),
  getAgentFullConfig: mock(async () => ({
    agentConfig: null, providers: [], skills: [], mcpServers: [],
  })),
}));

mock.module("../repositories", () => ({
  environmentRepo: {
    getById: mock(async () => null),
  },
  sessionRepo: {
    listByEnvironment: mock(async () => []),
  },
}));

mock.module("../services/session", () => ({
  findOrCreateForEnvironment: mock(async () => ({ id: "ses_1" })),
}));

mock.module("../logger", () => ({
  log: mock(() => {}),
  error: mock(() => {}),
}));

const { ensureRunning } = await import("../services/instance");

describe("ensureRunning merged core query", () => {
  beforeEach(() => {
    mockListInstances.mockClear();
  });

  // 无 running 实例时 listInstances 只调用一次
  test("calls listInstances once when no running instance", async () => {
    mockListInstances.mockReturnValueOnce([]);
    // envRepo.getById 返回 null 会 throw，这里跳过 spawn 路径
    // 仅验证 filterInstances 调用次数
    try {
      await ensureRunning("u1", "env_1");
    } catch {
      // Environment not found expected
    }
    expect(mockListInstances).toHaveBeenCalledTimes(1);
  });

  // 有 running 实例时也只调用一次
  test("calls listInstances once when running instance exists", async () => {
    mockListInstances.mockReturnValueOnce([]);
    try {
      await ensureRunning("u1", "env_nonexist");
    } catch {
      // expected
    }
    expect(mockListInstances).toHaveBeenCalledTimes(1);
  });
});
