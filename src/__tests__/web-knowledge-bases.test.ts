import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("../auth/better-auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "kb-user-1", email: "kb@test.com", name: "KB User" },
        session: { id: "sess-kb-1", userId: "kb-user-1", token: "tok-kb-1" },
      }),
    },
  },
}));

const { Hono } = await import("hono");
const { db } = await import("../db");
const {
  agentKnowledgeBinding,
  knowledgeBase,
  knowledgeResource,
  user,
} = await import("../db/schema");
const { eq } = await import("drizzle-orm");
const webKnowledgeBases = (await import("../routes/web/knowledge-bases")).default;
const { setKnowledgeProviderForTesting } = await import("../services/knowledge-base");

const testApp = new Hono();
testApp.route("/web", webKnowledgeBases);

const fakeProvider = {
  async createKnowledgeBase(input: { slug: string; name: string }) {
    return {
      remoteId: null,
      name: input.name,
      status: "empty" as const,
      description: null,
      lastError: null,
    };
  },
  async addResource() {
    throw new Error("unused");
  },
  async listResources() {
    return [];
  },
  async deleteResource() {
    return;
  },
  async search() {
    return [];
  },
  async readResource() {
    return { resourceId: "unused", content: "" };
  },
};

async function ensureUser() {
  const now = new Date();
  const [existing] = await db.select().from(user).where(eq(user.id, "kb-user-1"));
  if (!existing) {
    await db.insert(user).values({
      id: "kb-user-1",
      name: "KB User",
      email: "kb@test.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
  }
}

describe("Knowledge base routes", () => {
  beforeEach(async () => {
    setKnowledgeProviderForTesting(fakeProvider as any);
    await db.delete(agentKnowledgeBinding);
    await db.delete(knowledgeResource);
    await db.delete(knowledgeBase);
    await db.delete(user).where(eq(user.id, "kb-user-1"));
    await db.delete(user).where(eq(user.id, "other-user"));
    await ensureUser();
  });

  test("POST /web/knowledge-bases returns 201 with kb_ id", async () => {
    const response = await testApp.request("/web/knowledge-bases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Project Docs",
        slug: "project-docs",
        description: "docs",
      }),
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.id).toMatch(/^kb_/);
    expect(body.remoteId).toBe("viking://resources/kb/kb-user-1/project-docs/");
  });

  test("GET /web/knowledge-bases lists only current user rows with binding summary", async () => {
    const now = new Date();
    await db.insert(user).values({
      id: "other-user",
      name: "Other User",
      email: "other@test.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(knowledgeBase).values([
      {
        id: "kb_a",
        userId: "kb-user-1",
        name: "Docs A",
        slug: "docs-a",
        description: null,
        provider: "openviking",
        remoteId: "remote-a",
        status: "ready",
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "kb_b",
        userId: "other-user",
        name: "Docs B",
        slug: "docs-b",
        description: null,
        provider: "openviking",
        remoteId: "remote-b",
        status: "ready",
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(agentKnowledgeBinding).values({
      id: "bind_1",
      agentName: "build",
      knowledgeBaseId: "kb_a",
      priority: 0,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });

    const response = await testApp.request("/web/knowledge-bases");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("kb_a");
    expect(body[0].bindingsCount).toBe(1);
  });

  test("PATCH /web/knowledge-bases/:id updates description and preserves other fields", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    await db.insert(knowledgeBase).values({
      id: "kb_patch",
      userId: "kb-user-1",
      name: "Docs",
      slug: "docs",
      description: "before",
      provider: "openviking",
      remoteId: "remote-docs",
      status: "ready",
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await testApp.request("/web/knowledge-bases/kb_patch", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "after" }),
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.description).toBe("after");
    expect(body.name).toBe("Docs");
    expect(body.updatedAt).toBeGreaterThan(body.createdAt);
  });

  test("DELETE /web/knowledge-bases/:id removes the row and subsequent GET returns 404", async () => {
    const deleteCalls: Array<{ remoteId: string; recursive?: boolean }> = [];
    setKnowledgeProviderForTesting({
      ...fakeProvider,
      async deleteResource(input: { resourceRemoteId: string; recursive?: boolean }) {
        deleteCalls.push({ remoteId: input.resourceRemoteId, recursive: input.recursive });
      },
    } as any);
    const now = new Date();
    await db.insert(knowledgeBase).values({
      id: "kb_delete",
      userId: "kb-user-1",
      name: "Docs",
      slug: "docs",
      description: null,
      provider: "openviking",
      remoteId: "viking://resources/kb/kb-user-1/docs/",
      status: "ready",
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });

    const deleteResponse = await testApp.request("/web/knowledge-bases/kb_delete", {
      method: "DELETE",
    });
    expect(deleteResponse.status).toBe(200);
    expect(deleteCalls).toEqual([
      { remoteId: "viking://resources/kb/kb-user-1/docs/", recursive: true },
    ]);

    const detailResponse = await testApp.request("/web/knowledge-bases/kb_delete");
    expect(detailResponse.status).toBe(404);
  });

  test("DELETE /web/knowledge-bases/:id returns provider error message when remote delete fails", async () => {
    setKnowledgeProviderForTesting({
      ...fakeProvider,
      async deleteResource() {
        throw new Error("Resource is being processed: viking://resources/kb/kb-user-1/docs/");
      },
    } as any);
    const now = new Date();
    await db.insert(knowledgeBase).values({
      id: "kb_delete_busy",
      userId: "kb-user-1",
      name: "Docs Busy",
      slug: "docs-busy",
      description: null,
      provider: "openviking",
      remoteId: "viking://resources/kb/kb-user-1/docs/",
      status: "ready",
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await testApp.request("/web/knowledge-bases/kb_delete_busy", {
      method: "DELETE",
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.message).toBe("Resource is being processed: viking://resources/kb/kb-user-1/docs/");
  });
});
