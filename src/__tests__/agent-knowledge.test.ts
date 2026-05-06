import { beforeEach, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { agentKnowledgeBinding, knowledgeBase, user } from "../db/schema";
import {
  countBindingsByKnowledgeBaseIds,
  listAgentKnowledgeBindings,
  resolveAgentKnowledgePolicy,
  syncAgentKnowledgeBindings,
} from "../services/agent-knowledge";

async function ensureUser(userId: string) {
  const now = new Date();
  await db.insert(user).values({
    id: userId,
    name: userId,
    email: `${userId}@test.local`,
    emailVerified: false,
    createdAt: now,
    updatedAt: now,
  });
}

describe("agent-knowledge service", () => {
  beforeEach(async () => {
    await db.delete(agentKnowledgeBinding);
    await db.delete(knowledgeBase);
    await db.delete(user).where(inArray(user.id, ["agent-kb-user", "agent-kb-user-2"]));
    await ensureUser("agent-kb-user");
    await ensureUser("agent-kb-user-2");

    const now = new Date();
    await db.insert(knowledgeBase).values([
      {
        id: "kb_agent_1",
        userId: "agent-kb-user",
        name: "KB 1",
        slug: "kb-1",
        description: null,
        provider: "openviking",
        remoteId: "remote-1",
        status: "ready",
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "kb_agent_2",
        userId: "agent-kb-user",
        name: "KB 2",
        slug: "kb-2",
        description: null,
        provider: "openviking",
        remoteId: "remote-2",
        status: "ready",
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  test("syncAgentKnowledgeBindings replaces old bindings and preserves priority order", async () => {
    const now = new Date();
    await db.insert(agentKnowledgeBinding).values({
      id: "akb_old",
      agentName: "build",
      knowledgeBaseId: "kb_agent_1",
      priority: 0,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    await syncAgentKnowledgeBindings("agent-kb-user", "build", {
      knowledgeBaseIds: ["kb_agent_2", "kb_agent_1"],
      policy: { searchFirst: false, maxResults: 2 },
    });

    const bindings = await listAgentKnowledgeBindings("build");
    expect(bindings).toEqual([
      { knowledgeBaseId: "kb_agent_2", priority: 0, enabled: true },
      { knowledgeBaseId: "kb_agent_1", priority: 1, enabled: true },
    ]);
  });

  test("resolveAgentKnowledgePolicy returns defaults when config is missing", () => {
    expect(resolveAgentKnowledgePolicy()).toEqual({
      searchFirst: true,
      maxResults: 5,
      defaultNamespaces: [],
    });
  });

  test("countBindingsByKnowledgeBaseIds returns count per knowledge base", async () => {
    await syncAgentKnowledgeBindings("agent-kb-user", "build", { knowledgeBaseIds: ["kb_agent_1", "kb_agent_2"] });
    await syncAgentKnowledgeBindings("agent-kb-user", "plan", { knowledgeBaseIds: ["kb_agent_1"] });

    const counts = await countBindingsByKnowledgeBaseIds(["kb_agent_1", "kb_agent_2"]);
    expect(counts).toEqual({
      kb_agent_1: 2,
      kb_agent_2: 1,
    });
  });

  test("syncAgentKnowledgeBindings rejects missing knowledge bases before insert", async () => {
    await expect(syncAgentKnowledgeBindings("agent-kb-user", "build", {
      knowledgeBaseIds: ["kb_agent_1", "kb_missing"],
    })).rejects.toThrow("知识库不存在或无权限访问: kb_missing");
  });
});
