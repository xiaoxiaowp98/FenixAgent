import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { DataTable, type Column } from "@/components/config/DataTable";
import { StatusBadge } from "@/components/config/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { FormDialog } from "@/components/config/FormDialog";
import { ConfirmDialog } from "@/components/config/ConfirmDialog";
import {
  apiCreateKnowledgeBase,
  apiDeleteKnowledgeResource,
  apiDeleteKnowledgeBase,
  apiGetKnowledgeBase,
  apiImportKnowledgeResourceUrl,
  apiListKnowledgeBases,
  apiListKnowledgeResources,
  apiUpdateKnowledgeBase,
  apiUploadKnowledgeResources,
} from "../api/client";
import type {
  KnowledgeBaseDetail,
  KnowledgeBaseInfo,
  KnowledgeResourceInfo,
  KnowledgeUploadResponse,
} from "../types/knowledge";

export async function loadKnowledgeBasesData(
  listKnowledgeBases: typeof apiListKnowledgeBases = apiListKnowledgeBases,
) {
  return listKnowledgeBases();
}

export async function loadKnowledgeBaseDetailData(
  knowledgeBaseId: string,
  getKnowledgeBase: typeof apiGetKnowledgeBase = apiGetKnowledgeBase,
  listKnowledgeResources: typeof apiListKnowledgeResources = apiListKnowledgeResources,
) {
  const [detail, resources] = await Promise.all([
    getKnowledgeBase(knowledgeBaseId),
    listKnowledgeResources(knowledgeBaseId),
  ]);
  return { detail, resources };
}

export async function uploadKnowledgeBaseFiles(
  knowledgeBaseId: string,
  files: File[],
  uploadKnowledgeResources: typeof apiUploadKnowledgeResources = apiUploadKnowledgeResources,
): Promise<KnowledgeUploadResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("files", file);
  }
  return uploadKnowledgeResources(knowledgeBaseId, formData);
}

export function summarizeKnowledgeDetail(
  detail: KnowledgeBaseDetail,
  resources: KnowledgeResourceInfo[],
) {
  return {
    lastError: detail.lastError ?? resources.find((item) => item.lastError)?.lastError ?? null,
    resourcesCount: resources.length,
    resourceNames: resources.map((item) => item.sourceName),
  };
}

function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleString("zh-CN");
}

export function KnowledgeBasesPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<KnowledgeBaseInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<KnowledgeBaseDetail | null>(null);
  const [resources, setResources] = useState<KnowledgeResourceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeBaseInfo | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeBaseInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importingUrl, setImportingUrl] = useState(false);
  const [deletingResourceId, setDeletingResourceId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [urlSourceName, setUrlSourceName] = useState("");

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadKnowledgeBasesData();
      setItems(list);
      const nextId = selectedId && list.some((item) => item.id === selectedId)
        ? selectedId
        : list[0]?.id ?? null;
      setSelectedId(nextId);
    } catch (error) {
      toast.error(`加载知识库失败: ${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const loadDetail = useCallback(async (knowledgeBaseId: string) => {
    setDetailLoading(true);
    try {
      const data = await loadKnowledgeBaseDetailData(knowledgeBaseId);
      setSelectedDetail(data.detail);
      setResources(data.resources);
    } catch (error) {
      toast.error(`加载知识库详情失败: ${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (selectedId) {
      loadDetail(selectedId);
      return;
    }
    setSelectedDetail(null);
    setResources([]);
  }, [selectedId, loadDetail]);

  const columns: Column<KnowledgeBaseInfo>[] = [
    { key: "name", header: "名称", sortable: true, filterable: true },
    {
      key: "status",
      header: "状态",
      filterable: true,
      render: (row) => <StatusBadge status={row.status} />,
    },
    { key: "resourcesCount", header: "资源数", sortable: true },
    {
      key: "updatedAt",
      header: "最近更新时间",
      sortable: true,
      render: (row) => formatTimestamp(row.updatedAt),
    },
    { key: "bindingsCount", header: "绑定Agent数", sortable: true },
  ];

  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormName("");
    setFormSlug("");
    setFormDescription("");
    setDialogOpen(true);
  };

  const handleOpenEdit = () => {
    if (!selectedDetail) return;
    setEditingItem(selectedDetail);
    setFormName(selectedDetail.name);
    setFormSlug(selectedDetail.slug);
    setFormDescription(selectedDetail.description ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !formSlug.trim()) {
      toast.error("名称和 slug 为必填项");
      return;
    }
    setSaving(true);
    try {
      if (editingItem) {
        await apiUpdateKnowledgeBase(editingItem.id, {
          name: formName.trim(),
          slug: formSlug.trim(),
          description: formDescription.trim() || null,
        });
        toast.success("知识库已更新");
      } else {
        await apiCreateKnowledgeBase({
          name: formName.trim(),
          slug: formSlug.trim(),
          description: formDescription.trim() || undefined,
        });
        toast.success("知识库已创建");
      }
      setDialogOpen(false);
      await loadItems();
    } catch (error) {
      toast.error(`保存失败: ${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiDeleteKnowledgeBase(deleteTarget.id);
      toast.success("知识库已删除");
      setConfirmOpen(false);
      if (selectedId === deleteTarget.id) {
        setSelectedId(null);
      }
      await loadItems();
    } catch (error) {
      toast.error(`删除失败: ${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedId) return;
    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      await uploadKnowledgeBaseFiles(selectedId, files);
      toast.success(`已上传 ${files.length} 个文件`);
      await loadDetail(selectedId);
      await loadItems();
    } catch (error) {
      toast.error(`上传失败: ${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleImportUrl = async () => {
    if (!selectedId || !urlValue.trim()) {
      toast.error("请输入资源 URL");
      return;
    }
    setImportingUrl(true);
    try {
      await apiImportKnowledgeResourceUrl(selectedId, {
        url: urlValue.trim(),
        sourceName: urlSourceName.trim() || undefined,
      });
      toast.success("URL 资源已提交");
      setUrlValue("");
      setUrlSourceName("");
      await loadDetail(selectedId);
      await loadItems();
    } catch (error) {
      toast.error(`导入失败: ${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setImportingUrl(false);
    }
  };

  const handleDeleteResource = async (resourceId: string) => {
    if (!selectedId) return;
    setDeletingResourceId(resourceId);
    try {
      await apiDeleteKnowledgeResource(selectedId, resourceId);
      toast.success("资源已删除");
      await loadDetail(selectedId);
      await loadItems();
    } catch (error) {
      toast.error(`删除资源失败: ${error instanceof Error ? error.message : "未知错误"}`);
    } finally {
      setDeletingResourceId(null);
    }
  };

  const detailSummary = selectedDetail ? summarizeKnowledgeDetail(selectedDetail, resources) : null;

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-40" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <Skeleton className="h-[420px] w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-text-bright">知识库</h2>
          <p className="mt-0.5 text-sm text-text-muted">管理知识库、查看资源状态并上传索引材料</p>
        </div>
        <Button onClick={handleOpenCreate}>新建知识库</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
          <DataTable<KnowledgeBaseInfo>
            columns={columns}
            data={items}
            searchable
            searchPlaceholder="搜索知识库..."
            emptyMessage="暂无知识库"
            actions={(row) => (
              <div className="flex gap-1.5">
                <Button size="xs" variant={row.id === selectedId ? "default" : "outline"} onClick={() => setSelectedId(row.id)}>
                  详情
                </Button>
                <Button size="xs" variant="outline" onClick={() => {
                  setSelectedId(row.id);
                  setTimeout(() => fileInputRef.current?.click(), 0);
                }}>
                  上传
                </Button>
                <Button size="xs" variant="destructive" onClick={() => {
                  setDeleteTarget(row);
                  setConfirmOpen(true);
                }}>
                  删除
                </Button>
              </div>
            )}
          />
        </div>

        <div className="rounded-xl border border-border-subtle bg-surface-0 p-4">
          {detailLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : selectedDetail ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-text-bright">{selectedDetail.name}</h3>
                  <p className="text-xs text-text-muted">slug: {selectedDetail.slug}</p>
                </div>
                <Button size="sm" variant="outline" onClick={handleOpenEdit}>编辑</Button>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedDetail.status} />
                  <span className="text-text-muted">绑定 {selectedDetail.bindingsCount} 个 Agent</span>
                </div>
                <p className="text-text-secondary">{selectedDetail.description || "暂无描述"}</p>
                {detailSummary?.lastError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    最近错误: {detailSummary.lastError}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-bright">上传资源</span>
                  <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
                    {uploading ? "上传中..." : "选择文件"}
                  </Button>
                </div>
                <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <Input value={urlValue} onChange={(e) => setUrlValue(e.target.value)} placeholder="导入 URL" />
                  <Button size="sm" disabled={importingUrl} onClick={handleImportUrl}>
                    {importingUrl ? "导入中..." : "导入 URL"}
                  </Button>
                </div>
                <Input value={urlSourceName} onChange={(e) => setUrlSourceName(e.target.value)} placeholder="可选：来源名称" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-text-bright">资源列表</span>
                  <span className="text-xs text-text-muted">{detailSummary?.resourcesCount ?? 0} 个资源</span>
                </div>
                <div className="max-h-[320px] space-y-2 overflow-y-auto">
                  {resources.length === 0 ? (
                    <p className="text-sm text-text-muted">暂无资源</p>
                  ) : resources.map((resource) => (
                    <div key={resource.id} className="rounded-lg border border-border-subtle px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium text-text-bright">{resource.sourceName}</p>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={resource.status} />
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={deletingResourceId === resource.id}
                            onClick={() => void handleDeleteResource(resource.id)}
                          >
                            {deletingResourceId === resource.id ? "删除中..." : "删除"}
                          </Button>
                        </div>
                      </div>
                      <p className="mt-1 text-xs text-text-muted">{resource.sourceType} · {formatTimestamp(resource.updatedAt)}</p>
                      {resource.lastError && (
                        <p className="mt-2 text-xs text-red-600">{resource.lastError}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-text-muted">选择左侧知识库查看详情</p>
          )}
        </div>
      </div>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingItem ? "编辑知识库" : "新建知识库"}
        onSubmit={handleSave}
        loading={saving}
      >
        <div className="space-y-4">
          <div>
            <Label>名称</Label>
            <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="例如 项目文档" />
          </div>
          <div>
            <Label>Slug</Label>
            <Input value={formSlug} onChange={(e) => setFormSlug(e.target.value)} placeholder="例如 project-docs" />
          </div>
          <div>
            <Label>描述</Label>
            <Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={4} placeholder="可选，简要描述知识库用途" />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="确认删除知识库"
        description={`确定删除知识库 "${deleteTarget?.name ?? ""}" 吗？`}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
