import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

import { _deps, _resetDeps } from "../services/environment-acp";

const mockEnvUpdate = mock(async (_id: string, _patch: Record<string, unknown>) => {});
const mockEnvGetById = mock(async () => ({
  id: "env_bound",
  userId: "user1",
  workerType: "acp",
  capabilities: { mode: "full" },
}));

beforeEach(() => {
  _deps.environmentRepo = {
    getById: mockEnvGetById,
    update: mockEnvUpdate,
    getBySecret: mock(async () => null),
    create: mock(async () => ({})),
    delete: mock(async () => true),
    listActive: mock(async () => []),
    listActiveByUsername: mock(async () => []),
    listByUserId: mock(async () => []),
  } as any;
  _deps.sessionRepo = {
    listByEnvironment: mock(async () => []),
    create: mock(async (p: { id: string }) => ({ id: p.id })),
  } as any;
  _deps.findOrCreateForEnvironment = mock(async () => ({ id: "ses_1" }));
  _deps.deleteEnvironment = mock(async () => {});
});

afterEach(() => {
  _resetDeps();
});

import { handleAcpIdentify } from "../services/environment-acp";

describe("handleAcpIdentify parallel optimization", () => {
  beforeEach(() => {
    mockEnvUpdate.mockClear();
    mockEnvGetById.mockClear();
  });

  // bound 环境：并行执行 markActive 和 getById
  test("bound env: markActive and getById run in parallel", async () => {
    const callOrder: string[] = [];
    mockEnvUpdate.mockImplementation(async () => {
      callOrder.push("update_start");
      await new Promise((r) => setTimeout(r, 2));
      callOrder.push("update_end");
    });
    mockEnvGetById.mockImplementation(async () => {
      callOrder.push("get_start");
      await new Promise((r) => setTimeout(r, 2));
      callOrder.push("get_end");
      return {
        id: "env_bound",
        userId: "user1",
        workerType: "acp",
        capabilities: { mode: "full" },
      };
    });

    const result = await handleAcpIdentify({
      agentId: "env_bound",
      userId: "user1",
      boundEnvId: "env_bound",
    });

    // 两个操作应并行执行（get_start 在 update_end 之前）
    expect(callOrder.indexOf("get_start")).toBeLessThan(callOrder.indexOf("update_end"));
    expect(result.envId).toBe("env_bound");
    expect(result.capabilities).toEqual({ mode: "full" });
  });

  // unbound 环境：验证 + active
  test("unbound env: verifies and marks active", async () => {
    const result = await handleAcpIdentify({
      agentId: "env_unbound",
      userId: "user1",
      boundEnvId: null,
    });

    expect(result.envId).toBe("env_bound");
    expect(mockEnvUpdate).toHaveBeenCalled();
  });
});
