import { useRequest } from "ahooks";
import {
  BookOpen,
  Braces,
  ChevronLeft,
  Cpu,
  ExternalLink,
  File,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Globe,
  Layers,
  Plus,
  Presentation,
  Scissors,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import type { ReactNode } from "react";
import { Fragment, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/config/ConfirmDialog";
import { FormDialog } from "@/components/config/FormDialog";
import { ResourcePreviewDialog } from "@/components/knowledge/ResourcePreviewDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { kbApi } from "@/src/api/knowledge-bases";
import { unwrap } from "@/src/api/request";
import { NS } from "@/src/i18n";
import type {
  KnowledgeBaseDetail,
  KnowledgeBaseInfo,
  KnowledgeFormOptions,
  KnowledgeParseMethod,
  KnowledgeResourceInfo,
} from "../../../types/knowledge";

function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleString();
}

/** 根据文件扩展名返回对应的 lucide 图标组件 */
function getFileIcon(filename: string) {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext))
    return <FileImage className="h-4 w-4 text-blue-500" />;
  if (["pdf"].includes(ext)) return <FileText className="h-4 w-4 text-red-500" />;
  if (["docx", "doc"].includes(ext)) return <FileText className="h-4 w-4 text-blue-600" />;
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
  if (["pptx", "ppt"].includes(ext)) return <Presentation className="h-4 w-4 text-orange-500" />;
  if (["md", "markdown", "txt", "json", "xml", "yaml", "yml", "log", "env"].includes(ext))
    return <FileCode className="h-4 w-4 text-gray-500" />;
  if (["html", "htm", "js", "ts", "tsx", "jsx", "css", "py", "go", "rs", "sh", "sql"].includes(ext))
    return <FileCode className="h-4 w-4 text-purple-500" />;
  return <File className="h-4 w-4 text-text-muted" />;
}

/** 资源状态 → 语义色 badge 样式 */
function getStatusBadge(status: string) {
  switch (status) {
    case "ready":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
    case "processing":
    case "pending":
    case "indexing":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
    case "error":
      return "bg-red-50 text-red-700 ring-1 ring-red-200";
    default:
      return "bg-surface-2 text-text-muted";
  }
}

/** 知识库状态 → 圆点装饰色 */
function getStatusDot(status: string) {
  switch (status) {
    case "ready":
      return "bg-emerald-500";
    case "processing":
    case "pending":
    case "indexing":
      return "bg-amber-500";
    case "error":
      return "bg-red-500";
    default:
      return "bg-slate-300";
  }
}

/**
 * 头像配色板：浅底 + 深字，适配浅色主题。
 * 不同知识库按名称 hash 分配稳定颜色，避免每次渲染抖动。
 */
const AVATAR_COLORS = [
  "bg-blue-50 text-blue-600",
  "bg-emerald-50 text-emerald-600",
  "bg-violet-50 text-violet-600",
  "bg-amber-50 text-amber-600",
  "bg-rose-50 text-rose-600",
  "bg-cyan-50 text-cyan-600",
  "bg-indigo-50 text-indigo-600",
  "bg-orange-50 text-orange-600",
];

/** 根据名称稳定地取一个头像配色（bg + text 组合类名） */
function pickAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0];
}

/** 取名称首字符作为头像文字（支持中英文，统一取第一个码点） */
function getInitial(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const first = Array.from(trimmed)[0] ?? "?";
  return first.toUpperCase();
}

interface KbCardProps {
  kb: KnowledgeBaseInfo;
  onClick: () => void;
}

function KbCard({ kb, onClick }: KbCardProps) {
  const color = pickAvatarColor(kb.name);
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex w-full items-center gap-4 rounded-xl bg-white border border-[#e4e9f0] p-4 text-left transition-all duration-200 hover:border-[#c8d0dd] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.06),0_1px_4px_-1px_rgba(0,0,0,0.04)] hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677ff]/40"
    >
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-lg font-semibold ${color}`}>
        {getInitial(kb.name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="truncate text-[15px] font-semibold text-[#1a2944] group-hover:text-[#1677ff] transition-colors">
            {kb.name}
          </h3>
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${getStatusDot(kb.status)}`} />
        </div>

        {kb.description && (
          <p className="mt-1 line-clamp-1 text-[12px] leading-relaxed text-[#94a3b8]">{kb.description}</p>
        )}

        <div className="mt-2 flex items-center gap-3 text-[12px] text-[#94a3b8]">
          <span className="flex items-center gap-1">
            <File className="h-3.5 w-3.5" />
            {kb.resourcesCount}
          </span>
          <span className="text-[#dbe1ea]">·</span>
          <span>{formatTimestamp(kb.updatedAt)}</span>
        </div>
      </div>
    </button>
  );
}

export function AgentKnowledgeBasesPage() {
  const { t } = useTranslation(NS.KNOWLEDGE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<KnowledgeBaseDetail | null>(null);
  const [resources, setResources] = useState<KnowledgeResourceInfo[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBaseInfo | null>(null);
  const [deletingResourceId, setDeletingResourceId] = useState<string | null>(null);
  const [previewResource, setPreviewResource] = useState<KnowledgeResourceInfo | null>(null);
  // 表单字段
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEmbeddingModel, setFormEmbeddingModel] = useState("");
  const [formParseMethod, setFormParseMethod] = useState<KnowledgeParseMethod>("builtin");
  const [formChunkMethod, setFormChunkMethod] = useState("");
  const [formPipeline, setFormPipeline] = useState("");
  const [editingItem, setEditingItem] = useState<KnowledgeBaseInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // 列表查询
  const {
    data: listData,
    loading,
    refresh,
  } = useRequest(() => unwrap(kbApi.list()), {
    onError: (err) => {
      console.error("Failed to load knowledge bases", err);
      toast.error(err instanceof Error ? err.message : t("loadError"));
    },
  });
  const items: KnowledgeBaseInfo[] = Array.isArray(listData) ? listData : [];

  // 创建表单可选项（嵌入模型、分块方法、pipeline）；失败不阻断表单
  const { data: formOptions } = useRequest(() => unwrap(kbApi.getFormOptions()), {
    onError: (err) => {
      // 选项拉取失败仅记录，不弹 toast——表单仍可用（分块方法是静态兜底）
      console.error("Failed to load knowledge form options", err);
    },
  });
  const options: KnowledgeFormOptions | null = formOptions ?? null;

  // 详情查询（手动触发）
  const { run: runLoadDetail, loading: detailLoading } = useRequest(
    (id: string) => Promise.all([unwrap(kbApi.get({ id })), unwrap(kbApi.listResources({ id }))]),
    {
      manual: true,
      onSuccess: ([detail, resList]) => {
        setSelectedDetail(detail);
        setResources(Array.isArray(resList) ? resList : []);
      },
      onError: (err) => {
        console.error("Failed to load detail", err);
        toast.error(err instanceof Error ? err.message : t("loadDetailError"));
      },
    },
  );

  // 创建知识库
  const { run: runCreate, loading: createSaving } = useRequest(
    (payload: {
      name: string;
      slug?: string;
      description?: string;
      embeddingModel?: string | null;
      parseMethod?: KnowledgeParseMethod | null;
      pipelineId?: string | null;
      chunkMethod?: string | null;
    }) => unwrap(kbApi.create(payload)),
    {
      manual: true,
      onSuccess: () => {
        toast.success(t("toast.created"));
        setDialogOpen(false);
        refresh();
      },
      onError: (err) => {
        console.error("Create failed", err);
        toast.error(err instanceof Error ? err.message : t("toast.saveFailed"));
      },
    },
  );

  // 更新知识库（静默操作，不弹 toast）
  const { run: runUpdate, loading: updateSaving } = useRequest(
    (id: string, payload: { name: string; description?: string }) => unwrap(kbApi.update({ id }, payload)),
    {
      manual: true,
      onSuccess: () => {
        setDialogOpen(false);
        refresh();
      },
      onError: (err) => {
        console.error("Update failed", err);
        toast.error(err instanceof Error ? err.message : t("toast.saveFailed"));
      },
    },
  );

  const saving = createSaving || updateSaving;

  // 删除知识库（静默操作，不弹 toast）
  const { run: runDelete } = useRequest((id: string) => unwrap(kbApi.del({ id })), {
    manual: true,
    onSuccess: (_data, [id]) => {
      setConfirmOpen(false);
      if (selectedId === id) {
        setSelectedId(null);
        setSelectedDetail(null);
        setResources([]);
      }
      setDeleteTarget(null);
      refresh();
    },
    onError: (err) => {
      console.error("Delete failed", err);
      toast.error(err instanceof Error ? err.message : t("toast.deleteFailed"));
    },
  });

  // 上传资源
  const { run: runUpload, loading: uploading } = useRequest(
    (id: string, formData: FormData) => unwrap(kbApi.uploadResources({ id }, formData)),
    {
      manual: true,
      onSuccess: (_data, [id]) => {
        toast.success(t("toast.uploaded"));
        runLoadDetail(id as string);
      },
      onError: (err) => {
        console.error("Upload failed", err);
        toast.error(err instanceof Error ? err.message : t("toast.uploadFailed"));
      },
    },
  );

  // 删除资源（静默操作，不弹 toast）
  const { run: runDeleteResource } = useRequest(
    (kbId: string, resourceId: string) => unwrap(kbApi.deleteResource({ kbId, resourceId })),
    {
      manual: true,
      onSuccess: (_data, [kbId]) => {
        setDeletingResourceId(null);
        runLoadDetail(kbId as string);
      },
      onError: (err) => {
        console.error("Delete resource failed", err);
        setDeletingResourceId(null);
        toast.error(err instanceof Error ? err.message : t("toast.deleteResourceFailed"));
      },
    },
  );

  // 搜索过滤
  const filteredItems = items.filter((kb) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      kb.name.toLowerCase().includes(q) ||
      (kb.slug?.toLowerCase().includes(q) ?? false) ||
      (kb.description?.toLowerCase().includes(q) ?? false)
    );
  });

  // 返回网格视图
  const handleBackToGrid = () => {
    setSelectedId(null);
    setSelectedDetail(null);
    setResources([]);
  };

  // 进入详情
  const handleSelect = (kb: KnowledgeBaseInfo) => {
    setSelectedId(kb.id);
    runLoadDetail(kb.id);
  };

  // 打开创建弹窗：重置全部表单字段
  const openCreateDialog = () => {
    setEditingItem(null);
    setFormName("");
    setFormDescription("");
    setFormEmbeddingModel("");
    setFormParseMethod("builtin");
    setFormChunkMethod("");
    setFormPipeline("");
    setDialogOpen(true);
  };

  // 打开编辑弹窗：仅 name/description 可改，配置字段不展示
  const openEditDialog = () => {
    const found = items.find((i) => i.id === selectedId);
    setEditingItem(found ?? null);
    setFormName(selectedDetail?.name ?? "");
    setFormDescription(selectedDetail?.description ?? "");
    setDialogOpen(true);
  };

  // 加载中骨架屏
  if (loading) {
    return (
      <div className="min-h-full overflow-auto bg-[#f4f7fb] px-8 py-7 text-[#14213d]">
        <div className="mb-6 flex items-end justify-between">
          <div>
            <Skeleton className="h-[22px] w-28 rounded-md" />
            <Skeleton className="mt-1.5 h-3 w-56 rounded-md" />
          </div>
          <Skeleton className="h-9 w-[240px] rounded-lg" />
        </div>
        <div className="mb-5 h-px bg-[#e8edf4]" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
            <div key={i} className="flex items-center gap-4 rounded-xl bg-white border border-[#e4e9f0] p-4">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="flex-1">
                <Skeleton className="h-4 w-3/4 rounded-md mb-2" />
                <Skeleton className="h-3 w-1/2 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 解析方法可读文案（详情只读展示用）
  const parseMethodLabel = (pm: KnowledgeParseMethod | null) => {
    if (pm === "builtin") return t("detailConfig.parseMethodBuiltin");
    if (pm === "pipeline") return t("detailConfig.parseMethodPipeline");
    return t("detailConfig.notSet");
  };

  const chunkMethodLabel = (value: string | null) => {
    if (!value) return t("detailConfig.notSet");
    const matched = options?.chunkMethods.find((c) => c.value === value);
    if (matched?.label) return matched.label;
    if (matched?.labelKey) return t(matched.labelKey);
    return value;
  };

  return (
    <div className="min-h-full overflow-auto bg-[#f4f7fb] px-8 py-7 text-[#14213d]">
      {/* ===== 网格视图 ===== */}
      {!selectedDetail && (
        <>
          {/* 顶部栏：标题 + 搜索 + 新建按钮 */}
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[22px] font-bold tracking-tight text-[#1a2944]">{t("title")}</h1>
              <p className="mt-0.5 text-[12px] text-[#94a3b8]">{t("subtitle")}</p>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98a8bd]" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="h-9 w-[220px] rounded-lg border border-[#dce5ef] bg-white pl-10 pr-4 text-[13px] text-[#1a2944] outline-none transition-all duration-200 placeholder:text-[#99a8bc] focus:w-[280px] focus:border-[#1677ff] focus:ring-4 focus:ring-[#1677ff]/10"
                />
              </div>
              <Button onClick={openCreateDialog} className="h-9 gap-1.5 text-[13px]">
                <Plus className="h-4 w-4" />
                {t("btn.create")}
              </Button>
            </div>
          </div>

          <div className="mb-5 h-px bg-[#e8edf4]" />

          {/* 知识库网格 */}
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              {searchQuery.trim() ? (
                <>
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#eef2f8]">
                    <Search className="h-8 w-8 text-[#bcc5d0]" />
                  </div>
                  <p className="text-sm font-medium text-[#64748b]">
                    {t("emptySearchMessage", { query: searchQuery })}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="text-[12px] text-[#1677ff] hover:underline"
                  >
                    {t("emptyClearSearch")}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-[#eef2f8]">
                    <BookOpen className="h-10 w-10 text-[#bcc5d0]" />
                  </div>
                  <p className="text-[15px] font-medium text-[#64748b]">{t("emptyTitle")}</p>
                  <p className="text-[13px] text-[#94a3b8] max-w-[320px] text-center leading-relaxed">
                    {t("emptyDescription")}
                  </p>
                  <Button onClick={openCreateDialog} className="mt-2 h-9 gap-1.5 text-[13px]">
                    <Plus className="h-4 w-4" />
                    {t("emptyCreateBtn")}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredItems.map((kb) => (
                <KbCard key={kb.id} kb={kb} onClick={() => handleSelect(kb)} />
              ))}
            </div>
          )}
        </>
      )}

      {/* ===== 详情视图 ===== */}
      {selectedDetail && (
        <div>
          {/* 返回按钮 + 标题 */}
          <div className="mb-5 flex items-center justify-between">
            <button
              type="button"
              onClick={handleBackToGrid}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#64748b] hover:text-[#1a2944] transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
              <span>Back to Knowledge Bases</span>
            </button>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={openEditDialog} className="h-8 text-[12px]">
                {t("btn.edit")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  const found = items.find((i) => i.id === selectedId);
                  setDeleteTarget(found ?? null);
                  setConfirmOpen(true);
                }}
                className="h-8 text-[12px]"
              >
                {t("btn.delete")}
              </Button>
            </div>
          </div>

          <div className="h-px bg-[#e8edf4] mb-5" />

          {/* 加载中 */}
          {detailLoading && (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 rounded-full border-2 border-[#1677ff] border-t-transparent animate-spin" />
            </div>
          )}

          {!detailLoading && (
            <div className="max-w-[900px] mx-auto space-y-6">
              {/* 详情头部卡片：头像 + 名称 + 元数据 + 配置 */}
              <div className="rounded-xl bg-white border border-[#e4e9f0] overflow-hidden">
                <div className="p-6">
                  <div className="flex items-start gap-4">
                    {/* 头像 */}
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-xl font-semibold ${pickAvatarColor(
                        selectedDetail.name,
                      )}`}
                    >
                      {getInitial(selectedDetail.name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5">
                        <h2 className="text-xl font-bold text-[#1a2944] truncate">{selectedDetail.name}</h2>
                        <span
                          className={`inline-block h-2.5 w-2.5 rounded-full ${getStatusDot(selectedDetail.status)}`}
                        />
                      </div>
                      <p className="text-[12px] text-[#94a3b8] font-mono mt-0.5">{selectedDetail.slug}</p>
                      {selectedDetail.description && (
                        <p className="mt-3 text-[13px] text-[#5c6b7e] leading-relaxed max-w-[600px]">
                          {selectedDetail.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 mt-4">
                        <span
                          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide uppercase ${getStatusBadge(
                            selectedDetail.status,
                          )}`}
                        >
                          {selectedDetail.status}
                        </span>
                        <span className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
                          <File className="h-3.5 w-3.5" />
                          {t("card.resourcesUnit", { count: selectedDetail.resourcesCount })}
                        </span>
                        {selectedDetail.bindingsCount > 0 && (
                          <span className="flex items-center gap-1.5 text-[12px] text-[#64748b]">
                            <Braces className="h-3.5 w-3.5" />
                            {selectedDetail.bindingsCount} agent{selectedDetail.bindingsCount > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 创建时选定的配置（只读展示） */}
                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-[#f0f3f8] pt-4">
                    <ConfigItem
                      icon={<Cpu className="h-4 w-4 text-[#1677ff]" />}
                      label={t("detailConfig.embeddingModel")}
                    >
                      {selectedDetail.embeddingModel ?? t("detailConfig.notSet")}
                    </ConfigItem>
                    <ConfigItem
                      icon={<Layers className="h-4 w-4 text-violet-500" />}
                      label={t("detailConfig.parseMethod")}
                    >
                      {parseMethodLabel(selectedDetail.parseMethod)}
                    </ConfigItem>
                    <ConfigItem
                      icon={<Scissors className="h-4 w-4 text-emerald-500" />}
                      label={t("detailConfig.chunkMethod")}
                    >
                      {chunkMethodLabel(selectedDetail.chunkMethod)}
                    </ConfigItem>
                  </div>
                </div>
              </div>

              {/* 外部链接 */}
              {selectedDetail.remoteId && (
                <div className="rounded-xl bg-white border border-[#e4e9f0] p-4">
                  <div className="flex items-center gap-2 text-[12px] text-[#64748b]">
                    <Globe className="h-3.5 w-3.5" />
                    <span>Remote ID: {selectedDetail.remoteId}</span>
                  </div>
                </div>
              )}

              {/* 资源列表 — 表格形式 */}
              <div className="rounded-xl bg-white border border-[#e4e9f0] overflow-hidden">
                {/* 表头工具栏 */}
                <div className="flex items-center justify-between px-5 py-3 border-b border-[#e8edf4]">
                  <h3 className="text-[13px] font-semibold text-[#1a2944]">
                    {t("resources.title", { count: resources.length })}
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0 && selectedId) {
                          const formData = new FormData();
                          for (const file of e.target.files) {
                            formData.append("files", file);
                          }
                          runUpload(selectedId, formData);
                        }
                      }}
                      className="hidden"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="h-8 gap-1.5 text-[12px]"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {uploading ? t("btn.uploading") : t("btn.upload")}
                    </Button>
                  </div>
                </div>

                {/* 表头 */}
                <div className="flex items-center gap-3 border-b border-[#f0f3f8] bg-[#f8fafc] px-5 py-2.5 text-[11px] font-medium uppercase tracking-wider text-[#94a3b8]">
                  <div className="flex-[2] min-w-0">{t("columns.name")}</div>
                  <div className="w-[60px] shrink-0 text-center">{t("resources.colChunks")}</div>
                  <div className="w-[100px] shrink-0">{t("resources.colStatus")}</div>
                  <div className="w-[80px] shrink-0 text-center">{t("resources.colEnabled")}</div>
                  <div className="w-[130px] shrink-0">{t("columns.updatedAt")}</div>
                  <div className="w-[80px] shrink-0 text-right">{t("resources.colActions")}</div>
                </div>

                {/* 表格行 */}
                <div className="divide-y divide-[#f0f3f8]">
                  {resources.map((r) => (
                    <div
                      key={r.id}
                      className="group flex items-center gap-3 px-5 py-3 hover:bg-[#f8fafc] transition-colors"
                    >
                      {/* 文件名 + 方法标签 */}
                      <div className="flex-[2] min-w-0 flex items-center gap-2">
                        <span className="shrink-0">{getFileIcon(r.sourceName)}</span>
                        <span className="text-[13px] font-medium text-[#1a2944] truncate">{r.sourceName}</span>
                      </div>

                      {/* 分块数 */}
                      <div className="w-[60px] shrink-0 text-center text-[12px] text-[#94a3b8]">
                        {r.chunkCount != null ? r.chunkCount : "—"}
                      </div>

                      {/* 状态 */}
                      <div className="w-[100px] shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusBadge(r.status)}`}
                        >
                          <span className={`inline-block h-1.5 w-1.5 rounded-full ${getStatusDot(r.status)}`} />
                          {r.status}
                        </span>
                      </div>

                      {/* 启用 */}
                      <div className="w-[80px] shrink-0 flex justify-center">
                        <Switch
                          checked={r.enabled ?? true}
                          onCheckedChange={(checked) => {
                            kbApi
                              .toggleResourceEnabled({ kbId: selectedId!, resourceId: r.id }, { enabled: checked })
                              .then(() => runLoadDetail(selectedId!))
                              .catch(console.error);
                          }}
                        />
                      </div>

                      {/* 更新时间 */}
                      <div className="w-[130px] shrink-0 text-[12px] text-[#94a3b8]">
                        {formatTimestamp(r.createdAt)}
                      </div>

                      {/* 操作 */}
                      <div className="w-[80px] shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {r.status === "ready" && (
                          <Button
                            size="xs"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-[#94a3b8] hover:text-[#1677ff]"
                            title={t("preview.btn")}
                            onClick={() => setPreviewResource(r)}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-[#94a3b8] hover:text-red-500"
                          title={t("actions.delete")}
                          disabled={deletingResourceId === r.id}
                          onClick={() => {
                            setDeletingResourceId(r.id);
                            runDeleteResource(selectedId!, r.id);
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {resources.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-[#94a3b8] gap-3">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#eef2f8]">
                        <File className="h-7 w-7 opacity-30" />
                      </div>
                      <p className="text-[13px] font-medium">{t("resources.empty")}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== 创建/编辑弹窗 ===== */}
      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingItem ? t("dialog.editTitle") : t("dialog.createTitle")}
        onSubmit={() => {
          if (!formName.trim()) {
            toast.error(t("validation.nameRequired"));
            return;
          }
          const name = formName.trim();
          const description = formDescription.trim() || undefined;
          if (editingItem) {
            // 编辑模式：仅 name/description 可改，配置字段创建时已锁定
            runUpdate(editingItem.id, { name, description });
            return;
          }
          // 创建模式：透传嵌入模型 / 解析方法 / 分块方法
          const embeddingModel = formEmbeddingModel || null;
          // 前端校验：嵌入模型必须含 @（RagFlow v0.26 要求 model@provider 格式）
          if (embeddingModel && !embeddingModel.includes("@")) {
            toast.error(t("validation.embeddingModelFormat") || "嵌入模型格式不对，必须包含@");
            return;
          }
          const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
          runCreate({
            name,
            slug,
            description,
            embeddingModel,
            parseMethod: formParseMethod,
            // pipeline 模式传 pipelineId，内置模式不传
            pipelineId: formParseMethod === "pipeline" ? formPipeline || null : null,
            // 仅内置模式传分块方法；pipeline 模式分块由远端流水线决定
            chunkMethod: formParseMethod === "builtin" ? formChunkMethod || null : null,
          });
        }}
        loading={saving}
      >
        <div className="space-y-4">
          {/* 名称 */}
          <FieldGroup required label={t("form.name")} hint={t("form.nameHint")}>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder={t("form.namePlaceholder")}
              autoFocus
              className="h-10"
            />
          </FieldGroup>

          {/* 描述 */}
          <FieldGroup label={t("form.description")} hint={t("form.descriptionHint")}>
            <Textarea
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder={t("form.descriptionPlaceholder")}
              className="min-h-[72px] resize-none"
            />
          </FieldGroup>

          {/* 解析配置（仅创建模式） */}
          {!editingItem && (
            <>
              <p className="text-[12px] text-[#94a3b8]">{t("form.configLockedAfterCreate")}</p>

              {/* 嵌入模型 */}
              <FieldGroup label={t("form.embeddingModel")} hint={t("form.embeddingModelHint")}>
                <Select
                  value={formEmbeddingModel}
                  onValueChange={setFormEmbeddingModel}
                  disabled={(options?.embeddingModels?.length ?? 0) === 0}
                >
                  <SelectTrigger className="h-10 w-full">
                    <SelectValue placeholder={t("form.embeddingModelPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-[320px]">
                    {(() => {
                      const models = options?.embeddingModels ?? [];
                      const grouped = new Map<string, Map<string, typeof models>>();
                      for (const m of models) {
                        const prov = m.provider || "Unknown";
                        const inst = m.instance || "default";
                        if (!grouped.has(prov)) grouped.set(prov, new Map());
                        const instMap = grouped.get(prov)!;
                        if (!instMap.has(inst)) instMap.set(inst, []);
                        instMap.get(inst)!.push(m);
                      }
                      const providers = Array.from(grouped.entries());
                      return providers.length === 0 ? (
                        <div className="px-2 py-4 text-center text-[13px] text-muted-foreground">
                          {t("form.noEmbeddingModels")}
                        </div>
                      ) : (
                        providers.map(([provider, instMap], providerIdx) => (
                          <SelectGroup key={provider}>
                            <SelectLabel
                              className={
                                "px-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748b]" +
                                (providerIdx > 0 ? " mt-1 border-t border-[#eef2f8] pt-2.5" : "")
                              }
                            >
                              {provider}
                            </SelectLabel>
                            {Array.from(instMap.entries()).map(([instance, items]) => (
                              <Fragment key={instance}>
                                <SelectLabel className="pl-5 text-[11px] font-medium text-[#94a3b8]">
                                  {instance}
                                </SelectLabel>
                                {items.map((m) => (
                                  <SelectItem key={m.name} value={m.name} className="pl-8 text-[13px]">
                                    {m.name.split("@")[0] || m.name}
                                  </SelectItem>
                                ))}
                              </Fragment>
                            ))}
                          </SelectGroup>
                        ))
                      );
                    })()}
                  </SelectContent>
                </Select>
              </FieldGroup>

              {/* 解析方法 */}
              <FieldGroup label={t("form.parseMethod")} hint={t("form.parseMethodHint")}>
                <div className="flex gap-6">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md text-[13px] text-foreground select-none">
                    <input
                      type="radio"
                      name="parseMethod"
                      value="builtin"
                      checked={formParseMethod === "builtin"}
                      onChange={() => setFormParseMethod("builtin")}
                      className="h-4 w-4 accent-[#1677ff]"
                    />
                    {t("form.parseMethodBuiltin")}
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md text-[13px] text-foreground select-none">
                    <input
                      type="radio"
                      name="parseMethod"
                      value="pipeline"
                      checked={formParseMethod === "pipeline"}
                      onChange={() => setFormParseMethod("pipeline")}
                      className="h-4 w-4 accent-[#1677ff]"
                    />
                    {t("form.parseMethodPipeline")}
                  </label>
                </div>
              </FieldGroup>

              {/* 内置分块方法 */}
              {formParseMethod === "builtin" && (
                <FieldGroup required label={t("form.chunkMethod")} hint={t("form.chunkMethodHint")}>
                  <Select value={formChunkMethod} onValueChange={setFormChunkMethod}>
                    <SelectTrigger className="h-10 w-full">
                      <SelectValue placeholder={t("form.chunkMethodPlaceholder")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(options?.chunkMethods ?? []).map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label ?? t(c.labelKey ?? "")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldGroup>
              )}

              {/* Pipeline 选择 */}
              {formParseMethod === "pipeline" && (
                <FieldGroup label={t("form.pipeline")} hint={t("form.pipelineHint")}>
                  {(options?.pipelines?.length ?? 0) === 0 ? (
                    <div className="rounded-lg border border-dashed border-[#d0d7e2] bg-[#f8fafc] px-4 py-4 text-center">
                      <p className="text-[13px] font-medium text-[#64748b]">{t("form.noPipelines")}</p>
                      <p className="mt-1 text-[12px] text-[#94a3b8]">{t("form.noPipelinesHint")}</p>
                    </div>
                  ) : (
                    <Select value={formPipeline} onValueChange={setFormPipeline}>
                      <SelectTrigger className="h-10 w-full">
                        <SelectValue placeholder={t("form.pipelinePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {(options?.pipelines ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </FieldGroup>
              )}
            </>
          )}
        </div>
      </FormDialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("confirm.deleteTitle")}
        description={t("confirm.deleteDescription", { name: deleteTarget?.name ?? "" })}
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) runDelete(deleteTarget.id);
        }}
      />

      {previewResource && selectedId && (
        <ResourcePreviewDialog
          open={previewResource !== null}
          onOpenChange={(open) => {
            if (!open) setPreviewResource(null);
          }}
          resource={previewResource}
          kbId={selectedId}
        />
      )}
    </div>
  );
}

/** 详情头部配置项：图标 + 标签 + 值 */
function ConfigItem({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-[#94a3b8]">{label}</p>
        <p className="mt-0.5 text-[13px] font-medium text-[#1a2944] truncate">{children}</p>
      </div>
    </div>
  );
}

// ───────── 表单辅助组件 ─────────

/** 字段组：label + hint + children */
function FieldGroup({
  label,
  hint,
  required,
  icon,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        {icon && <span className="shrink-0">{icon}</span>}
        <span className="text-[13px] font-medium text-[#1a2944]">{label}</span>
        {required && <span className="text-[13px] text-red-500">*</span>}
      </div>
      {hint && <p className="mb-2 text-[12px] leading-relaxed text-[#94a3b8]">{hint}</p>}
      {children}
    </div>
  );
}

/** 解析方法卡片选择器 */
