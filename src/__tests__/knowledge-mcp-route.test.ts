import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  agentKnowledgeBinding,
  environment,
  knowledgeBase,
  knowledgeResource,
  user,
} from "../db/schema";
import knowledgeMcpRoutes from "../routes/mcp/knowledge";
import { setKnowledgeRuntimeProviderForTesting } from "../services/knowledge-runtime";

const app = new Hono();
app.route("/", knowledgeMcpRoutes);

const fakeProvider = {
  async createKnowledgeBase() {
    throw new Error("unused");
  },
  async addResource() {
    throw new Error("unused");
  },
  async listResources() {
    return [];
  },
  async search() {
    return [{
      title: "Workflow Proxy Guide",
      snippet: "Use /workflow-ui to access the proxy.",
      source: "kb://docs/workflow-proxy.md",
      score: 0.91,
      knowledgeBaseId: "remote-kb-1",
      resourceId: "remote-res-1",
    }];
  },
  async readResource() {
    return {
      resourceId: "remote-res-1",
      title: "Workflow Proxy Guide",
      content: "Detailed workflow proxy content",
      source: "kb://docs/workflow-proxy.md",
    };
  },
};

async function mcpRequest(secret: string | null, body: Record<string, unknown>) {
  return app.request("/mcp/knowledge", {
    method: "POST",
    headers: {
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "mcp-protocol-version": "2025-03-26",
      ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("knowledge MCP route", () => {
  beforeEach(async () => {
    setKnowledgeRuntimeProviderForTesting(fakeProvider as any);
    await db.delete(agentKnowledgeBinding);
    await db.delete(knowledgeResource);
    await db.delete(knowledgeBase);
    await db.delete(environment);
    await db.delete(user).where(inArray(user.id, ["kb-mcp-user", "kb-mcp-user-2"]));

    const now = new Date();
    await db.insert(user).values({
      id: "kb-mcp-user",
      name: "KB MCP User",
      email: "kb-mcp-user@test.local",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(user).values({
      id: "kb-mcp-user-2",
      name: "KB MCP User 2",
      email: "kb-mcp-user-2@test.local",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(environment).values({
      id: "env_kb_mcp",
      name: "env-kb-mcp",
      description: null,
      workspacePath: process.cwd(),
      agentName: "general",
      status: "idle",
      machineName: null,
      branch: null,
      gitRepoUrl: null,
      maxSessions: 1,
      workerType: "acp",
      capabilities: null,
      secret: "env_secret_kb_mcp",
      userId: "kb-mcp-user",
      autoStart: false,
      lastPollAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(knowledgeBase).values([
      {
        id: "kb_local_1",
        userId: "kb-mcp-user",
        name: "Docs",
        slug: "docs",
        description: null,
        provider: "openviking",
        remoteId: "remote-kb-1",
        status: "ready",
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "kb_local_2",
        userId: "kb-mcp-user",
        name: "Private",
        slug: "private",
        description: null,
        provider: "openviking",
        remoteId: "remote-kb-2",
        status: "ready",
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(knowledgeResource).values([
      {
        id: "res_local_1",
        knowledgeBaseId: "kb_local_1",
        sourceType: "upload",
        sourceName: "workflow-proxy.md",
        sourcePath: null,
        remoteId: "remote-res-1",
        status: "ready",
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "res_local_2",
        knowledgeBaseId: "kb_local_2",
        sourceType: "upload",
        sourceName: "private.md",
        sourcePath: null,
        remoteId: "remote-res-2",
        status: "ready",
        lastError: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(agentKnowledgeBinding).values({
      id: "bind_mcp_1",
      agentName: "general",
      knowledgeBaseId: "kb_local_1",
      priority: 0,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  test("kb_search returns bound results when token is valid", async () => {
    const response = await mcpRequest("env_secret_kb_mcp", {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "kb_search",
        arguments: {
          query: "workflow proxy",
          topK: 3,
        },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    const results = body.result?.structuredContent?.results;
    expect(results).toEqual([
      {
        title: "Workflow Proxy Guide",
        snippet: "Use /workflow-ui to access the proxy.",
        source: "kb://docs/workflow-proxy.md",
        score: 0.91,
        knowledgeBaseId: "kb_local_1",
        resourceId: "res_local_1",
      },
    ]);
  });

  test("kb_read rejects resources outside bound knowledge bases", async () => {
    const response = await mcpRequest("env_secret_kb_mcp", {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "kb_read",
        arguments: {
          resourceId: "res_local_2",
        },
      },
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.error?.message ?? body.result?.content?.[0]?.text).toContain("not bound");
  });

  test("missing bearer token returns 401", async () => {
    const response = await mcpRequest(null, {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/list",
      params: {},
    });

    expect(response.status).toBe(401);
  });
});
