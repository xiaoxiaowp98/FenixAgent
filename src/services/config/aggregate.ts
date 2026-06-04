import { eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { agentConfigSkill, mcpServer, provider, skill } from "../../db/schema";
import type { AuthContext } from "../../plugins/auth";
import { decorateResourceAccess } from "../resource-permission";
import { getReadableAgentConfigById } from "./agent-config";
import type { AgentConfigDetailWithAccess, ResourceAccess } from "./types";

// ────────────────────────────────────────────
// 批量配置读取（spawn 时一次性获取 Agent 完整配置）
// ────────────────────────────────────────────

export interface AgentFullConfig {
  agentConfig: AgentConfigDetailWithAccess | null;
  providers: (typeof provider.$inferSelect & { resourceAccess?: ResourceAccess })[];
  skills: (typeof skill.$inferSelect & { resourceAccess?: ResourceAccess })[];
  mcpServers: (typeof mcpServer.$inferSelect)[];
}

export async function getAgentFullConfig(ctx: AuthContext, agentConfigId: string | null): Promise<AgentFullConfig> {
  if (!agentConfigId) {
    const [providerRows, mcpServerRows] = await Promise.all([
      db.select().from(provider).where(eq(provider.organizationId, ctx.organizationId)),
      db.select().from(mcpServer).where(eq(mcpServer.organizationId, ctx.organizationId)),
    ]);
    const providers = await decorateResourceAccess(ctx, "provider", providerRows);
    const skills: (typeof skill.$inferSelect & { resourceAccess?: ResourceAccess })[] = [];
    const mcpServers = mcpServerRows.filter((row) => row.enabled === true);
    return { agentConfig: null, providers, skills, mcpServers };
  }

  const resolvedAgent = await getReadableAgentConfigById(ctx, agentConfigId);
  if (!resolvedAgent) {
    return { agentConfig: null, providers: [], skills: [], mcpServers: [] };
  }

  const sourceCtx: AuthContext = {
    ...ctx,
    organizationId: resolvedAgent.organizationId,
    userId: resolvedAgent.userId,
  };

  const [providerRows, mcpServerRows, skillBindings] = await Promise.all([
    db.select().from(provider).where(eq(provider.organizationId, sourceCtx.organizationId)),
    db.select().from(mcpServer).where(eq(mcpServer.organizationId, sourceCtx.organizationId)),
    db
      .select({ skillId: agentConfigSkill.skillId })
      .from(agentConfigSkill)
      .where(eq(agentConfigSkill.agentConfigId, agentConfigId)),
  ]);
  const providers = await decorateResourceAccess(sourceCtx, "provider", providerRows);

  let skills: (typeof skill.$inferSelect & { resourceAccess?: ResourceAccess })[] = [];
  if (skillBindings.length > 0) {
    const skillIds = skillBindings.map((binding) => binding.skillId);
    const skillRows = await db.select().from(skill).where(inArray(skill.id, skillIds));
    skills = await decorateResourceAccess(sourceCtx, "skill", skillRows);
  }

  return {
    agentConfig: resolvedAgent,
    providers,
    skills,
    mcpServers: mcpServerRows.filter((row) => row.enabled === true),
  };
}
