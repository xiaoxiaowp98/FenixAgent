import { describe, test, expect, mock, beforeEach } from "bun:test";

// ── stopAllInstances 并行停止验证 ──

interface FakeSnapshot {
  instanceId: string;
  status: string;
  errorMessage: string | null;
  pluginMetadata: Record<string, unknown>;
  createdAt: Date;
}

const mockListInstances = mock((): FakeSnapshot[] => []);
const stopOrder: string[] = [];
const mockStopInstance = mock(async (id: string) => {
  stopOrder.push(`stop_start:${id}`);
  await new Promise((r) => setTimeout(r, 2));
  stopOrder.push(`stop_end:${id}`);
});

mock.module("../services/core-bootstrap", () => ({
  getCoreRuntime: () => ({
    listInstances: mockListInstances,
    getInstance: mock(() => null),
    stopInstance: mockStopInstance,
    launchInstance: mock(async () => ({})),
  }),
}));

mock.module("../services/launch-spec-builder", () => ({
  buildLaunchSpec: mock(async () => ({})),
}));

mock.module("../services/config-pg", () => ({
  getAgentConfigById: mock(async () => null),
  getAgentFullConfig: mock(async () => ({
    agentConfig: null,
    providers: [],
    skills: [],
    mcpServers: [],
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

const { stopAllInstances } = await import("../services/instance");

describe("stopAllInstances parallel stops", () => {
  beforeEach(() => {
    mockListInstances.mockClear();
    mockStopInstance.mockClear();
    stopOrder.length = 0;
  });

  // 多个活跃实例并行停止
  test("stops multiple active instances concurrently", async () => {
    mockListInstances.mockReturnValueOnce([
      { instanceId: "inst_p1", status: "running", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
      { instanceId: "inst_p2", status: "running", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
      { instanceId: "inst_p3", status: "error", errorMessage: "crash", pluginMetadata: {}, createdAt: new Date() },
      { instanceId: "inst_p4", status: "stopped", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
      { instanceId: "inst_p5", status: "stopping", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
    ] as FakeSnapshot[]);

    await stopAllInstances();

    // 只停止 running 和 error（3 个），跳过 stopped 和 stopping（2 个）
    expect(mockStopInstance).toHaveBeenCalledTimes(3);

    // 并行：inst_p2 的 stop_start 应在 inst_p1 的 stop_end 之前
    const p1EndIdx = stopOrder.indexOf("stop_end:inst_p1");
    const p2StartIdx = stopOrder.indexOf("stop_start:inst_p2");
    expect(p2StartIdx).toBeLessThan(p1EndIdx);
  });

  // 单个实例也正常工作
  test("handles single active instance", async () => {
    mockListInstances.mockReturnValueOnce([
      { instanceId: "inst_single", status: "running", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
    ] as FakeSnapshot[]);

    await stopAllInstances();
    expect(mockStopInstance).toHaveBeenCalledTimes(1);
    expect(mockStopInstance.mock.calls[0][0]).toBe("inst_single");
  });

  // 部分停止失败不阻断其他
  test("continues stopping other instances when one fails", async () => {
    mockStopInstance.mockImplementation(async (id: string) => {
      if (id === "inst_fail") throw new Error("kill failed");
    });

    mockListInstances.mockReturnValueOnce([
      { instanceId: "inst_ok1", status: "running", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
      { instanceId: "inst_fail", status: "running", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
      { instanceId: "inst_ok2", status: "running", errorMessage: null, pluginMetadata: {}, createdAt: new Date() },
    ] as FakeSnapshot[]);

    // 不应抛出
    await stopAllInstances();

    // 所有实例都尝试停止（包括失败的）
    expect(mockStopInstance).toHaveBeenCalledTimes(3);
  });

  // 空列表正常退出
  test("handles empty instance list", async () => {
    mockListInstances.mockReturnValueOnce([] as FakeSnapshot[]);
    await stopAllInstances();
    expect(mockStopInstance).not.toHaveBeenCalled();
  });
});
