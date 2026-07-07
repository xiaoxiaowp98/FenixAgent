export interface KnowledgeResourceInfo {
  id: string;
  knowledgeBaseId: string;
  sourceName: string;
  sourceType: string;
  sourcePath: string | null;
  remoteId: string | null;
  status: string;
  lastError: string | null;
  enabled?: boolean | null;
  chunkCount?: number | null;
  metaFields?: Record<string, unknown> | null;
  parseProgress?: number | null;
  runStatus?: string | null;
  chunkMethod?: string | null;
  fileSize?: number | null;
  createdAt: number;
  updatedAt: number;
}

/** 知识库解析方法：内置分块器或自定义 pipeline */
export type KnowledgeParseMethod = "builtin" | "pipeline";

/** 创建表单可选的嵌入模型选项 */
export interface EmbeddingModelOption {
  name: string;
  label: string;
  provider: string;
  instance: string;
}

/** 创建表单可选的分块方法选项（RagFlow chunk_method） */
export interface ChunkMethodOption {
  value: string;
  label: string;
  /** @deprecated 向后兼容 */
  labelKey?: string;
}

/** 创建表单可选的 pipeline 选项 */
export interface KnowledgePipelineOption {
  id: string;
  name: string;
}

/** 创建知识库表单所需的全部可选项 */
export interface KnowledgeFormOptions {
  embeddingModels: EmbeddingModelOption[];
  chunkMethods: ChunkMethodOption[];
  pipelines: KnowledgePipelineOption[];
}

export interface KnowledgeBaseInfo {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  provider: string | null;
  remoteId: string | null;
  remoteAccountId: string | null;
  remoteUserId: string | null;
  status: string;
  lastError: string | null;
  bindingsCount: number;
  resourcesCount: number;
  /** 创建时选定的嵌入模型；创建后不可改 */
  embeddingModel: string | null;
  /** 创建时选定的解析方法 */
  parseMethod: KnowledgeParseMethod | null;
  /** 创建时选定的分块方法 parser_id */
  chunkMethod: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeBaseDetail extends KnowledgeBaseInfo {
  recentResources: KnowledgeResourceInfo[];
}

export interface KnowledgeUploadResponse {
  items: KnowledgeResourceInfo[];
}
