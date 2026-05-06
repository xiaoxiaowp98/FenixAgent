import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { agentKnowledgeBinding, knowledgeBase, knowledgeResource } from "../db/schema";
import { createKnowledgeProvider } from "./knowledge-provider/openviking";
import type {
  KnowledgeProvider,
  KnowledgeResourceContent,
  KnowledgeSearchResult,
} from "./knowledge-provider/types";

export interface BoundKnowledgeBase {
  id: string;
  remoteId: string;
  remoteAccountId: string;
  remoteUserId: string;
  priority: number;
}

let knowledgeRuntimeProvider: KnowledgeProvider | null = null;

function getKnowledgeRuntimeProvider(): KnowledgeProvider {
  if (!knowledgeRuntimeProvider) {
    knowledgeRuntimeProvider = createKnowledgeProvider();
  }
  return knowledgeRuntimeProvider;
}

export function setKnowledgeRuntimeProviderForTesting(provider: KnowledgeProvider | null) {
  knowledgeRuntimeProvider = provider;
}

/**
 * Resolves the ordered bound knowledge bases for an agent, optionally scoped to a user.
 */
export async function resolveBoundKnowledgeBasesForAgent(
  agentName: string,
  userId?: string,
): Promise<BoundKnowledgeBase[]> {
  const rows = await db.select({
    id: knowledgeBase.id,
    remoteId: knowledgeBase.remoteId,
    remoteAccountId: knowledgeBase.remoteAccountId,
    remoteUserId: knowledgeBase.remoteUserId,
    priority: agentKnowledgeBinding.priority,
    userId: knowledgeBase.userId,
  })
    .from(agentKnowledgeBinding)
    .innerJoin(knowledgeBase, eq(agentKnowledgeBinding.knowledgeBaseId, knowledgeBase.id))
    .where(and(eq(agentKnowledgeBinding.agentName, agentName), eq(agentKnowledgeBinding.enabled, true)));

  return rows
    .filter((row) => !!row.remoteId && (!userId || row.userId === userId))
    .sort((a, b) => a.priority - b.priority)
    .map((row) => ({
      id: row.id,
      remoteId: row.remoteId!,
      remoteAccountId: row.remoteAccountId?.trim() || row.userId,
      remoteUserId: row.remoteUserId?.trim() || row.userId,
      priority: row.priority,
    }));
}

/**
 * Searches across the agent's bound knowledge bases after server-side access filtering.
 */
export async function searchKnowledgeForAgent(input: {
  agentName: string;
  query: string;
  topK: number;
  userId?: string;
}): Promise<KnowledgeSearchResult[]> {
  const knowledgeBases = await resolveBoundKnowledgeBasesForAgent(input.agentName, input.userId);
  if (knowledgeBases.length === 0) {
    return [];
  }

  const provider = getKnowledgeRuntimeProvider();
  const results = await provider.search({
    knowledgeBases: knowledgeBases.map((item) => ({
      remoteId: item.remoteId,
      remoteAccountId: item.remoteAccountId,
      remoteUserId: item.remoteUserId,
    })),
    query: input.query,
    topK: input.topK,
  });

  const knowledgeBaseIdByRemoteId = new Map(knowledgeBases.map((item) => [item.remoteId, item.id]));
  const resourceRemoteIds = Array.from(
    new Set(
      results
        .map((item) => item.resourceId?.trim())
        .filter((value): value is string => !!value),
    ),
  );
  const resourceIdByRemoteId = new Map<string, string>();
  if (resourceRemoteIds.length > 0) {
    const resourceRows = await db.select({
      id: knowledgeResource.id,
      remoteId: knowledgeResource.remoteId,
    })
      .from(knowledgeResource)
      .where(inArray(knowledgeResource.remoteId, resourceRemoteIds));
    for (const row of resourceRows) {
      if (row.remoteId) {
        resourceIdByRemoteId.set(row.remoteId, row.id);
      }
    }
  }

  return results.map((item) => ({
    title: item.title,
    snippet: item.snippet,
    source: item.source,
    score: item.score,
    knowledgeBaseId: item.knowledgeBaseId
      ? knowledgeBaseIdByRemoteId.get(item.knowledgeBaseId) ?? item.knowledgeBaseId
      : null,
    resourceId: item.resourceId
      ? resourceIdByRemoteId.get(item.resourceId) ?? item.resourceId
      : null,
  }));
}

/**
 * Reads a knowledge resource only if it belongs to a knowledge base bound to the agent.
 */
export async function readKnowledgeResourceForAgent(input: {
  agentName: string;
  resourceId: string;
  userId?: string;
}): Promise<KnowledgeResourceContent & { knowledgeBaseId: string }> {
  const [resourceRow] = await db.select({
    id: knowledgeResource.id,
    remoteId: knowledgeResource.remoteId,
    knowledgeBaseId: knowledgeResource.knowledgeBaseId,
    knowledgeBaseUserId: knowledgeBase.userId,
    knowledgeBaseRemoteAccountId: knowledgeBase.remoteAccountId,
    knowledgeBaseRemoteUserId: knowledgeBase.remoteUserId,
  })
    .from(knowledgeResource)
    .innerJoin(knowledgeBase, eq(knowledgeResource.knowledgeBaseId, knowledgeBase.id))
    .where(eq(knowledgeResource.id, input.resourceId));

  if (!resourceRow) {
    throw new Error("Knowledge resource not found");
  }
  if (!resourceRow.remoteId) {
    throw new Error("Knowledge resource remote id is missing");
  }
  if (input.userId && resourceRow.knowledgeBaseUserId !== input.userId) {
    throw new Error("Knowledge resource not accessible");
  }

  const boundKnowledgeBases = await resolveBoundKnowledgeBasesForAgent(input.agentName, input.userId);
  if (!boundKnowledgeBases.some((item) => item.id === resourceRow.knowledgeBaseId)) {
    throw new Error("Knowledge resource is not bound to the agent");
  }

  const provider = getKnowledgeRuntimeProvider();
  const content = await provider.readResource({
    resourceRemoteId: resourceRow.remoteId,
    remoteAccountId: resourceRow.knowledgeBaseRemoteAccountId?.trim() || resourceRow.knowledgeBaseUserId,
    remoteUserId: resourceRow.knowledgeBaseRemoteUserId?.trim() || resourceRow.knowledgeBaseUserId,
  });
  return {
    ...content,
    knowledgeBaseId: resourceRow.knowledgeBaseId,
    resourceId: resourceRow.id,
  };
}
