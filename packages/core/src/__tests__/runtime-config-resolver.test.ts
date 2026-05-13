/** RuntimeConfigResolver 引用展开与缺失配置错误测试。 */
import { describe, expect, test } from "bun:test";
import {
  createEnvironmentId,
  InMemoryConfigRepository,
  RuntimeConfigResolutionError,
  RuntimeConfigResolver,
  type Environment,
} from "../index";

function createEnvironment(): Environment {
  return {
    id: createEnvironmentId("alpha"),
    userId: "user-1",
    name: "Alpha",
    engineType: "opencode",
    workspacePath: "/tmp/alpha",
    config: {
      engineId: "opencode",
      modelId: "model-gpt",
      agentId: "agent-default",
      skillIds: ["skill-commit"],
      mcpServerIds: ["mcp-github"],
    },
    createdAt: new Date("2026-05-02T00:00:00Z"),
    updatedAt: new Date("2026-05-02T00:00:00Z"),
  };
}

describe("RuntimeConfigResolver", () => {
  // 验证 resolver 能把 engine/model/agent/skills/mcp 全部解析为统一 runtime spec。
  test("resolve returns a complete AgentRuntimeSpec", async () => {
    const repository = new InMemoryConfigRepository({
      engines: [{ id: "opencode" }],
      models: [{ id: "model-gpt", provider: "openai", model: "gpt-4.1" }],
      agents: [{ id: "agent-default", modelId: "model-gpt", prompt: "Be precise." }],
      skills: [{ id: "skill-commit" }],
      mcpServers: [{ id: "mcp-github", type: "remote", enabled: true }],
    });
    const resolver = new RuntimeConfigResolver(repository);

    const result = await resolver.resolve({ environment: createEnvironment() });

    expect(result).toEqual({
      engineId: "opencode",
      model: {
        id: "model-gpt",
        provider: "openai",
        model: "gpt-4.1",
      },
      agent: {
        id: "agent-default",
        modelId: "model-gpt",
        prompt: "Be precise.",
      },
      skills: [
        {
          id: "skill-commit",
        },
      ],
      mcpServers: [
        {
          id: "mcp-github",
          type: "remote",
          enabled: true,
        },
      ],
    });
  });

  // 验证缺失引用时直接抛具名解析错误，不做 silent fallback。
  test("resolve throws a named error when model config is missing", async () => {
    const repository = new InMemoryConfigRepository({
      engines: [{ id: "opencode" }],
      agents: [{ id: "agent-default", modelId: "model-missing", prompt: "Be precise." }],
      skills: [{ id: "skill-commit" }],
      mcpServers: [{ id: "mcp-github", type: "remote", enabled: true }],
    });
    const resolver = new RuntimeConfigResolver(repository);
    const environment = createEnvironment();

    await expect(resolver.resolve({ environment })).rejects.toBeInstanceOf(RuntimeConfigResolutionError);
    await expect(resolver.resolve({ environment })).rejects.toThrow("Missing model config: model-gpt");
  });

  // 验证含 config/content 扩展字段的记录能正确解析，不泄漏存储细节。
  test("resolve preserves output shape when records carry config and content extensions", async () => {
    const repository = new InMemoryConfigRepository({
      engines: [{ id: "opencode" }],
      models: [{ id: "model-gpt", provider: "openai", model: "gpt-4.1", config: { temperature: 0.2 } }],
      agents: [{ id: "agent-default", modelId: "model-gpt", prompt: "Be precise.", config: { permission: { bash: "allow" } } }],
      skills: [{ id: "skill-commit", content: "#!/bin/bash\ngit commit", config: { description: "helper" } }],
      mcpServers: [{ id: "mcp-github", type: "remote", enabled: true, config: { url: "https://example.com" } }],
    });
    const resolver = new RuntimeConfigResolver(repository);

    const result = await resolver.resolve({ environment: createEnvironment() });

    // 输出结构不泄漏存储细节（config/content 不在 AgentRuntimeSpec 的映射范围内）。
    expect(result.model).toEqual({
      id: "model-gpt",
      provider: "openai",
      model: "gpt-4.1",
    });
    expect(result.agent).toEqual({
      id: "agent-default",
      modelId: "model-gpt",
      prompt: "Be precise.",
    });
    expect(result.skills).toEqual([{ id: "skill-commit" }]);
    expect(result.mcpServers).toEqual([{ id: "mcp-github", type: "remote", enabled: true }]);
  });

  // 验证 agent 引用不存在 model 时抛错（即使其他字段含扩展 config）。
  test("resolve throws when agent references missing model even with config extensions", async () => {
    const repository = new InMemoryConfigRepository({
      engines: [{ id: "opencode" }],
      agents: [{ id: "agent-default", modelId: "model-missing", prompt: "Be precise.", config: { permission: {} } }],
      skills: [],
      mcpServers: [],
    });
    const resolver = new RuntimeConfigResolver(repository);

    await expect(resolver.resolve({ environment: createEnvironment() })).rejects.toBeInstanceOf(RuntimeConfigResolutionError);
  });
});
