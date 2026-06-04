import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..", "..");

function readProjectFile(path: string) {
  return readFileSync(join(root, path), "utf-8");
}

describe("agent_config resource permission 基础设施", () => {
  // schema 中的 resource_permission_type 已扩展到 agent_config
  test("schema 包含 agent_config 枚举值", () => {
    const schema = readProjectFile("src/db/schema.ts");

    expect(schema).toContain('resourcePermissionTypeEnum = pgEnum("resource_permission_type"');
    expect(schema).toContain('"agent_config"');
  });

  // 迁移产物中已生成 agent_config 枚举扩展
  test("迁移文件包含 agent_config enum 变更", () => {
    const migration = readProjectFile("drizzle/0004_agent_config_resource_permission.sql");
    const snapshot = readProjectFile("drizzle/meta/0004_snapshot.json");
    const journal = readProjectFile("drizzle/meta/_journal.json");

    expect(migration).toContain("ADD VALUE 'agent_config'");
    expect(snapshot).toContain('"agent_config"');
    expect(journal).toContain('"tag": "0004_agent_config_resource_permission"');
  });

  // resource-permission 仓储类型支持 agent_config，后续 service 可直接复用
  test("repository 类型联合包含 agent_config", () => {
    const repository = readProjectFile("src/repositories/resource-permission.ts");

    expect(repository).toContain(
      'export type ResourcePermissionType = "provider" | "skill" | "mcp_server" | "agent_config"',
    );
  });

  // config-pg preload mock 已为后续共享 Agent 入口预留桩函数
  test("测试 mock 暴露 Agent 权限相关方法", () => {
    const setupMocks = readProjectFile("src/test-utils/setup-mocks.ts");
    const configPgStub = readProjectFile("src/test-utils/stubs/config-pg-stub.ts");

    expect(setupMocks).toContain('"getAgentConfigByResourceKey"');
    expect(setupMocks).toContain('"getReadableAgentConfigById"');
    expect(setupMocks).toContain('"assertAgentConfigInternalWritable"');
    expect(configPgStub).toContain("getAgentConfigByResourceKey: StubFn;");
    expect(configPgStub).toContain("getReadableAgentConfigById: StubFn;");
    expect(configPgStub).toContain("assertAgentConfigInternalWritable: StubFn;");
  });
});
