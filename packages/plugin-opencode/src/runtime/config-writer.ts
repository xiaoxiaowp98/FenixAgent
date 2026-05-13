import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRuntimeSpec } from "@mothership/plugin-sdk";
import { createOpencodeRuntimeConfig } from "./runtime-config";

/**
 * 将运行时配置注入到 workspace 下固定的 opencode 配置文件。
 *
 * 写入策略采用“按控制面生成结果完全覆盖”，避免旧字段残留或和当前
 * 运行时配置发生冲突。
 */
export async function writeOpencodeRuntimeConfig(
  workspacePath: string,
  runtimeSpec: AgentRuntimeSpec,
): Promise<void> {
  const configDir = join(workspacePath, ".opencode");
  const configPath = join(configDir, "opencode.json");
  const nextConfig = createOpencodeRuntimeConfig(runtimeSpec);

  await mkdir(configDir, { recursive: true });
  await writeFile(configPath, `${JSON.stringify(nextConfig, null, 2)}\n`, "utf8");
}
