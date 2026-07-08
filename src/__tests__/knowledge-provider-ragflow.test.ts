// src/__tests__/knowledge-provider-ragflow.test.ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { resetConfig, setConfig } from "../config";
import { checkRagFlowHealth, RagFlowKnowledgeProvider } from "../services/knowledge-provider/ragflow";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
  setConfig({
    ragflowApiUrl: "http://ragflow.test",
    ragflowApiKey: "test-api-key",
    ragflowRequestTimeoutMs: 30000,
  });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetConfig();
});

describe("RagFlowKnowledgeProvider", () => {
  test("createKnowledgeBase 在未配置 API key 时抛出明确错误", async () => {
    setConfig({ ragflowApiKey: "" });
    const fetchSpy = mock(async () => ({
      ok: true,
      text: async () => JSON.stringify({ code: 0, data: { id: "unused" } }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await expect(
      provider.createKnowledgeBase({
        organizationId: "org1",
        userId: "user1",
        slug: "test-kb",
        name: "Test KB",
      }),
    ).rejects.toThrow("RAGFLOW_API_KEY is not configured");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test("createKnowledgeBase 使用 organizationId 作为 RagFlow dataset 名前缀", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ code: 0, data: { id: "ds_abc123", name: "[org_org1] Test KB" } }),
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const result = await provider.createKnowledgeBase({
      organizationId: "org1",
      userId: "user1",
      slug: "test-kb",
      name: "Test KB",
      description: "A test knowledge base",
    });

    expect(result.remoteId).toBe("ds_abc123");
    expect(result.name).toBe("Test KB");
    expect(result.status).toBe("empty");
  });

  test("createKnowledgeBase 指定 embeddingModel/chunkMethod 时透传给 RagFlow", async () => {
    const fetchSpy = mock(async () => ({
      ok: true,
      text: async () => JSON.stringify({ code: 0, data: { id: "ds_cfg" } }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await provider.createKnowledgeBase({
      organizationId: "org1",
      userId: "user1",
      slug: "test-kb",
      name: "Test KB",
      embeddingModel: "BAAI/bge-large-zh-v1.5@BAAI",
      chunkMethod: "naive",
    });

    const init = (fetchSpy as ReturnType<typeof mock>).mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.embedding_model).toBe("BAAI/bge-large-zh-v1.5@BAAI");
    expect(body.chunk_method).toBe("naive");
  });

  test("createKnowledgeBase 未指定 embeddingModel/chunkMethod 时不传对应字段（兼容旧行为）", async () => {
    const fetchSpy = mock(async () => ({
      ok: true,
      text: async () => JSON.stringify({ code: 0, data: { id: "ds_plain" } }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await provider.createKnowledgeBase({
      organizationId: "org1",
      userId: "user1",
      slug: "test-kb",
      name: "Test KB",
    });

    const body = JSON.parse((fetchSpy as ReturnType<typeof mock>).mock.calls[0][1].body as string);
    expect(body.embedding_model).toBeUndefined();
    expect(body.chunk_method).toBeUndefined();
  });

  test("listEmbeddingModels v0.26 格式: 三段式 name@instance@provider", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: [
            {
              name: "text-embedding-v3",
              instance_name: "qwen",
              provider_name: "Tongyi-Qianwen",
              model_type: ["embedding"],
            },
            { name: "gpt-4o", instance_name: "openai", provider_name: "OpenAI", model_type: ["chat"] },
            {
              name: "text-embedding-v4",
              instance_name: "qwen2",
              provider_name: "Tongyi-Qianwen",
              model_type: ["embedding"],
            },
          ],
        }),
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const models = await provider.listEmbeddingModels();

    expect(models).toHaveLength(2);
    expect(models[0].name).toBe("text-embedding-v3@qwen@Tongyi-Qianwen");
    expect(models[0].label).toBe("qwen › text-embedding-v3");
    expect(models[0].provider).toBe("Tongyi-Qianwen");
    expect(models[0].instance).toBe("qwen");
    expect(models[1].name).toBe("text-embedding-v4@qwen2@Tongyi-Qianwen");
  });

  test("listEmbeddingModels 旧版格式兼容: llm_name + name", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          code: 0,
          data: [
            { llm_name: "bge-large-zh", name: "BAAI", model_type: "embedding" },
            { llm_name: "gpt-4o", name: "OpenAI", model_type: "chat" },
          ],
        }),
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const models = await provider.listEmbeddingModels();

    expect(models).toHaveLength(1);
    expect(models[0].name).toBe("bge-large-zh@BAAI");
    expect(models[0].label).toBe("BAAI · bge-large-zh");
    expect(models[0].provider).toBe("BAAI");
    expect(models[0].instance).toBe("");
  });

  test("listEmbeddingModels 上游失败时返回空数组（不阻断表单）", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const models = await provider.listEmbeddingModels();
    expect(models).toEqual([]);
  });

  test("listPipelines 端点不可用时返回空数组（best-effort）", async () => {
    globalThis.fetch = mock(async () => ({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ code: 404, message: "Not Found" }),
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const pipelines = await provider.listPipelines();
    expect(pipelines).toEqual([]);
  });

  test("deleteKnowledgeBase 调用 DELETE /api/v1/datasets/{id} 删除整个 dataset", async () => {
    const fetchSpy = mock(async () => ({
      ok: true,
      json: async () => ({ code: 0 }),
      text: async () => JSON.stringify({ code: 0 }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await provider.deleteKnowledgeBase({
      knowledgeBaseRemoteId: "ds_abc123",
      remoteAccountId: "user1",
      remoteUserId: "user1",
    });

    const url = (fetchSpy as ReturnType<typeof mock>).mock.calls[0][0] as string;
    expect(url).toContain("/api/v1/datasets/ds_abc123");
  });

  test("deleteKnowledgeBase 遇到旧路径 405 时回退到集合端点删除 dataset", async () => {
    const fetchSpy = mock(async (_url: string, init?: RequestInit) => {
      if (init?.body) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ code: 0 }),
        };
      }
      return {
        ok: false,
        status: 405,
        text: async () => JSON.stringify({ code: 100, message: "<MethodNotAllowed '405: Method Not Allowed'>" }),
      };
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await provider.deleteKnowledgeBase({
      knowledgeBaseRemoteId: "ds_abc123",
      remoteAccountId: "user1",
      remoteUserId: "user1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const fallbackUrl = (fetchSpy as ReturnType<typeof mock>).mock.calls[1][0] as string;
    const fallbackInit = (fetchSpy as ReturnType<typeof mock>).mock.calls[1][1] as RequestInit;
    expect(fallbackUrl).toBe("http://ragflow.test/api/v1/datasets");
    expect(fallbackInit.method).toBe("DELETE");
    expect(JSON.parse(fallbackInit.body as string)).toEqual({ ids: ["ds_abc123"] });
  });

  test("deleteKnowledgeBase 接受 204 空响应作为删除成功", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      status: 204,
      text: async () => "",
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await expect(
      provider.deleteKnowledgeBase({
        knowledgeBaseRemoteId: "ds_abc123",
        remoteAccountId: "user1",
        remoteUserId: "user1",
      }),
    ).resolves.toBeUndefined();
  });

  test("deleteKnowledgeBase API 返回非 0 code 时抛出异常", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      text: async () => JSON.stringify({ code: 102, message: "Dataset not found" }),
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await expect(
      provider.deleteKnowledgeBase({
        knowledgeBaseRemoteId: "ds_nonexistent",
        remoteAccountId: "user1",
        remoteUserId: "user1",
      }),
    ).rejects.toThrow("102");
  });

  test("addResource 上传文件并触发异步重解析，立即返回 processing", async () => {
    // 新流程：上传 → ingest 触发重解析 → 立即返回（不轮询）
    const fetchSpy = mock(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("/ingest")) {
        return { ok: true, json: async () => ({ code: 0 }) };
      }
      return { ok: true, json: async () => ({ code: 0, data: [{ id: "doc_xyz" }] }) };
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const result = await provider.addResource({
      knowledgeBaseRemoteId: "ds_abc123",
      remoteAccountId: "user1",
      remoteUserId: "user1",
      filePath: "/tmp/test.pdf",
      sourceName: "test.pdf",
    });

    expect(result.remoteId).toBe("doc_xyz");
    expect(result.status).toBe("processing"); // 立即返回，不 waiting
    expect(result.knowledgeBaseRemoteId).toBe("ds_abc123");
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 上传 + ingest
  });

  test("addResource 上传响应 data 数组为空时抛出异常", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ code: 0, data: [] }),
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await expect(
      provider.addResource({
        knowledgeBaseRemoteId: "ds_abc123",
        remoteAccountId: "user1",
        remoteUserId: "user1",
        filePath: "/tmp/test.pdf",
        sourceName: "test.pdf",
      }),
    ).rejects.toThrow("unexpected response");
  });

  test("addResource 上传 API 返回业务错误 code 时抛出异常", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ code: 102, message: "Duplicate file" }),
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await expect(
      provider.addResource({
        knowledgeBaseRemoteId: "ds_abc123",
        remoteAccountId: "user1",
        remoteUserId: "user1",
        filePath: "/tmp/test.pdf",
        sourceName: "test.pdf",
      }),
    ).rejects.toThrow("Duplicate file");
  });

  test("addResource 上传后触发 ingest 重解析（wait 参数已无效，统一异步）", async () => {
    const fetchSpy = mock(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes("/ingest")) {
        return { ok: true, json: async () => ({ code: 0 }) };
      }
      return { ok: true, json: async () => ({ code: 0, data: [{ id: "doc_abc" }] }) };
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const result = await provider.addResource({
      knowledgeBaseRemoteId: "ds_abc123",
      remoteAccountId: "user1",
      remoteUserId: "user1",
      filePath: "/tmp/test.pdf",
      sourceName: "test.pdf",
    });

    expect(result.status).toBe("processing");
    expect(result.remoteId).toBe("doc_abc");
    expect(fetchSpy).toHaveBeenCalledTimes(2); // 上传 + ingest
  });

  test("addResource ingest 触发重解析失败时抛出异常", async () => {
    const fetchSpy = mock(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/ingest")) {
        return { ok: true, json: async () => ({ code: 102, message: "Ingest service unavailable" }) };
      }
      return { ok: true, json: async () => ({ code: 0, data: [{ id: "doc_fail" }] }) };
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await expect(
      provider.addResource({
        knowledgeBaseRemoteId: "ds_abc123",
        remoteAccountId: "user1",
        remoteUserId: "user1",
        filePath: "/tmp/bad.pdf",
        sourceName: "bad.pdf",
      }),
    ).rejects.toThrow("Ingest service unavailable");
  });

  test("listResources 正确映射 RagFlow run 到接口状态", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          total: 4,
          docs: [
            { id: "d1", name: "doc1.pdf", run: "UNSTART" },
            { id: "d2", name: "doc2.pdf", run: "RUNNING" },
            { id: "d3", name: "doc3.pdf", run: "DONE" },
            { id: "d4", name: "doc4.pdf", run: "FAIL", progress_msg: "error" },
          ],
        },
      }),
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const results = await provider.listResources({
      knowledgeBaseRemoteId: "ds_abc123",
      remoteAccountId: "user1",
      remoteUserId: "user1",
    });

    expect(results).toHaveLength(4);
    expect(results[0].status).toBe("pending");
    expect(results[1].status).toBe("processing");
    expect(results[2].status).toBe("ready");
    expect(results[3].status).toBe("error");
    expect(results[3].lastError).toBe("error");
  });

  test("listResources 分页遍历所有文档", async () => {
    const fetchSpy = mock()
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            total: 120,
            docs: Array.from({ length: 50 }, (_, i) => ({
              id: `doc_${i}`,
              name: `f${i}.pdf`,
              run: "DONE",
            })),
          },
        }),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            total: 120,
            docs: Array.from({ length: 50 }, (_, i) => ({
              id: `doc_${i + 50}`,
              name: `f${i + 50}.pdf`,
              run: "DONE",
            })),
          },
        }),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            total: 120,
            docs: Array.from({ length: 20 }, (_, i) => ({
              id: `doc_${i + 100}`,
              name: `f${i + 100}.pdf`,
              run: "DONE",
            })),
          },
        }),
      }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const results = await provider.listResources({
      knowledgeBaseRemoteId: "ds_abc123",
      remoteAccountId: "user1",
      remoteUserId: "user1",
    });

    expect(results).toHaveLength(120);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  test("deleteResource 传 knowledgeBaseRemoteId 拼接正确的 API 路径", async () => {
    const fetchSpy = mock(async () => ({
      ok: true,
      json: async () => ({ code: 0 }),
      text: async () => JSON.stringify({ code: 0 }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await provider.deleteResource({
      resourceRemoteId: "doc_xyz",
      knowledgeBaseRemoteId: "ds_abc123",
      remoteAccountId: "user1",
      remoteUserId: "user1",
    });

    const url = (fetchSpy as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(url).toContain("/api/v1/datasets/ds_abc123/documents/doc_xyz");
  });

  test("deleteResource 遇到旧路径 405 时回退到集合端点删除 document", async () => {
    const fetchSpy = mock(async (_url: string, init?: RequestInit) => {
      if (init?.body) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ code: 0 }),
        };
      }
      return {
        ok: false,
        status: 405,
        text: async () => JSON.stringify({ code: 100, message: "<MethodNotAllowed '405: Method Not Allowed'>" }),
      };
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    await provider.deleteResource({
      resourceRemoteId: "doc_xyz",
      knowledgeBaseRemoteId: "ds_abc123",
      remoteAccountId: "user1",
      remoteUserId: "user1",
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const fallbackUrl = (fetchSpy as ReturnType<typeof mock>).mock.calls[1][0] as string;
    const fallbackInit = (fetchSpy as ReturnType<typeof mock>).mock.calls[1][1] as RequestInit;
    expect(fallbackUrl).toBe("http://ragflow.test/api/v1/datasets/ds_abc123/documents");
    expect(fallbackInit.method).toBe("DELETE");
    expect(JSON.parse(fallbackInit.body as string)).toEqual({ ids: ["doc_xyz"] });
  });

  test("search 结果中 resourceId 使用 document_id（非 chunk_id）", async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          chunks: [
            {
              content: "snippet text",
              document_name: "test.pdf",
              document_id: "doc_xyz",
              dataset_id: "ds_abc123",
              similarity: 0.95,
              chunk_id: "chk_999",
            },
          ],
        },
      }),
    })) as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const results = await provider.search({
      knowledgeBases: [{ remoteId: "ds_abc123", remoteAccountId: "u1", remoteUserId: "u1" }],
      query: "test query",
      topK: 5,
    });

    expect(results).toHaveLength(1);
    expect(results[0].resourceId).toBe("doc_xyz");
    expect(results[0].knowledgeBaseId).toBe("ds_abc123");
    expect(results[0].resourceId).not.toBe("chk_999");
  });

  test("readResource 传 knowledgeBaseRemoteId 拼接正确的 API 路径并拼接 chunk 内容", async () => {
    const fetchSpy = mock(async () => ({
      ok: true,
      json: async () => ({
        code: 0,
        data: {
          doc: { name: "test.pdf" },
          chunks: [{ content: "first chunk" }, { content: "second chunk" }],
        },
      }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const provider = new RagFlowKnowledgeProvider();
    const result = await provider.readResource({
      resourceRemoteId: "doc_xyz",
      knowledgeBaseRemoteId: "ds_abc123",
      remoteAccountId: "user1",
      remoteUserId: "user1",
    });

    const url = (fetchSpy as unknown as { mock: { calls: string[][] } }).mock.calls[0][0];
    expect(url).toContain("/api/v1/datasets/ds_abc123/documents/doc_xyz/chunks");
    expect(result.content).toBe("first chunk\n\nsecond chunk");
    expect(result.title).toBe("test.pdf");
  });

  test("checkRagFlowHealth 使用 system healthz 端点且不携带 Authorization", async () => {
    const fetchSpy = mock(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    }));
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await checkRagFlowHealth();

    expect(result.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe("http://ragflow.test/api/v1/system/healthz");
    expect(((fetchSpy as ReturnType<typeof mock>).mock.calls[0]?.[1] as RequestInit | undefined)?.headers).toEqual({
      "Content-Type": "application/json",
    });
  });
});
