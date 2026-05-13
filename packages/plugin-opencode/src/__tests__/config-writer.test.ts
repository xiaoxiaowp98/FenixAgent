/** opencode 运行时配置生成与写入逻辑测试。 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRuntimeSpec } from "@mothership/plugin-sdk";
import { writeOpencodeRuntimeConfig } from "../runtime/config-writer";

const tempDirs: string[] = [];

async function createWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "opencode-runtime-"));
  tempDirs.push(workspace);
  return workspace;
}

function createRuntimeSpec(): AgentRuntimeSpec {
  return {
    engineId: "opencode",
    model: null,
    agent: { id: "general", prompt: "hi" },
    skills: [{ id: "skill-commit" }],
    mcpServers: [{ id: "github", type: "remote", enabled: true }],
    knowledgeBindings: [{ id: "kb-1", resource: "knowledge/doc-1" }],
  };
}

describe("writeOpencodeRuntimeConfig", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  // 验证目录不存在时会自动创建 .opencode 并写入 opencode.json。
  test("creates .opencode directory and config file when missing", async () => {
    const workspace = await createWorkspace();

    await writeOpencodeRuntimeConfig(workspace, createRuntimeSpec());

    const raw = await readFile(join(workspace, ".opencode", "opencode.json"), "utf8");
    const config = JSON.parse(raw) as Record<string, unknown>;

    expect(config.default_agent).toBe("general");
    expect(config.skill_files).toEqual([".opencode/skills/skill-commit.md"]);
    expect(config.mcp).toEqual({
      github: { type: "remote", enabled: true },
    });
  });

  // 验证已有旧配置时会被新运行时配置完整覆盖，避免残留旧字段。
  test("replaces existing config instead of preserving stale fields", async () => {
    const workspace = await createWorkspace();
    const configDir = join(workspace, ".opencode");
    await Bun.write(join(configDir, "opencode.json"), "");
    await writeFile(
      join(configDir, "opencode.json"),
      JSON.stringify(
        {
          theme: "solarized",
          default_agent: "old-agent",
          mcp: {
            stale: { type: "local", enabled: false },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    await writeOpencodeRuntimeConfig(workspace, createRuntimeSpec());

    const raw = await readFile(join(workspace, ".opencode", "opencode.json"), "utf8");
    const config = JSON.parse(raw) as Record<string, unknown>;

    expect(config.theme).toBeUndefined();
    expect(config.default_agent).toBe("general");
    expect(config.mcp).toEqual({
      github: { type: "remote", enabled: true },
    });
    expect(config.skill_files).toEqual([".opencode/skills/skill-commit.md"]);
  });
});
