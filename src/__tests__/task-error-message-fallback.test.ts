import { describe, test, expect, mock } from "bun:test";

// ── executeTaskById HTTP error message fallback 验证 ──

const originalFetch = globalThis.fetch;

mock.module("../repositories/task", () => ({
  scheduledTaskRepo: {
    update: mock(async () => ({ id: "t1" })),
    getById: mock(async () => null),
    listByUser: mock(async () => []),
  },
  taskExecutionLogRepo: {
    create: mock(async () => {}),
    listByTaskPaged: mock(async () => ({ rows: [], total: 0 })),
    deleteByTask: mock(async () => {}),
  },
}));

mock.module("../services/scheduler", () => ({
  scheduleTask: mock(() => {}),
  rescheduleTask: mock(() => {}),
  unscheduleTask: mock(() => {}),
}));

mock.module("../services/config/jsonb", () => ({
  parseJsonb: (v: unknown) => v,
}));

mock.module("../logger", () => ({
  log: mock(() => {}),
  error: mock(() => {}),
}));

const { executeTaskById } = await import("../services/task");

const baseTask = {
  id: "t1", userId: "u1", name: "test", cron: "* * * * *", timezone: null,
  enabled: true, url: "http://example.com", method: "GET",
  headers: null, body: null, lastRunAt: null, nextRunAt: null,
  lastStatus: null, createdAt: new Date(), updatedAt: new Date(),
};

describe("executeTaskById HTTP error message", () => {
  // 有 body 的 HTTP 错误保留原始格式
  test("error with body includes response text", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }));

    const result = await executeTaskById("t1", "manual", baseTask as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe("HTTP 500: Internal Server Error");
    }
    globalThis.fetch = originalFetch;
  });

  // 空 body 的 HTTP 错误不留尾部冒号
  test("error with empty body shows status only", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 502,
      text: async () => "",
    }));

    const result = await executeTaskById("t1", "manual", baseTask as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe("HTTP 502");
      // 不应有尾部冒号
      expect(result.data.error).not.toMatch(/: $/);
    }
    globalThis.fetch = originalFetch;
  });

  // text() 抛出异常时 fallback 为空
  test("error when text() throws shows status only", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 503,
      text: async () => { throw new Error("stream error"); },
    }));

    const result = await executeTaskById("t1", "manual", baseTask as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBe("HTTP 503");
    }
    globalThis.fetch = originalFetch;
  });

  // 成功响应 error 为 null
  test("successful response has null error", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 200,
      text: async () => "OK",
    }));

    const result = await executeTaskById("t1", "manual", baseTask as any);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.error).toBeNull();
      expect(result.data.status).toBe("success");
    }
    globalThis.fetch = originalFetch;
  });
});
