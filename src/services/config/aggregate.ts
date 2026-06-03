import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { agentConfig, agentConfigSkill, type mcpServer, provider, skill } from "../../db/schema";
import type { AuthContext } from "../../plugins/auth";
import { listMcpServers } from "./mcp-server";
import { listReadableProviders } from "./provider";
import { listSkills } from "./skill";
import type { ResourceAccess } from "./types";

// ────────────────────────────────────────────
// 批量配置读取（spawn 时一次性获取 Agent 完整配置）
// ────────────────────────────────────────────

export interface AgentFullConfig {
  agentConfig: typeof agentConfig.$inferSelect | null;
  providers: (typeof provider.$inferSelect & { resourceAccess?: ResourceAccess })[];
  skills: (typeof skill.$inferSelect & { resourceAccess?: ResourceAccess })[];
  mcpServers: (typeof mcpServer.$inferSelect)[];
}

export async function getAgentFullConfig(ctx: AuthContext, agentConfigId: string | null): Promise<AgentFullConfig> {
  if (!agentConfigId) {
    const [providers, mcpServers, skills] = await Promise.all([
      listReadableProviders(ctx),
      listMcpServers(ctx).then((rows) => rows.filter((row) => row.enabled === true)),
      listSkills(ctx),
    ]);
    return { agentConfig: null, providers, skills, mcpServers };
  }

  const [providers, mcpServers, acRows, skillBindings] = await Promise.all([
    listReadableProviders(ctx),
    listMcpServers(ctx).then((rows) => rows.filter((row) => row.enabled === true)),
    db
      .select()
      .from(agentConfig)
      .where(and(eq(agentConfig.id, agentConfigId), eq(agentConfig.organizationId, ctx.organizationId)))
      .limit(1),
    db
      .select({ skillId: agentConfigSkill.skillId })
      .from(agentConfigSkill)
      .where(eq(agentConfigSkill.agentConfigId, agentConfigId)),
  ]);

  const [ac] = acRows;

  let skills: (typeof skill.$inferSelect & { resourceAccess?: ResourceAccess })[] = [];
  if (ac && skillBindings.length > 0) {
    const skillIds = skillBindings.map((b) => b.skillId);
    const readableSkills = await listSkills(ctx);
    skills = readableSkills.filter((row) => skillIds.includes(row.id));
  }

  return { agentConfig: ac ?? null, providers, skills, mcpServers };
}
