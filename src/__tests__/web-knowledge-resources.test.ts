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
const { eq } = await import("drizzle-orm");
const { knowledgeBase, knowledgeResource, user } = await import("../db/schema");
const webKnowledgeBases = (await import("../routes/web/knowledge-bases")).default;
const { setKnowledgeProviderForTesting } = await import("../services/knowledge-base");
const { setKnowledgeUploadProviderForTesting } = await import("../services/knowledge-upload");

const testApp = new Hono();
testApp.route("/web", webKnowledgeBases);

const fakeProvider = {
  async createKnowledgeBase() {
    return {
      remoteId: null,
      name: "unused",
      status: "empty" as const,
      description: null,
      lastError: null,
    };
  },
  async addResource(input: { url?: string; sourceName?: string }) {
    if (input.url) {
      throw new Error("remote import failed");
    }
    return {
      remoteId: `viking://resources/kb_upload/${input.sourceName}`,
      knowledgeBaseRemoteId: "viking://resources/kb_upload/",
      sourceName: input.sourceName || "upload.bin",
      sourceType: "upload",
      source: null,
      status: "processing" as const,
      lastError: null,
    };
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

async function seedKnowledgeBase() {
  const now = new Date();
    await db.insert(knowledgeBase).values({
      id: "kb_upload",
      userId: "kb-user-1",
    name: "Docs",
    slug: "docs",
    description: null,
    provider: "openviking",
      remoteId: null,
      status: "empty",
      lastError: null,
      createdAt: now,
    updatedAt: now,
  });
}

describe("Knowledge resource routes", () => {
  beforeEach(async () => {
    setKnowledgeProviderForTesting(fakeProvider as any);
    setKnowledgeUploadProviderForTesting(fakeProvider as any);
    await db.delete(knowledgeResource);
    await db.delete(knowledgeBase);
    await db.delete(user).where(eq(user.id, "kb-user-1"));
    await ensureUser();
    await seedKnowledgeBase();
  });

  test("multipart upload creates pending/processing resource with sourcePath", async () => {
    const form = new FormData();
    form.append("files", new File(["# Guide"], "guide.md", { type: "text/markdown" }));

    const response = await testApp.request("/web/knowledge-bases/kb_upload/resources/upload", {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.items).toHaveLength(1);
    expect(["pending", "processing"]).toContain(body.items[0].status);
    expect(body.items[0].sourcePath).toContain("data/knowledge-upload");
  });

  test("URL import failure writes lastError and marks knowledge base error", async () => {
    const response = await testApp.request("/web/knowledge-bases/kb_upload/resources/url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://example.com/spec.md",
        sourceName: "spec.md",
      }),
    });

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.lastError).toBe("remote import failed");

    const [kbRow] = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, "kb_upload"));
    expect(kbRow.status).toBe("error");
    expect(kbRow.lastError).toBe("remote import failed");
  });

  test("GET resources returns rows ordered by updatedAt desc", async () => {
    const now = new Date();
    const earlier = new Date(now.getTime() - 10_000);
    await db.insert(knowledgeResource).values([
      {
        id: "res_old",
        knowledgeBaseId: "kb_upload",
        sourceType: "upload",
        sourceName: "old.md",
        sourcePath: "/tmp/old.md",
        remoteId: "remote-old",
        status: "ready",
        lastError: null,
        createdAt: earlier,
        updatedAt: earlier,
      },
      {
        id: "res_new",
        knowledgeBaseId: "kb_upload",
        sourceType: "url",
        sourceName: "new.md",
        sourcePath: "https://example.com/new.md",
        remoteId: "remote-new",
        status: "processing",
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const response = await testApp.request("/web/knowledge-bases/kb_upload/resources");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.map((item: any) => item.id)).toEqual(["res_new", "res_old"]);
  });

  test("DELETE resource removes row and calls provider for remote resources", async () => {
    const deleteCalls: string[] = [];
    setKnowledgeUploadProviderForTesting({
      ...fakeProvider,
      async deleteResource(input: { resourceRemoteId: string }) {
        deleteCalls.push(input.resourceRemoteId);
      },
    } as any);
    const now = new Date();
    await db.insert(knowledgeResource).values({
      id: "res_delete",
      knowledgeBaseId: "kb_upload",
      sourceType: "upload",
      sourceName: "delete.md",
      sourcePath: "/tmp/delete.md",
      remoteId: "viking://resources/kb_upload/delete.md",
      status: "ready",
      lastError: null,
      createdAt: now,
      updatedAt: now,
    });

    const response = await testApp.request("/web/knowledge-bases/kb_upload/resources/res_delete", {
      method: "DELETE",
    });

    expect(response.status).toBe(200);
    expect(deleteCalls).toEqual(["viking://resources/kb_upload/delete.md"]);
    const rows = await db.select().from(knowledgeResource).where(eq(knowledgeResource.id, "res_delete"));
    expect(rows).toHaveLength(0);
  });

  test("multipart upload retries without parent when stored remoteId no longer exists", async () => {
    const retryingProvider = {
      ...fakeProvider,
      async addResource(input: { knowledgeBaseRemoteId?: string; sourceName?: string }) {
        if (input.knowledgeBaseRemoteId) {
          throw new Error(`Parent URI does not exist: ${input.knowledgeBaseRemoteId}`);
        }
        return {
          remoteId: `viking://resources/kb_upload/${input.sourceName}`,
          knowledgeBaseRemoteId: "viking://resources/kb_upload/",
          sourceName: input.sourceName || "upload.bin",
          sourceType: "upload",
          source: null,
          status: "processing" as const,
          lastError: null,
        };
      },
    };
    setKnowledgeUploadProviderForTesting(retryingProvider as any);
    await db.update(knowledgeBase).set({
      remoteId: "viking://resources/kb/legacy/docs/",
      updatedAt: new Date(),
    }).where(eq(knowledgeBase.id, "kb_upload"));

    const form = new FormData();
    form.append("files", new File(["# Retry"], "retry.md", { type: "text/markdown" }));

    const response = await testApp.request("/web/knowledge-bases/kb_upload/resources/upload", {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(201);
    const [kbRow] = await db.select().from(knowledgeBase).where(eq(knowledgeBase.id, "kb_upload"));
    expect(kbRow.remoteId).toBe("viking://resources/kb_upload/");
  });

  test("multipart upload retries failed files once after parallel pass", async () => {
    const attempts = new Map<string, number>();
    setKnowledgeUploadProviderForTesting({
      ...fakeProvider,
      async addResource(input: { sourceName?: string }) {
        const sourceName = input.sourceName || "upload.bin";
        const current = attempts.get(sourceName) ?? 0;
        attempts.set(sourceName, current + 1);
        if (sourceName === "retry.md" && current === 0) {
          throw new Error("Internal server error");
        }
        return {
          remoteId: `viking://resources/kb_upload/${sourceName}`,
          knowledgeBaseRemoteId: "viking://resources/kb_upload/",
          sourceName,
          sourceType: "upload",
          source: null,
          status: "processing" as const,
          lastError: null,
        };
      },
    } as any);

    const form = new FormData();
    form.append("files", new File(["# Retry"], "retry.md", { type: "text/markdown" }));
    form.append("files", new File(["# Stable"], "stable.md", { type: "text/markdown" }));

    const response = await testApp.request("/web/knowledge-bases/kb_upload/resources/upload", {
      method: "POST",
      body: form,
    });

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.items).toHaveLength(2);
    expect(attempts.get("retry.md")).toBe(2);
    expect(attempts.get("stable.md")).toBe(1);
    expect(body.items.find((item: any) => item.sourceName === "retry.md")?.status).toBe("processing");
  });

  test("re-uploading the same file reuses the existing resource row instead of creating duplicates", async () => {
    const form = new FormData();
    form.append("files", new File(["# Guide v1"], "guide.md", { type: "text/markdown" }));
    const firstResponse = await testApp.request("/web/knowledge-bases/kb_upload/resources/upload", {
      method: "POST",
      body: form,
    });
    expect(firstResponse.status).toBe(201);
    const firstBody = await firstResponse.json();
    const firstId = firstBody.items[0].id;

    const secondForm = new FormData();
    secondForm.append("files", new File(["# Guide v2"], "guide.md", { type: "text/markdown" }));
    const secondResponse = await testApp.request("/web/knowledge-bases/kb_upload/resources/upload", {
      method: "POST",
      body: secondForm,
    });
    expect(secondResponse.status).toBe(201);
    const secondBody = await secondResponse.json();
    expect(secondBody.items[0].id).toBe(firstId);

    const rows = await db.select().from(knowledgeResource).where(eq(knowledgeResource.knowledgeBaseId, "kb_upload"));
    expect(rows).toHaveLength(1);
  });
});
