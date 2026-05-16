// handleAcpRegister bound 路径合并 UPDATE 测试
import { describe, test, expect, mock, beforeEach } from "bun:test";

// mock repositories — 必须在 import 之前
const updateMock = mock(async (_id: string, _patch: Record<string, unknown>) => true);
mock.module("../repositories", () => ({
  environmentRepo: { update: updateMock },
  sessionRepo: {},
}));

mock.module("../errors", () => ({
  NotFoundError: class NotFoundError extends Error { constructor(m: string) { super(m); } },
  AppError: class AppError extends Error {
    code: string;
    statusCode: number;
    constructor(m: string, code: string, statusCode: number) { super(m); this.code = code; this.statusCode = statusCode; }
  },
}));

mock.module("./session", () => ({ findOrCreateForEnvironment: mock(async () => ({ id: "ses_1" })) }));
mock.module("./environment-core", () => ({
  toResponse: mock(() => ({})),
  deleteEnvironment: mock(async () => true),
}));

// 需要在 mock 之后导入，所以用动态导入
let handleAcpRegister: typeof import("../services/environment-acp").handleAcpRegister;

beforeEach(() => {
  updateMock.mockClear();
});

describe("handleAcpRegister bound 路径合并 UPDATE", () => {
  async function importModule() {
    const mod = await import("../services/environment-acp");
    handleAcpRegister = mod.handleAcpRegister;
  }

  // bound 路径：合并 markEnvironmentActive + updateEnvironmentCapabilities 为单次调用
  test("bound 路径应只调用一次 environmentRepo.update", async () => {
    await importModule();
    await handleAcpRegister({
      wsId: "ws_1",
      userId: "user_1",
      agentName: "test-agent",
      capabilities: { foo: "bar" },
      maxSessions: 5,
      boundEnvId: "env_bound",
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  test("bound 路径 update 应包含 status + lastPollAt + capabilities + maxSessions", async () => {
    await importModule();
    await handleAcpRegister({
      wsId: "ws_1",
      userId: "user_1",
      agentName: "test-agent",
      capabilities: { foo: "bar" },
      maxSessions: 3,
      boundEnvId: "env_bound",
    });

    const patch = updateMock.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.status).toBe("active");
    expect(patch.lastPollAt).toBeInstanceOf(Date);
    expect(patch.capabilities).toEqual({ foo: "bar" });
    expect(patch.maxSessions).toBe(3);
  });

  test("bound 路径 capabilities 为 undefined 时不更新 capabilities 列", async () => {
    await importModule();
    await handleAcpRegister({
      wsId: "ws_1",
      userId: "user_1",
      agentName: "test-agent",
      boundEnvId: "env_bound",
    });

    const patch = updateMock.mock.calls[0][1] as Record<string, unknown>;
    // capabilities 为 undefined → Drizzle 跳过该列
    expect(patch.capabilities).toBeUndefined();
    expect(patch.maxSessions).toBeUndefined();
  });

  test("bound 路径返回 isNew: false", async () => {
    await importModule();
    const result = await handleAcpRegister({
      wsId: "ws_1",
      userId: "user_1",
      agentName: "test-agent",
      boundEnvId: "env_bound",
    });
    expect(result.isNew).toBe(false);
    expect(result.envId).toBe("env_bound");
  });
});
