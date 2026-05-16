// createAgentConfig 单循环构建 values/set 测试
import { describe, test, expect, mock } from "bun:test";

// 捕获 db.insert 调用参数
const capturedValues: unknown[] = [];
const capturedSet: unknown[] = [];

// mock 必须使用从被测模块解析的路径：agent-config.ts 位于 src/services/config/，其 import ../../db → src/db
// 但 mock.module 从测试文件解析：src/__tests__/ → ../db �� src/db
mock.module("../db", () => ({
  db: {
    insert: mock(() => ({
      values(v: unknown) {
        capturedValues.push(v);
        return this;
      },
      onConflictDoUpdate(params: { set: unknown }) {
        capturedSet.push(params.set);
        return this;
      },
    })),
  },
}));

// schema mock — 只需导出 agentConfig 的列标识
mock.module("../../db/schema", () => ({
  agentConfig: {
    $inferInsert: {},
    userId: "userId",
    name: "name",
    id: "id",
  },
}));

mock.module("drizzle-orm", () => ({
  eq: mock(() => ({})),
  and: mock(() => ({})),
}));

mock.module("../agent-knowledge", () => ({
  resolveAgentKnowledgePolicy: mock(() => ({
    searchFirst: false,
    maxResults: 5,
    defaultNamespaces: [],
  })),
}));

import { createAgentConfig } from "../services/config/agent-config";

describe("createAgentConfig 单循环 values/set 构建", () => {
  test("有 settable fields 时 values 和 set 应正确构建", async () => {
    capturedValues.length = 0;
    capturedSet.length = 0;

    await createAgentConfig("user_1", "test-agent", {
      model: "gpt-4",
      prompt: "test prompt",
      steps: 10,
      mode: "primary",
    });

    // values 应包含 userId + name + set fields
    const values = capturedValues[0] as Record<string, unknown>;
    expect(values.userId).toBe("user_1");
    expect(values.name).toBe("test-agent");
    expect(values.model).toBe("gpt-4");
    expect(values.prompt).toBe("test prompt");
    expect(values.steps).toBe(10);
    expect(values.mode).toBe("primary");
    expect(values.updatedAt).toBeInstanceOf(Date);

    // set 应包含 set fields + updatedAt，不含 userId/name
    const set = capturedSet[0] as Record<string, unknown>;
    expect(set.model).toBe("gpt-4");
    expect(set.prompt).toBe("test prompt");
    expect(set.steps).toBe(10);
    expect(set.mode).toBe("primary");
    expect(set.updatedAt).toBeInstanceOf(Date);
    expect(set).not.toHaveProperty("userId");
    expect(set).not.toHaveProperty("name");
  });

  test("无 settable fields 时 values 仅有 userId/name/updatedAt", async () => {
    capturedValues.length = 0;
    capturedSet.length = 0;

    await createAgentConfig("user_1", "minimal", {});

    const values = capturedValues[0] as Record<string, unknown>;
    expect(values.userId).toBe("user_1");
    expect(values.name).toBe("minimal");
    expect(values.updatedAt).toBeInstanceOf(Date);
    // 不应有其他 settable fields
    expect(Object.keys(values).filter((k) => !["userId", "name", "updatedAt"].includes(k))).toHaveLength(0);

    const set = capturedSet[0] as Record<string, unknown>;
    expect(Object.keys(set)).toEqual(["updatedAt"]);
  });

  test("值为 null 时应正确传递 null（而非 undefined）", async () => {
    capturedValues.length = 0;
    capturedSet.length = 0;

    await createAgentConfig("user_1", "null-agent", {
      model: null,
      prompt: null,
    });

    const values = capturedValues[0] as Record<string, unknown>;
    expect(values.model).toBeNull();
    expect(values.prompt).toBeNull();

    const set = capturedSet[0] as Record<string, unknown>;
    expect(set.model).toBeNull();
    expect(set.prompt).toBeNull();
  });
});
