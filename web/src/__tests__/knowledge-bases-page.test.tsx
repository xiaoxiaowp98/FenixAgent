import { describe, expect, mock, test } from "bun:test";
import {
  loadKnowledgeBaseDetailData,
  loadKnowledgeBasesData,
  summarizeKnowledgeDetail,
  uploadKnowledgeBaseFiles,
} from "../pages/KnowledgeBasesPage";

describe("KnowledgeBasesPage helpers", () => {
  test("首次加载调用 apiListKnowledgeBases 并返回知识库名称", async () => {
    const apiListKnowledgeBases = mock(async () => ([
      {
        id: "kb_1",
        name: "项目文档",
        slug: "project-docs",
        description: null,
        provider: "openviking",
        remoteId: "remote-1",
        status: "ready",
        lastError: null,
        bindingsCount: 2,
        resourcesCount: 3,
        createdAt: 1,
        updatedAt: 2,
      },
    ]));

    const result = await loadKnowledgeBasesData(apiListKnowledgeBases as any);
    expect(apiListKnowledgeBases).toHaveBeenCalledTimes(1);
    expect(result[0].name).toBe("项目文档");
  });

  test("选中知识库后可组合 lastError 与 resources 详情", async () => {
    const apiGetKnowledgeBase = mock(async () => ({
      id: "kb_1",
      name: "项目文档",
      slug: "project-docs",
      description: "docs",
      provider: "openviking",
      remoteId: "remote-1",
      status: "error",
      lastError: "索引失败",
      bindingsCount: 1,
      resourcesCount: 2,
      recentResources: [],
      createdAt: 1,
      updatedAt: 2,
    }));
    const apiListKnowledgeResources = mock(async () => ([
      {
        id: "res_1",
        knowledgeBaseId: "kb_1",
        sourceName: "spec.md",
        sourceType: "upload",
        sourcePath: "/tmp/spec.md",
        remoteId: "remote-res-1",
        status: "error",
        lastError: "索引失败",
        createdAt: 1,
        updatedAt: 2,
      },
    ]));

    const data = await loadKnowledgeBaseDetailData(
      "kb_1",
      apiGetKnowledgeBase as any,
      apiListKnowledgeResources as any,
    );
    expect(data.detail.lastError).toBe("索引失败");
    expect(data.resources[0].sourceName).toBe("spec.md");
    expect(summarizeKnowledgeDetail(data.detail, data.resources)).toEqual({
      lastError: "索引失败",
      resourcesCount: 1,
      resourceNames: ["spec.md"],
    });
  });

  test("选择文件上传后调用 apiUploadKnowledgeResources", async () => {
    const apiUploadKnowledgeResources = mock(async (_id: string, formData: FormData) => ({
      items: formData.getAll("files").map((file, index) => ({
        id: `res_${index}`,
        knowledgeBaseId: "kb_1",
        sourceName: (file as File).name,
        sourceType: "upload",
        sourcePath: null,
        remoteId: null,
        status: "processing",
        lastError: null,
        createdAt: 1,
        updatedAt: 1,
      })),
    }));

    const files = [
      new File(["a"], "a.md", { type: "text/markdown" }),
      new File(["b"], "b.md", { type: "text/markdown" }),
    ];
    const result = await uploadKnowledgeBaseFiles("kb_1", files, apiUploadKnowledgeResources as any);
    expect(apiUploadKnowledgeResources).toHaveBeenCalledTimes(1);
    expect(result.items.map((item) => item.sourceName)).toEqual(["a.md", "b.md"]);
  });
});
