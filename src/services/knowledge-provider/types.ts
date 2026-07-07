export type KnowledgeBaseStatus = "empty" | "indexing" | "ready" | "error";
export type KnowledgeResourceStatus = "pending" | "processing" | "ready" | "error";

/** 知识库解析方法：内置分块器或自定义 pipeline */
export type KnowledgeParseMethod = "builtin" | "pipeline";

/** 创建表单可选的嵌入模型选项 */
export interface EmbeddingModelOption {
  /** RagFlow 模型标识，透传给 dataset 的 embedding_model 字段（name@instance@provider） */
  name: string;
  /** 展示名 */
  label: string;
  /** 厂商名，用于分组展示 */
  provider: string;
  /** 实例名，用于分组展示 */
  instance: string;
}

/** 创建表单可选的分块方法选项（RagFlow v0.26 chunk_method 枚举） */
export interface ChunkMethodOption {
  /** RagFlow chunk_method，如 naive/book/paper */
  value: string;
  /** RagFlow parser_ids 原生展示名，如 General/Book/Paper */
  label: string;
  /** @deprecated 保留 labelKey 向后兼容，新代码优先用 label */
  labelKey?: string;
}

/** 创建表单可选的 pipeline 选项（远端自定义解析流水线） */
export interface KnowledgePipelineOption {
  id: string;
  name: string;
}

/** 知识库创建表单所需的全部可选项 */
export interface KnowledgeFormOptions {
  embeddingModels: EmbeddingModelOption[];
  chunkMethods: ChunkMethodOption[];
  pipelines: KnowledgePipelineOption[];
}

export interface KnowledgeBaseSnapshot {
  remoteId: string | null;
  name: string;
  status: KnowledgeBaseStatus;
  description?: string | null;
  lastError?: string | null;
  /** 创建时选定的嵌入模型（透传给 RagFlow） */
  embeddingModel?: string | null;
  /** 创建时选定的分块方法 chunk_method */
  chunkMethod?: string | null;
}

export interface KnowledgeResourceSnapshot {
  remoteId: string;
  knowledgeBaseRemoteId?: string | null;
  sourceName: string;
  sourceType: string;
  status: KnowledgeResourceStatus;
  source?: string | null;
  lastError?: string | null;
  /** RAGFlow 文档启用状态: 1=启用, 0=禁用 */
  enabled?: boolean | null;
  /** 已解析分块数 */
  chunkCount?: number | null;
  /** 元数据字段 */
  metaFields?: Record<string, unknown> | null;
  /** 解析进度 0-100 */
  parseProgress?: number | null;
  /** RAGFlow run 状态原文 */
  runStatus?: string | null;
  /** 解析方法（chunk_method 或 pipeline） */
  chunkMethod?: string | null;
  /** 文件大小（字节） */
  fileSize?: number | null;
}

export interface KnowledgeSearchResult {
  title: string;
  snippet: string;
  source: string;
  score: number;
  knowledgeBaseId?: string | null;
  resourceId?: string | null;
}

export interface KnowledgeResourceContent {
  resourceId: string;
  title?: string | null;
  content: string;
  source?: string | null;
}

export interface KnowledgeProvider {
  createKnowledgeBase(input: {
    organizationId: string;
    userId: string;
    slug: string;
    name: string;
    description?: string;
    /** 嵌入模型名；缺省时由 RagFlow 使用租户默认模型 */
    embeddingModel?: string | null;
    /** 解析方法：1=内置分块器(BuiltIn) / 2=自定义pipeline(Pipeline) */
    parseType?: number | null;
    /** 自定义解析 pipeline ID（仅 parseType=2 时生效） */
    pipelineId?: string | null;
    /** 分块方法 chunk_method；缺省时 RagFlow 使用 naive */
    chunkMethod?: string | null;
  }): Promise<KnowledgeBaseSnapshot>;
  /**
   * 列出上游可用的嵌入模型，供创建知识库表单选择。
   * 实现应在上游不可用时返回空数组，避免阻断表单渲染。
   */
  listEmbeddingModels(): Promise<EmbeddingModelOption[]>;
  /**
   * 列出上游可用的自定义解析 pipeline（best-effort）。
   * 不支持 pipeline 的上游或调用失败时返回空数组。
   */
  listPipelines(): Promise<KnowledgePipelineOption[]>;
  /** 删除整个知识库；RagFlow 不同版本可能使用单资源路径或集合端点。 */
  deleteKnowledgeBase(input: {
    knowledgeBaseRemoteId: string;
    remoteAccountId: string;
    remoteUserId: string;
  }): Promise<void>;
  addResource(input: {
    knowledgeBaseRemoteId?: string | null;
    targetRemoteId?: string | null;
    remoteAccountId: string;
    remoteUserId: string;
    filePath?: string;
    url?: string;
    sourceName?: string;
    wait?: boolean;
  }): Promise<KnowledgeResourceSnapshot>;
  listResources(input: {
    knowledgeBaseRemoteId: string;
    remoteAccountId: string;
    remoteUserId: string;
  }): Promise<KnowledgeResourceSnapshot[]>;
  /** 启用/禁用文档（RAGFlow batch-update-status） */
  setResourceEnabled(input: {
    resourceRemoteId: string;
    knowledgeBaseRemoteId: string;
    remoteAccountId: string;
    remoteUserId: string;
    enabled: boolean;
  }): Promise<void>;
  /** 触发文档重新解析（RAGFlow ingest API），后端仅触发不等待完成 */
  reparseResource(input: {
    resourceRemoteId: string;
    knowledgeBaseRemoteId: string;
    remoteAccountId: string;
    remoteUserId: string;
    /** 重新解析前是否删除已有分块数据 */
    deleteOld: boolean;
  }): Promise<void>;
  deleteResource(input: {
    resourceRemoteId: string;
    knowledgeBaseRemoteId: string;
    remoteAccountId: string;
    remoteUserId: string;
    recursive?: boolean;
  }): Promise<void>;
  search(input: {
    knowledgeBases: Array<{
      remoteId: string;
      remoteAccountId: string;
      remoteUserId: string;
    }>;
    query: string;
    topK: number;
  }): Promise<KnowledgeSearchResult[]>;
  readResource(input: {
    resourceRemoteId: string;
    knowledgeBaseRemoteId: string;
    remoteAccountId: string;
    remoteUserId: string;
  }): Promise<KnowledgeResourceContent>;
}
