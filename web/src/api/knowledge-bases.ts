/**
 * knowledge-bases.ts — 知识库域 API 模块
 *
 * 封装知识库的 CRUD 及资源管理操作，统一通过 request() 与后端 /web/knowledgeBases 通信。
 * 所有方法严格遵循 RESTful 风格。
 */

import type {
  KnowledgeBaseDetail,
  KnowledgeBaseInfo,
  KnowledgeFormOptions,
  KnowledgeParseMethod,
  KnowledgeResourceInfo,
  KnowledgeUploadResponse,
} from "../types/knowledge";
import { request } from "./request";

/** 创建知识库请求体 */
export interface KnowledgeBaseCreateBody {
  name: string;
  slug?: string;
  description?: string;
  /** 嵌入模型名；创建后不可改 */
  embeddingModel?: string | null;
  /** 解析方法；创建后不可改 */
  parseMethod?: KnowledgeParseMethod | null;
  /** 自定义解析 pipeline ID；仅 parseMethod=pipeline 时生效 */
  pipelineId?: string | null;
  /** 内置分块方法 parser_id；仅 parseMethod=builtin 时生效 */
  chunkMethod?: string | null;
}

/** 更新知识库请求体（部分字段可选） */
export type KnowledgeBaseUpdateBody = Partial<KnowledgeBaseCreateBody>;

export const kbApi = {
  /** 查询知识库列表（后端返回普通数组，无分页） */
  list: (query?: { page?: number; pageSize?: number; keyword?: string }) =>
    request<KnowledgeBaseInfo[]>("/web/knowledgeBases", { method: "GET", query }),

  /** 根据 ID 获取单个知识库详情 */
  get: (params: { id: string }) => request<KnowledgeBaseDetail>("/web/knowledgeBases/:id", { method: "GET", params }),

  /** 创建新的知识库 */
  create: (body: KnowledgeBaseCreateBody) =>
    request<KnowledgeBaseInfo>("/web/knowledgeBases", { method: "POST", body }),

  /** 获取创建知识库表单所需的可选项（嵌入模型、分块方法、pipeline） */
  getFormOptions: () => request<KnowledgeFormOptions>("/web/knowledgeBases/form-options", { method: "GET" }),

  /** 更新已有知识库 */
  update: (params: { id: string }, body: KnowledgeBaseUpdateBody) =>
    request<KnowledgeBaseInfo>("/web/knowledgeBases/:id", { method: "PATCH", params, body }),

  /** 删除知识库 */
  del: (params: { id: string }) => request<void>("/web/knowledgeBases/:id", { method: "DELETE", params }),

  /** 上传资源文件到知识库（FormData 格式），返回解析后的资源项列表 */
  uploadResources: (params: { id: string }, formData: FormData) =>
    request<KnowledgeUploadResponse>("/web/knowledgeBases/:id/resources/upload", {
      method: "POST",
      params,
      body: formData,
    }),

  /** 通过 URL 导入在线资源到知识库 */
  importUrl: (params: { id: string }, body: { url: string }) =>
    request<KnowledgeResourceInfo>("/web/knowledgeBases/:id/resources/url", {
      method: "POST",
      params,
      body,
    }),

  /** 查询知识库内的资源列表（后端返回普通数组，无分页） */
  listResources: (params: { id: string }, query?: { page?: number; pageSize?: number }) =>
    request<KnowledgeResourceInfo[]>("/web/knowledgeBases/:id/resources", {
      method: "GET",
      params,
      query,
    }),

  /** 删除知识库内的指定资源 */
  deleteResource: (params: { kbId: string; resourceId: string }) =>
    request<void>("/web/knowledgeBases/:kbId/resources/:resourceId", {
      method: "DELETE",
      params,
    }),

  /** 构造资源文件的预览/下载 URL（upload 类型资源） */
  getFileUrl: (params: { kbId: string; resourceId: string }) =>
    `/web/knowledgeBases/${encodeURIComponent(params.kbId)}/resources/${encodeURIComponent(params.resourceId)}/file`,

  /** 构造 Office 资源 PDF 转换预览 URL */
  getPdfUrl: (params: { kbId: string; resourceId: string }) =>
    `/web/knowledgeBases/${encodeURIComponent(params.kbId)}/resources/${encodeURIComponent(params.resourceId)}/pdf`,
};
