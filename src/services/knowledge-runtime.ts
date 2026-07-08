import { agentKnowledgeBindingRepo, knowledgeBaseRepo, knowledgeResourceRepo } from "../repositories/knowledge-base";
import { getKnowledgeProvider as getKnowledgeRuntimeProvider } from "./knowledge-provider/registry";
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
  KnowledgeResourceContent,
  KnowledgeRetrievalDetailedResult,
  KnowledgeSearchResult,
  MetaDataFilter,
  RerankModelOption,
} from "./knowledge-provider/types";

export interface BoundKnowledgeBase {
  id: string;
  remoteId: string;
  remoteAccountId: string;
  remoteUserId: string;
  priority: number;
}

export { setKnowledgeProviderForTesting as setKnowledgeRuntimeProviderForTesting } from "./knowledge-provider/registry";

/**
 * Reads a knowledge resource only if it belongs to a knowledge base bound to the agent.
 */
export async function readKnowledgeResourceForAgent(input: {
  agentConfigId?: string;
  resourceId: string;
  userId?: string;
}): Promise<KnowledgeResourceContent & { knowledgeBaseId: string }> {
  const result = await agentKnowledgeBindingRepo.getResourceWithKnowledgeBase(input.resourceId);

  if (!result) {
    throw new Error("Knowledge resource not found");
  }
  if (!result.resource.remoteId) {
    throw new Error("Knowledge resource remote id is missing");
  }
  if (input.userId && result.kbUserId !== input.userId) {
    throw new Error("Knowledge resource not accessible");
  }

  const boundKnowledgeBases = input.agentConfigId
    ? await resolveBoundKnowledgeBasesByConfigId(input.agentConfigId, input.userId)
    : [];
  if (!boundKnowledgeBases.some((item) => item.id === result.resource.knowledgeBaseId)) {
    throw new Error("Knowledge resource is not bound to the agent");
  }

  const provider = getKnowledgeRuntimeProvider();
  const content = await provider.readResource({
    resourceRemoteId: result.resource.remoteId,
    knowledgeBaseRemoteId: result.kbRemoteId || result.kbRemoteAccountId?.trim() || result.kbUserId,
    remoteAccountId: result.kbRemoteAccountId?.trim() || result.kbUserId,
    remoteUserId: result.kbRemoteUserId?.trim() || result.kbUserId,
  });
  return {
    ...content,
    knowledgeBaseId: result.resource.knowledgeBaseId,
    resourceId: result.resource.id,
  };
}

/**
 * Resolves the ordered bound knowledge bases for an agent config, optionally scoped to a team.
 */
export async function resolveBoundKnowledgeBasesByConfigId(
  agentConfigId: string,
  orgId?: string,
): Promise<BoundKnowledgeBase[]> {
  const rows = await agentKnowledgeBindingRepo.listJoinedWithKnowledgeBaseByConfigId(agentConfigId);
  return rows
    .filter((row) => !!row.kbRemoteId && (!orgId || row.kbUserId === orgId))
    .sort((a, b) => a.priority - b.priority)
    .map((row) => ({
      id: row.kbId,
      remoteId: row.kbRemoteId!,
      remoteAccountId: row.kbRemoteAccountId?.trim() || row.kbUserId,
      remoteUserId: row.kbRemoteUserId?.trim() || row.kbUserId,
      priority: row.priority,
    }));
}

/**
 * Searches across the agent config's bound knowledge bases after server-side access filtering.
 */
export async function searchKnowledgeByConfigId(input: {
  agentConfigId: string;
  query: string;
  topK: number;
  organizationId?: string;
}): Promise<KnowledgeSearchResult[]> {
  return searchKnowledgeDetailedForAgent(input);
}

/**
 * Searches across the agent config's bound knowledge bases with full parameter support.
 * Supports similarity threshold, vector weight, rerank, keyword, highlight, cross languages,
 * knowledge graph retrieval, and metadata filtering.
 */
export async function searchKnowledgeDetailedForAgent(input: {
  agentConfigId: string;
  query: string;
  topK: number;
  organizationId?: string;
  similarityThreshold?: number;
  vectorSimilarityWeight?: number;
  rerankId?: string | null;
  keyword?: boolean;
  highlight?: boolean;
  useKg?: boolean;
  crossLanguages?: string[];
  metaDataFilter?: MetaDataFilter;
}): Promise<KnowledgeSearchResult[]> {
  const knowledgeBases = await resolveBoundKnowledgeBasesByConfigId(input.agentConfigId, input.organizationId);
  if (knowledgeBases.length === 0) return [];

  const provider = getKnowledgeRuntimeProvider();
  const results = await provider.search({
    knowledgeBases: knowledgeBases.map((item) => ({
      remoteId: item.remoteId,
      remoteAccountId: item.remoteAccountId,
      remoteUserId: item.remoteUserId,
    })),
    query: input.query,
    topK: input.topK,
    similarityThreshold: input.similarityThreshold,
    vectorSimilarityWeight: input.vectorSimilarityWeight,
    rerankId: input.rerankId,
    keyword: input.keyword,
    highlight: input.highlight,
    useKg: input.useKg,
    crossLanguages: input.crossLanguages,
    metaDataFilter: input.metaDataFilter,
  });

  const knowledgeBaseIdByRemoteId = new Map(knowledgeBases.map((item) => [item.remoteId, item.id]));
  const resourceRemoteIds = Array.from(
    new Set(results.map((item) => item.resourceId?.trim()).filter((value): value is string => !!value)),
  );
  const resourceIdByRemoteId = new Map<string, string>();
  if (resourceRemoteIds.length > 0) {
    const resourceRows = await knowledgeResourceRepo.findByRemoteIds(resourceRemoteIds);
    for (const row of resourceRows) {
      if (row.remoteId) resourceIdByRemoteId.set(row.remoteId, row.id);
    }
  }

  // 对搜索结果中未在本地绑定中找到的 dataset_id 记录 warning
  for (const item of results) {
    if (item.knowledgeBaseId && !knowledgeBaseIdByRemoteId.has(item.knowledgeBaseId)) {
      console.warn("[knowledge-runtime] search result dataset_id not found in local bindings", {
        dataset_id: item.knowledgeBaseId,
      });
    }
  }

  return results.map((item) => ({
    title: item.title,
    snippet: item.snippet,
    source: item.source,
    score: item.score,
    knowledgeBaseId: item.knowledgeBaseId ? (knowledgeBaseIdByRemoteId.get(item.knowledgeBaseId) ?? null) : null,
    resourceId: item.resourceId ? (resourceIdByRemoteId.get(item.resourceId) ?? item.resourceId) : null,
  }));
}

/**
 * 检索测试：按单个知识库 ID 检索，返回保留完整字段的详细结果（供知识库详情页检索测试 UI 使用）。
 * 与 searchKnowledgeByConfigId 的区别：
 * - 不依赖 agent 绑定，直接按知识库 ID 检索（用户在知识库详情页测试）
 * - 返回 KnowledgeRetrievalDetailedResult（含三种相似度分、高亮、文档聚合）
 *
 * 组织隔离：通过 knowledgeBaseRepo.getByOrgAndId 校验该知识库属于当前组织。
 */
export async function searchKnowledgeForTest(input: {
  organizationId: string;
  knowledgeBaseId: string;
  query: string;
  topK: number;
  similarityThreshold?: number;
  vectorSimilarityWeight?: number;
  rerankId?: string | null;
  keyword?: boolean;
  highlight?: boolean;
  pageSize?: number;
  page?: number;
  useKg?: boolean;
  crossLanguages?: string[];
  metaDataFilter?: MetaDataFilter;
}): Promise<KnowledgeRetrievalDetailedResult> {
  // 校验知识库归属当前组织，并取 remoteId
  const kb = await knowledgeBaseRepo.getByOrgAndId(input.organizationId, input.knowledgeBaseId);
  if (!kb) {
    throw new Error("Knowledge base not found");
  }
  if (!kb.remoteId) {
    throw new Error("Knowledge base remote id is missing");
  }

  const provider = getKnowledgeRuntimeProvider();
  // remoteAccountId/remoteUserId 在当前 RAGFlow 集成中主要用于鉴权上下文透传
  const remoteAccountId = kb.remoteAccountId?.trim() || kb.organizationId;
  const remoteUserId = kb.remoteUserId?.trim() || kb.organizationId;

  return provider.searchDetailed({
    knowledgeBases: [
      {
        remoteId: kb.remoteId,
        remoteAccountId,
        remoteUserId,
      },
    ],
    query: input.query,
    topK: input.topK,
    similarityThreshold: input.similarityThreshold,
    vectorSimilarityWeight: input.vectorSimilarityWeight,
    rerankId: input.rerankId,
    keyword: input.keyword,
    highlight: input.highlight,
    pageSize: input.pageSize,
    page: input.page,
    useKg: input.useKg,
    crossLanguages: input.crossLanguages,
    metaDataFilter: input.metaDataFilter,
  });
}

/**
 * 拉取可用 rerank 模型列表，供检索测试选择重排序模型。
 * rerank 模型是 RAGFlow 租户级配置，与组织无关，但保留 org 参数以统一调用约定。
 */
export async function listRerankModelsForOrg(_organizationId?: string): Promise<RerankModelOption[]> {
  const provider = getKnowledgeRuntimeProvider();
  return provider.listRerankModels();
}

// ============================================================
// 知识图谱
// ============================================================

/**
 * 触发知识库的知识图谱生成（后台 GraphRAG 流水线）。
 */
export async function generateKnowledgeGraphForKb(input: {
  organizationId: string;
  knowledgeBaseId: string;
}): Promise<void> {
  const kb = await knowledgeBaseRepo.getByOrgAndId(input.organizationId, input.knowledgeBaseId);
  if (!kb) throw new Error("Knowledge base not found");
  if (!kb.remoteId) throw new Error("Knowledge base remote id is missing");

  const provider = getKnowledgeRuntimeProvider();
  await provider.generateKnowledgeGraph({
    knowledgeBaseRemoteId: kb.remoteId,
    remoteAccountId: kb.remoteAccountId?.trim() || kb.organizationId,
    remoteUserId: kb.remoteUserId?.trim() || kb.organizationId,
  });
}

/**
 * 获取知识库的知识图谱数据（节点 + 边）。
 */
export async function getKnowledgeGraphForKb(input: {
  organizationId: string;
  knowledgeBaseId: string;
}): Promise<{ graph: { nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] }; mind_map?: unknown } | null> {
  const kb = await knowledgeBaseRepo.getByOrgAndId(input.organizationId, input.knowledgeBaseId);
  if (!kb) throw new Error("Knowledge base not found");
  if (!kb.remoteId) throw new Error("Knowledge base remote id is missing");

  const provider = getKnowledgeRuntimeProvider();
  return provider.getKnowledgeGraph({
    knowledgeBaseRemoteId: kb.remoteId,
    remoteAccountId: kb.remoteAccountId?.trim() || kb.organizationId,
    remoteUserId: kb.remoteUserId?.trim() || kb.organizationId,
  });
}

/**
 * 删除知识库的知识图谱。
 */
export async function deleteKnowledgeGraphForKb(input: {
  organizationId: string;
  knowledgeBaseId: string;
}): Promise<void> {
  const kb = await knowledgeBaseRepo.getByOrgAndId(input.organizationId, input.knowledgeBaseId);
  if (!kb) throw new Error("Knowledge base not found");
  if (!kb.remoteId) throw new Error("Knowledge base remote id is missing");

  const provider = getKnowledgeRuntimeProvider();
  await provider.deleteKnowledgeGraph({
    knowledgeBaseRemoteId: kb.remoteId,
    remoteAccountId: kb.remoteAccountId?.trim() || kb.organizationId,
    remoteUserId: kb.remoteUserId?.trim() || kb.organizationId,
  });
}

/**
 * 轮询知识图谱生成进度，返回 0~1 的进度值。
 */
export async function pollKnowledgeGraphProgressForKb(input: {
  organizationId: string;
  knowledgeBaseId: string;
}): Promise<{ progress: number; progressMsg?: string; taskId?: string }> {
  const kb = await knowledgeBaseRepo.getByOrgAndId(input.organizationId, input.knowledgeBaseId);
  if (!kb) throw new Error("Knowledge base not found");
  if (!kb.remoteId) throw new Error("Knowledge base remote id is missing");

  const provider = getKnowledgeRuntimeProvider();
  return provider.pollKnowledgeGraphProgress({
    knowledgeBaseRemoteId: kb.remoteId,
    remoteAccountId: kb.remoteAccountId?.trim() || kb.organizationId,
    remoteUserId: kb.remoteUserId?.trim() || kb.organizationId,
  });
}

/**
 * 获取 agent 绑定知识库的知识图谱数据（节点 + 边）。
 * 若指定 knowledgeBaseId，仅查该 KB；否则返回第一个有图谱的绑定 KB。
 */
export async function getKnowledgeGraphForAgent(input: {
  agentConfigId: string;
  organizationId?: string;
  knowledgeBaseId?: string;
}): Promise<{
  knowledgeBaseId: string;
  graph: { nodes: KnowledgeGraphNode[]; edges: KnowledgeGraphEdge[] };
  mind_map?: unknown;
} | null> {
  const knowledgeBases = await resolveBoundKnowledgeBasesByConfigId(input.agentConfigId, input.organizationId);
  if (knowledgeBases.length === 0) return null;

  const provider = getKnowledgeRuntimeProvider();

  // 若指定了 KB ID，只查那个
  if (input.knowledgeBaseId) {
    const target = knowledgeBases.find((kb) => kb.id === input.knowledgeBaseId);
    if (!target) throw new Error(`Knowledge base ${input.knowledgeBaseId} is not bound to this agent`);
    const result = await provider.getKnowledgeGraph({
      knowledgeBaseRemoteId: target.remoteId,
      remoteAccountId: target.remoteAccountId,
      remoteUserId: target.remoteUserId,
    });
    if (!result) return null;
    return { knowledgeBaseId: target.id, ...result };
  }

  // 否则遍历所有绑定 KB，返回第一个有图谱的
  for (const kb of knowledgeBases) {
    const result = await provider.getKnowledgeGraph({
      knowledgeBaseRemoteId: kb.remoteId,
      remoteAccountId: kb.remoteAccountId,
      remoteUserId: kb.remoteUserId,
    });
    if (result) {
      return { knowledgeBaseId: kb.id, ...result };
    }
  }

  return null;
}
