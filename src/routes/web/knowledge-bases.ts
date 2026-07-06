import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import Elysia from "elysia";
import * as z from "zod/v4";
import { authGuardPlugin } from "../../plugins/auth";
import { knowledgeResourceRepo } from "../../repositories/knowledge-base";
import { WebErrSchema, WebOkSchema } from "../../schemas/common.schema";
import {
  CreateKnowledgeBaseRequestSchema,
  ImportKnowledgeUrlRequestSchema,
  ImportKnowledgeUrlResponseSchema,
  KnowledgeBaseDetailResponseSchema,
  KnowledgeBaseInfoSchema,
  KnowledgeBaseListResponseSchema,
  KnowledgeResourceItemSchema,
  KnowledgeResourceListResponseSchema,
  UpdateKnowledgeBaseRequestSchema,
  UploadKnowledgeResourcesResponseSchema,
} from "../../schemas/knowledge.schema";
import {
  createKnowledgeBaseRecord,
  deleteKnowledgeBase,
  getKnowledgeBaseDetail,
  listKnowledgeBasesByTeamId,
  updateKnowledgeBase,
} from "../../services/knowledge-base";
import {
  deleteKnowledgeResource,
  importKnowledgeResourceFromUrl,
  listKnowledgeResources,
  uploadKnowledgeResource,
} from "../../services/knowledge-upload";

/** 文件扩展名 → MIME 类型映射，用于资源文件预览时设置正确的 Content-Type */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".jsx": "text/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".yaml": "text/plain",
  ".yml": "text/plain",
  ".py": "text/plain",
  ".go": "text/plain",
  ".rs": "text/plain",
  ".sh": "text/plain",
  ".bash": "text/plain",
  ".sql": "text/plain",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

/** 可转换为 PDF 的 Office 文件扩展名 */
const OFFICE_EXTENSIONS = new Set([".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"]);

/** Gotenberg 服务地址（Docker: docker run -d -p 3000:3000 gotenberg/gotenberg:8） */
const GOTENBERG_URL = process.env.GOTENBERG_URL || "http://127.0.0.1:3200";

/** PDF 转换缓存目录 */
const PDF_CACHE_DIR = join(process.cwd(), "data/knowledge-pdf-cache");

/**
 * 将 Office 文件转换为 PDF 并返回 PDF 文件路径。
 * 优先级：Gotenberg (Docker HTTP API) → LibreOffice CLI → null。
 * 结果缓存在 PDF_CACHE_DIR 中，转换失败时返回 null。
 */
async function convertToPdf(sourcePath: string, sourceName: string, resourceId: string): Promise<string | null> {
  await mkdir(PDF_CACHE_DIR, { recursive: true });
  const outputPdf = join(PDF_CACHE_DIR, `${resourceId}.pdf`);

  // 缓存命中：PDF 已存在且比源文件新
  if (existsSync(outputPdf)) {
    try {
      const [pdfStat, srcStat] = await Promise.all([stat(outputPdf), stat(sourcePath)]);
      if (pdfStat.mtime >= srcStat.mtime) {
        return outputPdf;
      }
    } catch {
      // 状态检查失败，重新转换
    }
  }

  // — 方式 1：Gotenberg Docker 服务 —
  try {
    const fileBuffer = await import("node:fs/promises").then((m) => m.readFile(sourcePath));
    const formData = new FormData();
    formData.append("files", new Blob([fileBuffer]), sourceName);

    const resp = await fetch(`${GOTENBERG_URL}/forms/libreoffice/convert`, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(60000),
    });

    if (resp.ok) {
      const pdfBuffer = Buffer.from(await resp.arrayBuffer());
      await writeFile(outputPdf, pdfBuffer);
      return outputPdf;
    }
    console.warn("Gotenberg conversion returned non-OK", { status: resp.status, sourceName });
  } catch (err) {
    console.warn("Gotenberg not available, trying LibreOffice CLI", { sourceName });
  }

  // — 方式 2：LibreOffice CLI 本地命令 —
  for (const cmd of ["libreoffice", "soffice"]) {
    try {
      await new Promise<void>((resolve, reject) => {
        execFile(
          cmd,
          ["--headless", "--convert-to", "pdf", "--outdir", PDF_CACHE_DIR, sourcePath],
          { timeout: 60000 },
          (err) => {
            if (err) reject(err);
            else resolve();
          },
        );
      });

      // LibreOffice 生成的 PDF 文件名基于源文件名，需要重命名为缓存 key
      const generatedName = sourceName.replace(extname(sourceName), ".pdf");
      const generatedPath = join(PDF_CACHE_DIR, generatedName);
      if (existsSync(generatedPath) && generatedPath !== outputPdf) {
        const { rename } = await import("node:fs/promises");
        await rename(generatedPath, outputPdf);
      }

      if (existsSync(outputPdf)) {
        return outputPdf;
      }
    } catch {
      // 当前命令不可用，尝试下一个
    }
  }

  console.warn("All PDF conversion methods unavailable", { sourceName, resourceId });
  return null;
}

const app = new Elysia({ name: "web-knowledge-bases" }).use(authGuardPlugin).model({
  "knowledge-base-info": KnowledgeBaseInfoSchema,
  "knowledge-base-detail": KnowledgeBaseDetailResponseSchema,
  "knowledge-base-list": KnowledgeBaseListResponseSchema,
  "knowledge-resource-item": KnowledgeResourceItemSchema,
  "knowledge-resource-list": KnowledgeResourceListResponseSchema,
  "create-knowledge-base-request": CreateKnowledgeBaseRequestSchema,
  "update-knowledge-base-request": UpdateKnowledgeBaseRequestSchema,
  "import-knowledge-url-request": ImportKnowledgeUrlRequestSchema,
  "upload-knowledge-resources-response": UploadKnowledgeResourcesResponseSchema,
  "import-knowledge-url-response": ImportKnowledgeUrlResponseSchema,
  "delete-knowledge-base-response": WebOkSchema(z.null()).describe("删除知识库后的成功响应。"),
  "delete-knowledge-resource-response": WebOkSchema(z.null()).describe("删除知识资源后的成功响应。"),
});

app.get(
  "/knowledgeBases",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia type inference limitation with sessionAuth
  async ({ store }: any) => {
    const authCtx = store.authContext!;
    return { success: true as const, data: await listKnowledgeBasesByTeamId(authCtx.organizationId) };
  },
  {
    sessionAuth: true,
    response: "knowledge-base-list",
    detail: {
      tags: ["Knowledge"],
      summary: "获取知识库列表",
      description: "返回当前组织下的知识库列表及其资源统计信息。",
    },
  },
);

app.post(
  "/knowledgeBases",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia type inference limitation with sessionAuth + body model
  async ({ store, body, error }: any) => {
    const authCtx = store.authContext!;
    const payload = body as { name: string; slug?: string; description?: string };
    try {
      const result = await createKnowledgeBaseRecord(
        authCtx.organizationId,
        {
          name: payload.name,
          slug: payload.slug,
          description: payload.description,
        },
        authCtx.userId,
      );
      if (!result.success) {
        return error(400, { success: false, error: { code: result.error.code, message: result.error.message } });
      }
      return { success: true as const, data: result.data };
    } catch (err) {
      console.error(err);
      return error(502, {
        success: false,
        error: {
          code: "KNOWLEDGE_PROVIDER_ERROR",
          message: err instanceof Error ? err.message : "知识库上游服务异常",
        },
      });
    }
  },
  {
    sessionAuth: true,
    body: "create-knowledge-base-request",
    response: {
      200: WebOkSchema(KnowledgeBaseInfoSchema),
      400: WebErrSchema,
      502: WebErrSchema,
    },
    detail: {
      tags: ["Knowledge"],
      summary: "创建知识库",
      description: "创建一个新的知识库记录，并初始化远端知识库信息。",
    },
  },
);

app.get(
  "/knowledgeBases/:id",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia type inference limitation with sessionAuth
  async ({ store, params, error }: any) => {
    const authCtx = store.authContext!;
    const id = params.id;
    const detail = await getKnowledgeBaseDetail(authCtx.organizationId, id);
    if (!detail) {
      return error(404, { success: false, error: { code: "NOT_FOUND", message: "知识库不存在" } });
    }
    return { success: true as const, data: detail };
  },
  {
    sessionAuth: true,
    response: {
      200: "knowledge-base-detail",
      404: WebErrSchema,
    },
    detail: {
      tags: ["Knowledge"],
      summary: "获取知识库详情",
      description: "根据知识库 ID 返回知识库详情及最近的资源列表。",
    },
  },
);

app.patch(
  "/knowledgeBases/:id",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia type inference limitation with sessionAuth + body model
  async ({ store, params, body, error }: any) => {
    const authCtx = store.authContext!;
    const id = params.id;
    const payload = body as { name?: string; slug?: string; description?: string };
    const result = await updateKnowledgeBase(authCtx.organizationId, id, {
      name: payload.name,
      slug: payload.slug,
      description: payload.description,
    });
    if (!result.success) {
      const status = result.error.code === "NOT_FOUND" ? 404 : 400;
      return error(status, { success: false, error: { code: result.error.code, message: result.error.message } });
    }
    return { success: true as const, data: result.data };
  },
  {
    sessionAuth: true,
    body: "update-knowledge-base-request",
    response: {
      200: WebOkSchema(KnowledgeBaseInfoSchema),
      400: WebErrSchema,
      404: WebErrSchema,
    },
    detail: {
      tags: ["Knowledge"],
      summary: "更新知识库",
      description: "更新知识库名称、slug 或描述信息。",
    },
  },
);

app.delete(
  "/knowledgeBases/:id",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia type inference limitation with sessionAuth
  async ({ store, params, error }: any) => {
    const authCtx = store.authContext!;
    const id = params.id;
    try {
      const result = await deleteKnowledgeBase(authCtx.organizationId, id);
      if (!result.success) {
        return error(404, { success: false, error: { code: "NOT_FOUND", message: result.error.message } });
      }
      return { success: true as const, data: null };
    } catch (err) {
      console.error(err);
      return error(400, {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: err instanceof Error ? err.message : "删除知识库失败",
        },
      });
    }
  },
  {
    sessionAuth: true,
    response: {
      200: "delete-knowledge-base-response",
      400: WebErrSchema,
      404: WebErrSchema,
    },
    detail: {
      tags: ["Knowledge"],
      summary: "删除知识库",
      description: "删除指定知识库及其关联资源绑定。",
    },
  },
);

app.post(
  "/knowledgeBases/:id/resources/upload",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia 在 multipart/response 组合下类型推断不稳定
  async ({ store, params, request, error }: any) => {
    const authCtx = store.authContext!;
    const id = params.id;
    try {
      const form = await request.formData();
      const files = Array.from(form.getAll("files")).filter(
        (entry: unknown): entry is globalThis.File => entry instanceof globalThis.File,
      );
      const items = await Promise.all(
        files.map((file) => uploadKnowledgeResource(authCtx.organizationId, id, file as unknown as File)),
      );

      for (let index = 0; index < items.length; index += 1) {
        if (items[index]?.status !== "error") {
          continue;
        }
        await deleteKnowledgeResource(authCtx.organizationId, id, items[index]!.id);
        items[index] = await uploadKnowledgeResource(authCtx.organizationId, id, files[index]! as unknown as File);
      }

      const failedItem = items.find((item) => item.status === "error");
      if (failedItem) {
        throw new Error(failedItem.lastError || `${failedItem.sourceName} 上传失败`);
      }
      return { success: true as const, data: { items } };
    } catch (err) {
      console.error(err);
      const message = (err as Error).message;
      const status = message.includes("不存在") ? 404 : 400;
      return error(status, {
        success: false,
        error: { code: status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message },
      });
    }
  },
  {
    sessionAuth: true,
    response: {
      200: "upload-knowledge-resources-response",
      400: WebErrSchema,
      404: WebErrSchema,
    },
    detail: {
      tags: ["Knowledge"],
      summary: "上传知识资源",
      description: "向指定知识库上传一个或多个文件资源，并返回本次处理后的资源列表。",
    },
  },
);

app.post(
  "/knowledgeBases/:id/resources/url",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia type inference limitation with sessionAuth + body model
  async ({ store, params, body, error }: any) => {
    const authCtx = store.authContext!;
    const id = params.id;
    const payload = body as { url: string; sourceName?: string };
    if (!payload.url || typeof payload.url !== "string") {
      return error(400, { success: false, error: { code: "VALIDATION_ERROR", message: "url 为必填字段" } });
    }
    try {
      const item = await importKnowledgeResourceFromUrl(authCtx.organizationId, id, {
        url: payload.url,
        sourceName: payload.sourceName,
      });
      const status = item.status === "error" ? 502 : 201;
      if (status >= 400) return error(status, item);
      return { success: true as const, data: item };
    } catch (err) {
      console.error(err);
      const message = (err as Error).message;
      const status = message.includes("不存在") ? 404 : 400;
      return error(status, {
        success: false,
        error: { code: status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message },
      });
    }
  },
  {
    sessionAuth: true,
    body: "import-knowledge-url-request",
    response: {
      200: "import-knowledge-url-response",
      201: "import-knowledge-url-response",
      400: WebErrSchema,
      404: WebErrSchema,
    },
    detail: {
      tags: ["Knowledge"],
      summary: "通过 URL 导入资源",
      description: "从指定 URL 拉取内容并导入到知识库，返回创建后的资源记录。",
    },
  },
);

app.get(
  "/knowledgeBases/:id/resources",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia type inference limitation with sessionAuth
  async ({ store, params, error }: any) => {
    const authCtx = store.authContext!;
    const id = params.id;
    const items = await listKnowledgeResources(authCtx.organizationId, id);
    if (!items) {
      return error(404, { success: false, error: { code: "NOT_FOUND", message: "知识库不存在" } });
    }
    return { success: true as const, data: items };
  },
  {
    sessionAuth: true,
    response: {
      200: "knowledge-resource-list",
      404: WebErrSchema,
    },
    detail: {
      tags: ["Knowledge"],
      summary: "获取知识资源列表",
      description: "返回指定知识库下的全部知识资源记录。",
    },
  },
);

app.get(
  "/knowledgeBases/:id/resources/:resourceId/file",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia type inference limitation with sessionAuth
  async ({ store, params, error }: any) => {
    const authCtx = store.authContext!;
    const resourceId = params.resourceId;
    const kbId = params.id;

    // 查找资源记录
    const resource = await knowledgeResourceRepo.getById(resourceId);
    if (!resource || resource.knowledgeBaseId !== kbId) {
      return error(404, { success: false, error: { code: "NOT_FOUND", message: "资源不存在" } });
    }

    // 仅 upload 类型的资源有本地文件可预览
    if (resource.sourceType !== "upload" || !resource.sourcePath) {
      return error(400, { success: false, error: { code: "NO_LOCAL_FILE", message: "该资源没有可预览的本地文件" } });
    }

    try {
      // 验证本地文件是否存在
      const fileInfo = await stat(resource.sourcePath);
      if (!fileInfo.isFile()) {
        return error(404, { success: false, error: { code: "FILE_NOT_FOUND", message: "源文件不存在" } });
      }

      // 根据扩展名确定 MIME 类型
      const ext = extname(resource.sourceName).toLowerCase();
      const mimeType = MIME_TYPES[ext] || "application/octet-stream";

      // 使用 Bun.file 流式返回文件，设置内联预览头
      const file = Bun.file(resource.sourcePath);
      return new Response(file.stream(), {
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(fileInfo.size),
          "Content-Disposition": `inline; filename="${encodeURIComponent(resource.sourceName)}"`,
        },
      });
    } catch (err) {
      console.error("Failed to serve knowledge resource file", err);
      return error(404, { success: false, error: { code: "FILE_NOT_FOUND", message: "源文件不存在或无法读取" } });
    }
  },
  {
    sessionAuth: true,
    detail: {
      tags: ["Knowledge"],
      summary: "获取知识资源文件",
      description: "返回知识资源的源文件内容，用于前端预览（PDF、图片、Markdown 等）。仅 upload 类型资源支持。",
    },
  },
);

app.get(
  "/knowledgeBases/:id/resources/:resourceId/pdf",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia type inference limitation with sessionAuth
  async ({ store, params, error }: any) => {
    const authCtx = store.authContext!;
    const resourceId = params.resourceId;
    const kbId = params.id;

    // 查找资源记录
    const resource = await knowledgeResourceRepo.getById(resourceId);
    if (!resource || resource.knowledgeBaseId !== kbId) {
      return error(404, { success: false, error: { code: "NOT_FOUND", message: "资源不存在" } });
    }

    // 仅 upload 类型的资源有本地文件
    if (resource.sourceType !== "upload" || !resource.sourcePath) {
      return error(400, { success: false, error: { code: "NO_LOCAL_FILE", message: "该资源没有本地文件" } });
    }

    // 检查是否为 Office 文件
    const ext = extname(resource.sourceName).toLowerCase();
    if (!OFFICE_EXTENSIONS.has(ext)) {
      return error(400, {
        success: false,
        error: { code: "NOT_OFFICE_FILE", message: "该资源不是 Office 文档，无需转换" },
      });
    }

    try {
      // 验证源文件存在
      const srcStat = await stat(resource.sourcePath);
      if (!srcStat.isFile()) {
        return error(404, { success: false, error: { code: "FILE_NOT_FOUND", message: "源文件不存在" } });
      }

      // 转换为 PDF
      const pdfPath = await convertToPdf(resource.sourcePath, resource.sourceName, resourceId);
      if (!pdfPath) {
        return error(501, {
          success: false,
          error: {
            code: "CONVERSION_UNAVAILABLE",
            message: "PDF 转换服务不可用（需要 LibreOffice），请下载后本地查看",
          },
        });
      }

      const pdfStat = await stat(pdfPath);
      const file = Bun.file(pdfPath);
      return new Response(file.stream(), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Length": String(pdfStat.size),
          "Content-Disposition": `inline; filename="${encodeURIComponent(resource.sourceName.replace(ext, ".pdf"))}"`,
        },
      });
    } catch (err) {
      console.error("Failed to convert Office file to PDF", err);
      return error(500, { success: false, error: { code: "CONVERSION_ERROR", message: "PDF 转换失败" } });
    }
  },
  {
    sessionAuth: true,
    detail: {
      tags: ["Knowledge"],
      summary: "将 Office 资源转换为 PDF",
      description: "将 Word/Excel/PPT 等 Office 文档转换为 PDF 并返回，用于前端预览。需要服务端安装 LibreOffice。",
    },
  },
);

app.delete(
  "/knowledgeBases/:id/resources/:resourceId",
  // biome-ignore lint/suspicious/noExplicitAny: Elysia type inference limitation with sessionAuth
  async ({ store, params, error }: any) => {
    const authCtx = store.authContext!;
    const id = params.id;
    const resourceId = params.resourceId;
    try {
      const result = await deleteKnowledgeResource(authCtx.organizationId, id, resourceId);
      if (!result.success) {
        return error(404, { success: false, error: { code: result.error.code, message: result.error.message } });
      }
      return { success: true as const, data: null };
    } catch (err) {
      console.error(err);
      return error(400, {
        success: false,
        error: {
          code: "DELETE_FAILED",
          message: err instanceof Error ? err.message : "删除资源失败",
        },
      });
    }
  },
  {
    sessionAuth: true,
    response: {
      200: "delete-knowledge-resource-response",
      400: WebErrSchema,
      404: WebErrSchema,
    },
    detail: {
      tags: ["Knowledge"],
      summary: "删除知识资源",
      description: "删除指定知识库下的单个资源记录及其远端资源。",
    },
  },
);

export default app;
