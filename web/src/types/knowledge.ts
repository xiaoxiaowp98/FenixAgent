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

/** rerank 重排序模型选项（检索测试用） */
export interface RerankModelOption {
  name: string;
  label: string;
  provider: string;
  instance: string;
}

/** 元数据过滤 4 种模式 */
export type MetaDataFilterMethod = "disabled" | "auto" | "semi_auto" | "manual";

/** 元数据过滤手动条件项 */
export interface MetaDataFilterCondition {
  key: string;
  op: string;
  value: string | string[];
}

/** 元数据过滤配置（对应 RAGFlow meta_data_filter 字段） */
export interface MetaDataFilter {
  method: MetaDataFilterMethod;
  logic?: string;
  manual?: MetaDataFilterCondition[];
  semi_auto?: Array<string | { key: string; op?: string }>;
}

/** 检索测试请求体 */
export interface KnowledgeSearchBody {
  query: string;
  similarityThreshold?: number;
  vectorSimilarityWeight?: number;
  rerankId?: string | null;
  keyword?: boolean;
  highlight?: boolean;
  pageSize?: number;
  page?: number;
  topK?: number;
  useKg?: boolean;
  crossLanguages?: string[];
  metaDataFilter?: MetaDataFilter;
}

/** 检索测试单个 chunk 的详细信息（含三种相似度分） */
export interface KnowledgeRetrievalChunk {
  chunkId: string;
  content: string;
  documentName: string;
  documentId: string;
  datasetId: string;
  similarity: number;
  vectorSimilarity?: number | null;
  termSimilarity?: number | null;
  highlight?: string | null;
  importantKeywords?: string[];
}

/** 检索测试文档维度聚合项 */
export interface KnowledgeRetrievalDocAgg {
  documentName: string;
  documentId: string;
  count: number;
}

/** 检索测试详细结果 */
export interface KnowledgeSearchResultData {
  chunks: KnowledgeRetrievalChunk[];
  total: number;
  docAggs: KnowledgeRetrievalDocAgg[];
}

/** 知识图谱节点 */
export interface KnowledgeGraphNode {
  id: string;
  name: string;
  label?: string;
  entity_type?: string;
  weight?: number;
  description?: string;
}

/** 知识图谱边 */
export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  weight?: number;
  description?: string;
}

/** 知识图谱数据 */
export interface KnowledgeGraphData {
  graph: {
    nodes: KnowledgeGraphNode[];
    edges: KnowledgeGraphEdge[];
  };
  mind_map?: unknown;
}

/** 知识图谱生成进度 */
export interface KnowledgeGraphProgress {
  progress: number;
  progressMsg?: string;
  taskId?: string;
}
