import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

import { _deps, _resetDeps } from "../services/environment-acp";

const mockEnvRepoCreate = mock(async (d: any) => ({
  id: "env_1",
  secret: d.secret,
  status: "active",
  ...d,
}));

beforeEach(() => {
  _deps.environmentRepo = {
    getById: mock(async () => null),
    create: mockEnvRepoCreate,
    update: mock(async () => {}),
    getBySecret: mock(async () => null),
    listActive: mock(async () => []),
    listActiveByUsername: mock(async () => []),
    listByUserId: mock(async () => []),
    delete: mock(async () => true),
  } as any;
  _deps.sessionRepo = {
    listByEnvironment: mock(async (): Promise<Array<{ id: string }>> => []),
    create: mock(async (d: any) => ({ id: "ses_1", ...d })),
  } as any;
  _deps.findOrCreateForEnvironment = mock(async () => ({ id: "ses_1" }));
  _deps.deleteEnvironment = mock(async () => {});
});

afterEach(() => {
  _resetDeps();
});

import { registerEnvironment, registerBridge } from "../services/environment-acp";

describe("environment-acp nullish coalescing (|| → ??)", () => {
  beforeEach(() => {
    mockEnvRepoCreate.mockClear();
  });

  // registerEnvironment: worker_type 空字符串不被 || 吞掉
  test("registerEnvironment preserves empty string worker_type with ??", async () => {
    await registerEnvironment({
      worker_type: "",
      userId: "user_1",
      machine_name: "test",
    });

    const call = mockEnvRepoCreate.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(call[0].workerType).toBe("");
  });

  // registerEnvironment: userId 空字符串不被 || 吞掉
  test("registerEnvironment preserves empty string userId with ??", async () => {
    await registerEnvironment({
      userId: "",
      machine_name: "test2",
    });

    const call = mockEnvRepoCreate.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(call[0].userId).toBe("");
  });

  // registerEnvironment: undefined worker_type 回退到 metadata
  test("registerEnvironment falls back to metadata worker_type", async () => {
    await registerEnvironment({
      metadata: { worker_type: "custom" },
      userId: "user_2",
      machine_name: "test3",
    });

    const call = mockEnvRepoCreate.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(call[0].workerType).toBe("custom");
  });

  // registerBridge: undefined worker_type + metadata 回退到 "acp"
  test("registerBridge falls back to 'acp' when both undefined", async () => {
    const result = await registerBridge({
      userId: "user_3",
    });

    const call = mockEnvRepoCreate.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(call[0].workerType).toBe("acp");
  });
});
