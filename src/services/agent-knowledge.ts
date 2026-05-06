import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { agentKnowledgeBinding, knowledgeBase } from "../db/schema";

export interface AgentKnowledgePolicy {
  searchFirst?: boolean;
  maxResults?: number;
  defaultNamespaces?: string[];
}

export interface AgentKnowledgeConfig {
  knowledgeBaseIds: string[];
  policy?: AgentKnowledgePolicy | null;
}

export interface ResolvedAgentKnowledgePolicy {
  searchFirst: boolean;
  maxResults: number;
  defaultNamespaces: string[];
}

export interface AgentKnowledgeBindingRecord {
  knowledgeBaseId: string;
  priority: number;
  enabled: boolean;
}

export class InvalidKnowledgeBindingError extends Error {
  code = "INVALID_KNOWLEDGE_BINDINGS";
}

const DEFAULT_SEARCH_FIRST = true;
const DEFAULT_MAX_RESULTS = 5;

function generateBindingId(): string {
  return `akb_${randomBytes(8).toString("hex")}`;
}

function normalizeKnowledgeBaseIds(knowledgeBaseIds: string[] | undefined): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of knowledgeBaseIds ?? []) {
    if (typeof value !== "string") continue;
    const id = value.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * Resolves a complete runtime policy object from optional agent knowledge config.
 */
export function resolveAgentKnowledgePolicy(
  policy?: AgentKnowledgePolicy | null,
): ResolvedAgentKnowledgePolicy {
  return {
    searchFirst: policy?.searchFirst ?? DEFAULT_SEARCH_FIRST,
    maxResults: policy?.maxResults ?? DEFAULT_MAX_RESULTS,
    defaultNamespaces: Array.isArray(policy?.defaultNamespaces)
      ? policy!.defaultNamespaces.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [],
  };
}

/**
 * Lists enabled knowledge base bindings for an agent in priority order.
 */
export async function listAgentKnowledgeBindings(agentName: string): Promise<AgentKnowledgeBindingRecord[]> {
  const rows = await db.select().from(agentKnowledgeBinding)
    .where(and(eq(agentKnowledgeBinding.agentName, agentName), eq(agentKnowledgeBinding.enabled, true)))
    .orderBy(agentKnowledgeBinding.priority);
  return rows.map((row) => ({
    knowledgeBaseId: row.knowledgeBaseId,
    priority: row.priority,
    enabled: row.enabled,
  }));
}

/**
 * Counts how many agent bindings exist for each knowledge base id.
 */
export async function countBindingsByKnowledgeBaseIds(
  knowledgeBaseIds: string[],
): Promise<Record<string, number>> {
  const ids = normalizeKnowledgeBaseIds(knowledgeBaseIds);
  if (ids.length === 0) {
    return {};
  }

  const rows = await db.select().from(agentKnowledgeBinding)
    .where(inArray(agentKnowledgeBinding.knowledgeBaseId, ids));
  const counts: Record<string, number> = {};
  for (const id of ids) {
    counts[id] = 0;
  }
  for (const row of rows) {
    counts[row.knowledgeBaseId] = (counts[row.knowledgeBaseId] ?? 0) + 1;
  }
  return counts;
}

/**
 * Replaces all agent knowledge bindings with the provided ordered knowledge base ids.
 */
export async function syncAgentKnowledgeBindings(
  userId: string,
  agentName: string,
  knowledge: AgentKnowledgeConfig | null | undefined,
): Promise<void> {
  const knowledgeBaseIds = normalizeKnowledgeBaseIds(knowledge?.knowledgeBaseIds);
  await db.delete(agentKnowledgeBinding).where(eq(agentKnowledgeBinding.agentName, agentName));

  if (knowledgeBaseIds.length === 0) {
    return;
  }

  const existingKnowledgeBases = await db.select({
    id: knowledgeBase.id,
  }).from(knowledgeBase)
    .where(and(eq(knowledgeBase.userId, userId), inArray(knowledgeBase.id, knowledgeBaseIds)));
  const existingIds = new Set(existingKnowledgeBases.map((row) => row.id));
  const missingIds = knowledgeBaseIds.filter((id) => !existingIds.has(id));
  if (missingIds.length > 0) {
    throw new InvalidKnowledgeBindingError(`知识库不存在或无权限访问: ${missingIds.join(", ")}`);
  }

  const now = new Date();
  await db.insert(agentKnowledgeBinding).values(
    knowledgeBaseIds.map((knowledgeBaseId, priority) => ({
      id: generateBindingId(),
      agentName,
      knowledgeBaseId,
      priority,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })),
  );
}
