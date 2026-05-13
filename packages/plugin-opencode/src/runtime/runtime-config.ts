import type { AgentRuntimeSpec } from "@mothership/plugin-sdk";

interface OpencodeMcpConfigEntry {
  type: "local" | "remote";
  enabled: boolean;
}

interface OpencodeRuntimeConfig {
  default_agent?: string;
  mcp?: Record<string, OpencodeMcpConfigEntry>;
  skill_files?: string[];
  [key: string]: unknown;
}

/**
 * 将 SDK 暴露的统一 runtime spec 翻译为 opencode 私有配置对象。
 *
 * 这一步只做字段投影，不触碰文件系统；真正的落盘由 `config-writer.ts` 负责。
 */
export function createOpencodeRuntimeConfig(runtimeSpec: AgentRuntimeSpec): OpencodeRuntimeConfig {
  return {
    default_agent: runtimeSpec.agent?.id,
    mcp: Object.fromEntries(
      runtimeSpec.mcpServers.map((server) => [
        server.id,
        {
          type: server.type,
          enabled: server.enabled,
        },
      ]),
    ),
    skill_files: runtimeSpec.skills.map((skill) => `.opencode/skills/${skill.id}.md`),
  };
}
