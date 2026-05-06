import { and, count, desc, eq, sql } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db";
import {
  agentKnowledgeBinding,
  knowledgeBase,
  knowledgeResource,
} from "../db/schema";
import { config } from "../config";
import { createKnowledgeProvider } from "./knowledge-provider/openviking";
import type {
  KnowledgeBaseStatus,
  KnowledgeProvider,
  KnowledgeResourceStatus,
} from "./knowledge-provider/types";

export interface KnowledgeTenantIdentity {
  remoteAccountId: string;
  remoteUserId: string;
}

function generateKnowledgeBaseId(): string {
  return `kb_${randomBytes(8).toString("hex")}`;
}

function normalizeSlug(slug: string): string {
  return slug.trim().toLowerCase();
}

function normalizeUriSegment(value: string): string {
  return value.trim().replace(/[\\/]/g, "_");
}

export function buildKnowledgeBaseRemoteId(userId: string, slug: string): string {
  return `viking://resources/kb/${normalizeUriSegment(userId)}/${normalizeUriSegment(normalizeSlug(slug))}/`;
}

function validateName(name: string): string | null {
  if (!name || name.trim().length === 0) {
    return "知识库名称不能为空";
  }
  if (name.trim().length > 120) {
    return "知识库名称不能超过 120 字符";
  }
  return null;
}

function validateSlug(slug: string): string | null {
  const normalized = normalizeSlug(slug);
  if (!normalized) {
    return "slug 不能为空";
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(normalized)) {
    return "slug 必须为 kebab-case";
  }
  if (normalized.length > 80) {
    return "slug 不能超过 80 字符";
  }
  return null;
}

function toUnixTimestamp(value: Date | null | undefined): number | null {
  return value ? Math.floor(value.getTime() / 1000) : null;
}

let knowledgeProvider: KnowledgeProvider | null = null;

function getKnowledgeProvider(): KnowledgeProvider {
  if (!knowledgeProvider) {
    knowledgeProvider = createKnowledgeProvider();
  }
  return knowledgeProvider;
}

export function setKnowledgeProviderForTesting(provider: KnowledgeProvider | null) {
  knowledgeProvider = provider;
}

function sanitizeKnowledgeBase(
  row: typeof knowledgeBase.$inferSelect,
  extras?: {
    bindingsCount?: number;
    resourcesCount?: number;
    recentResources?: Array<{
      id: string;
      sourceName: string;
      sourceType: string;
      status: KnowledgeResourceStatus;
      lastError: string | null;
      createdAt: number;
      updatedAt: number;
    }>;
  },
) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    provider: row.provider,
    remoteId: row.remoteId ?? null,
    remoteAccountId: row.remoteAccountId ?? null,
    remoteUserId: row.remoteUserId ?? null,
    status: row.status as KnowledgeBaseStatus,
    lastError: row.lastError ?? null,
    bindingsCount: extras?.bindingsCount ?? 0,
    resourcesCount: extras?.resourcesCount ?? 0,
    recentResources: extras?.recentResources ?? [],
    createdAt: Math.floor(row.createdAt.getTime() / 1000),
    updatedAt: Math.floor(row.updatedAt.getTime() / 1000),
  };
}

export function resolveKnowledgeTenantIdentity(
  row: Pick<typeof knowledgeBase.$inferSelect, "userId" | "remoteAccountId" | "remoteUserId">,
): KnowledgeTenantIdentity {
  const fallback = row.userId.trim();
  return {
    remoteAccountId: row.remoteAccountId?.trim() || fallback,
    remoteUserId: row.remoteUserId?.trim() || fallback,
  };
}

async function getOwnedKnowledgeBaseRow(userId: string, knowledgeBaseId: string) {
  const [row] = await db.select().from(knowledgeBase)
    .where(and(eq(knowledgeBase.id, knowledgeBaseId), eq(knowledgeBase.userId, userId)));
  return row ?? null;
}

async function assertUniqueSlug(userId: string, slug: string, excludeId?: string) {
  const [row] = await db.select({ id: knowledgeBase.id }).from(knowledgeBase)
    .where(and(eq(knowledgeBase.userId, userId), eq(knowledgeBase.slug, normalizeSlug(slug))));
  if (row && row.id !== excludeId) {
    throw new Error(`知识库 slug '${normalizeSlug(slug)}' 已存在`);
  }
}

async function loadResourceCount(knowledgeBaseId: string): Promise<number> {
  const [row] = await db.select({ count: count() }).from(knowledgeResource)
    .where(eq(knowledgeResource.knowledgeBaseId, knowledgeBaseId));
  return row?.count ?? 0;
}

export async function countKnowledgeBaseBindings(knowledgeBaseId: string): Promise<number> {
  const [row] = await db.select({ count: count() }).from(agentKnowledgeBinding)
    .where(eq(agentKnowledgeBinding.knowledgeBaseId, knowledgeBaseId));
  return row?.count ?? 0;
}

export async function listKnowledgeBasesByUserId(userId: string) {
  const rows = await db.select().from(knowledgeBase)
    .where(eq(knowledgeBase.userId, userId))
    .orderBy(desc(knowledgeBase.updatedAt));
  const items = await Promise.all(rows.map(async (row) => sanitizeKnowledgeBase(row, {
    bindingsCount: await countKnowledgeBaseBindings(row.id),
    resourcesCount: await loadResourceCount(row.id),
  })));
  return items;
}

export async function getKnowledgeBaseDetail(userId: string, knowledgeBaseId: string) {
  const row = await getOwnedKnowledgeBaseRow(userId, knowledgeBaseId);
  if (!row) {
    return null;
  }
  const resourceRows = await db.select().from(knowledgeResource)
    .where(eq(knowledgeResource.knowledgeBaseId, knowledgeBaseId))
    .orderBy(desc(knowledgeResource.updatedAt))
    .limit(20);
  const bindingsCount = await countKnowledgeBaseBindings(knowledgeBaseId);
  const resourcesCount = await loadResourceCount(knowledgeBaseId);
  return sanitizeKnowledgeBase(row, {
    bindingsCount,
    resourcesCount,
    recentResources: resourceRows.map((resource) => ({
      id: resource.id,
      sourceName: resource.sourceName,
      sourceType: resource.sourceType,
      status: resource.status as KnowledgeResourceStatus,
      lastError: resource.lastError ?? null,
      createdAt: Math.floor(resource.createdAt.getTime() / 1000),
      updatedAt: Math.floor(resource.updatedAt.getTime() / 1000),
    })),
  });
}

export async function createKnowledgeBaseRecord(
  userId: string,
  input: { name: string; slug: string; description?: string | null },
) {
  const nameError = validateName(input.name);
  if (nameError) {
    return { success: false as const, error: { code: "VALIDATION_ERROR", message: nameError } };
  }
  const slugError = validateSlug(input.slug);
  if (slugError) {
    return { success: false as const, error: { code: "VALIDATION_ERROR", message: slugError } };
  }

  try {
    await assertUniqueSlug(userId, input.slug);
  } catch (error) {
    return { success: false as const, error: { code: "VALIDATION_ERROR", message: (error as Error).message } };
  }

  const provider = getKnowledgeProvider();
  const tenantIdentity = resolveKnowledgeTenantIdentity({
    userId,
    remoteAccountId: userId,
    remoteUserId: userId,
  });
  const remote = await provider.createKnowledgeBase({
    userId,
    slug: normalizeSlug(input.slug),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
  });

  const now = new Date();
  const id = generateKnowledgeBaseId();
  const remoteId = remote.remoteId ?? buildKnowledgeBaseRemoteId(userId, input.slug);
  await db.insert(knowledgeBase).values({
    id,
    userId,
    name: input.name.trim(),
    slug: normalizeSlug(input.slug),
    description: input.description?.trim() || null,
    provider: config.knowledgeProvider,
    remoteId,
    remoteAccountId: tenantIdentity.remoteAccountId,
    remoteUserId: tenantIdentity.remoteUserId,
    status: remote.status,
    lastError: remote.lastError ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const [row] = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, id));
  return { success: true as const, data: sanitizeKnowledgeBase(row) };
}

export async function updateKnowledgeBase(
  userId: string,
  knowledgeBaseId: string,
  input: { name?: string; slug?: string; description?: string | null },
) {
  const row = await getOwnedKnowledgeBaseRow(userId, knowledgeBaseId);
  if (!row) {
    return { success: false as const, error: { code: "NOT_FOUND", message: "知识库不存在" } };
  }
  if (input.name !== undefined) {
    const nameError = validateName(input.name);
    if (nameError) {
      return { success: false as const, error: { code: "VALIDATION_ERROR", message: nameError } };
    }
  }
  if (input.slug !== undefined) {
    const slugError = validateSlug(input.slug);
    if (slugError) {
      return { success: false as const, error: { code: "VALIDATION_ERROR", message: slugError } };
    }
    try {
      await assertUniqueSlug(userId, input.slug, knowledgeBaseId);
    } catch (error) {
      return { success: false as const, error: { code: "VALIDATION_ERROR", message: (error as Error).message } };
    }
  }

  const updates: Partial<typeof knowledgeBase.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.name !== undefined) {
    updates.name = input.name.trim();
  }
  if (input.slug !== undefined) {
    updates.slug = normalizeSlug(input.slug);
  }
  if (input.description !== undefined) {
    updates.description = input.description?.trim() || null;
  }
  await db.update(knowledgeBase).set(updates).where(eq(knowledgeBase.id, knowledgeBaseId));
  const [updated] = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, knowledgeBaseId));
  return { success: true as const, data: sanitizeKnowledgeBase(updated) };
}

export async function deleteKnowledgeBase(userId: string, knowledgeBaseId: string) {
  const row = await getOwnedKnowledgeBaseRow(userId, knowledgeBaseId);
  if (!row) {
    return { success: false as const, error: { code: "NOT_FOUND", message: "知识库不存在" } };
  }
  if (row.remoteId) {
    const tenantIdentity = resolveKnowledgeTenantIdentity(row);
    await getKnowledgeProvider().deleteResource({
      resourceRemoteId: row.remoteId,
      remoteAccountId: tenantIdentity.remoteAccountId,
      remoteUserId: tenantIdentity.remoteUserId,
      recursive: true,
    });
  }
  await db.delete(agentKnowledgeBinding).where(eq(agentKnowledgeBinding.knowledgeBaseId, knowledgeBaseId));
  await db.delete(knowledgeBase).where(eq(knowledgeBase.id, knowledgeBaseId));
  return { success: true as const, data: { ok: true } };
}

export async function touchKnowledgeBaseUpdatedAt(knowledgeBaseId: string, patch?: {
  status?: KnowledgeBaseStatus;
  lastError?: string | null;
  remoteId?: string | null;
}) {
  await db.update(knowledgeBase).set({
    updatedAt: new Date(),
    ...(patch?.status ? { status: patch.status } : {}),
    ...(patch && "lastError" in patch ? { lastError: patch.lastError ?? null } : {}),
    ...(patch && "remoteId" in patch ? { remoteId: patch.remoteId ?? null } : {}),
  }).where(eq(knowledgeBase.id, knowledgeBaseId));
}

export async function listKnowledgeBaseResources(knowledgeBaseId: string, limit?: number) {
  return db.select().from(knowledgeResource)
    .where(eq(knowledgeResource.knowledgeBaseId, knowledgeBaseId))
    .orderBy(desc(knowledgeResource.updatedAt))
    .limit(limit ?? 100);
}

export async function upsertKnowledgeBaseStatusFromResources(knowledgeBaseId: string) {
  const [summary] = await db.select({
    readyCount: sql<number>`sum(case when ${knowledgeResource.status} = 'ready' then 1 else 0 end)`,
    activeCount: sql<number>`sum(case when ${knowledgeResource.status} in ('pending', 'processing') then 1 else 0 end)`,
    errorCount: sql<number>`sum(case when ${knowledgeResource.status} = 'error' then 1 else 0 end)`,
    totalCount: count(),
  }).from(knowledgeResource).where(eq(knowledgeResource.knowledgeBaseId, knowledgeBaseId));

  let status: KnowledgeBaseStatus = "empty";
  if ((summary?.errorCount ?? 0) > 0) {
    status = "error";
  } else if ((summary?.activeCount ?? 0) > 0) {
    status = "indexing";
  } else if ((summary?.readyCount ?? 0) > 0) {
    status = "ready";
  }

  await touchKnowledgeBaseUpdatedAt(knowledgeBaseId, { status });
}
