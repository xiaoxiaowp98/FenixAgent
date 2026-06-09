import { Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { hindsightApi } from "@/src/api/hindsight";
import { NS } from "@/src/i18n";

import type { MemoryDetail, MemoryItem } from "../types";

const PAGE_SIZE = 20;

type FactType = "world" | "experience" | "observation";

/** 内存详情右侧面板 */
function DetailPanel({ item, onClose }: { item: MemoryDetail | null; onClose: () => void }) {
  const { t } = useTranslation(NS.HINDSIGHT);

  if (!item) return null;

  return (
    <div className="w-80 border-l bg-muted/30 flex flex-col shrink-0">
      {/* 面板头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h3 className="font-medium text-sm">{t("memories.detail")}</h3>
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* 面板内容 */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* 原文 */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">{t("memories.text", { defaultValue: "Text" })}</p>
          <p className="text-sm whitespace-pre-wrap break-words">{item.text}</p>
        </div>

        {/* 上下文 */}
        {item.context && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("memories.context")}</p>
            <p className="text-sm">{item.context}</p>
          </div>
        )}

        {/* 类型 */}
        <div>
          <p className="text-xs text-muted-foreground mb-1">{t("memories.factType")}</p>
          <Badge variant="secondary">{item.type}</Badge>
        </div>

        {/* 标签 */}
        {item.tags.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("memories.tags")}</p>
            <div className="flex flex-wrap gap-1">
              {item.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 实体 */}
        {item.entities.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("memories.entities")}</p>
            <div className="flex flex-wrap gap-1">
              {item.entities.map((entity) => (
                <Badge key={entity} variant="secondary" className="text-xs">
                  {entity}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 创建时间 */}
        {item.mentioned_at && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("memories.createdAt")}</p>
            <p className="text-sm">{new Date(item.mentioned_at).toLocaleString()}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Recall 搜索弹窗 */
function RecallDialog({
  open,
  onOpenChange,
  factType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  factType: FactType;
}) {
  const { t } = useTranslation(NS.HINDSIGHT);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Array<{ id: string; text: string; type: string; score: number }>>([]);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await hindsightApi.recall({
        query: query.trim(),
        types: [factType],
      });
      setResults(res.facts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Recall failed");
    } finally {
      setLoading(false);
    }
  }, [query, factType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("memories.recall")}</DialogTitle>
          <DialogDescription>{t("recall.query")}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("memories.search")}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button onClick={handleSearch} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </Button>
        </div>

        {/* 搜索结果 */}
        {results.length > 0 && (
          <div className="space-y-2 max-h-60 overflow-auto">
            <p className="text-xs font-medium text-muted-foreground">{t("recall.results")}</p>
            {results.map((fact) => (
              <div key={fact.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs">
                    {fact.type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">score: {fact.score.toFixed(2)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words">{fact.text}</p>
              </div>
            ))}
          </div>
        )}

        {!loading && results.length === 0 && query && (
          <p className="text-sm text-muted-foreground text-center py-4">{t("recall.noResults")}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Retain 存储弹窗 */
function RetainDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation(NS.HINDSIGHT);
  const [content, setContent] = useState("");
  const [context, setContext] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!content.trim()) return;
    setSaving(true);
    try {
      const tags = tagsStr
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      await hindsightApi.retain({
        items: [
          {
            content: content.trim(),
            context: context.trim() || undefined,
            tags: tags.length > 0 ? tags : undefined,
          },
        ],
      });
      toast.success(t("retain.submit"));
      setContent("");
      setContext("");
      setTagsStr("");
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Retain failed");
    } finally {
      setSaving(false);
    }
  }, [content, context, tagsStr, onOpenChange, onSuccess, t]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("memories.retain")}</DialogTitle>
          <DialogDescription>{t("retain.content")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">{t("retain.content")}</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t("retain.content")}
              className="mt-1"
              rows={4}
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("retain.context")}</label>
            <Input
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={t("retain.context")}
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium">{t("retain.tags")}</label>
            <Input
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="tag1, tag2, ..."
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={handleSubmit} disabled={saving || !content.trim()}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {t("retain.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MemoriesView() {
  const { t } = useTranslation(NS.HINDSIGHT);

  // 列表状态
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // 筛选状态
  const [factType, setFactType] = useState<FactType>("world");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // 详情面板
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<MemoryDetail | null>(null);

  // 弹窗
  const [showRecall, setShowRecall] = useState(false);
  const [showRetain, setShowRetain] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /** 加载内存列表 */
  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hindsightApi.listMemories({
        type: factType,
        q: search || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setMemories(res.items);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to load memories:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load memories");
    } finally {
      setLoading(false);
    }
  }, [factType, search, page]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

  /** 切换 fact type 时重置分页 */
  const handleFactTypeChange = (type: FactType) => {
    setFactType(type);
    setPage(0);
    setSelectedId(null);
    setDetail(null);
  };

  /** 搜索时重置分页 */
  const handleSearch = () => {
    setPage(0);
    // loadMemories 会因 page 变化自动触发
  };

  /** 清空搜索 */
  const handleClearSearch = () => {
    setSearch("");
    setPage(0);
  };

  /** 删除内存 */
  const handleDelete = async (id: string) => {
    try {
      await hindsightApi.deleteMemory(id);
      toast.success(t("memories.delete"));
      // 如果删除的是当前选中项，关闭详情面板
      if (selectedId === id) {
        setSelectedId(null);
        setDetail(null);
      }
      loadMemories();
    } catch (err) {
      console.error("Failed to delete memory:", err);
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  /** 点击行打开详情面板 */
  const handleRowClick = async (item: MemoryItem) => {
    if (selectedId === item.id) {
      setSelectedId(null);
      setDetail(null);
      return;
    }
    setSelectedId(item.id);
    try {
      const res = await hindsightApi.getMemory(item.id);
      setDetail(res);
    } catch (err) {
      console.error("Failed to load memory detail:", err);
      toast.error(err instanceof Error ? err.message : "Failed to load detail");
    }
  };

  // fact type 选项配置
  const factTypes: Array<{ value: FactType; label: string }> = [
    { value: "world", label: t("memories.worldFacts") },
    { value: "experience", label: t("memories.experience") },
    { value: "observation", label: t("memories.observations") },
  ];

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* 左侧：列表区 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 工具栏：fact type tabs + 搜索 + 操作按钮 */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          {/* Fact type 子标签 */}
          <div className="flex items-center rounded-lg border bg-muted p-0.5">
            {factTypes.map((ft) => (
              <button
                key={ft.value}
                type="button"
                onClick={() => handleFactTypeChange(ft.value)}
                className={`px-3 py-1 text-sm rounded-md transition-colors ${
                  factType === ft.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {ft.label}
              </button>
            ))}
          </div>

          {/* 搜索框 */}
          <div className="flex items-center gap-1 flex-1 max-w-sm">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("memories.search")}
                className="pl-8 h-8"
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
            </div>
            {search && (
              <Button variant="ghost" size="icon-xs" onClick={handleClearSearch}>
                <X className="size-3.5" />
              </Button>
            )}
          </div>

          {/* 操作按钮 */}
          <Button variant="outline" size="sm" onClick={() => setShowRecall(true)}>
            <Search className="size-3.5" />
            {t("memories.recall")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowRetain(true)}>
            <Plus className="size-3.5" />
            {t("memories.retain")}
          </Button>
        </div>

        {/* 总数 */}
        <div className="px-4 py-2 text-xs text-muted-foreground border-b">
          {t("memories.totalCount", { count: total })}
        </div>

        {/* 内存表格 */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : memories.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
              {t("memories.noMemories")}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40%]">{t("retain.content")}</TableHead>
                  <TableHead className="w-[20%]">{t("memories.context")}</TableHead>
                  <TableHead className="w-[15%]">{t("memories.createdAt")}</TableHead>
                  <TableHead className="w-[15%]">{t("memories.tags")}</TableHead>
                  <TableHead className="w-[10%] text-right">{t("memories.delete")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memories.map((item) => (
                  <TableRow
                    key={item.id}
                    className={`cursor-pointer ${selectedId === item.id ? "bg-muted/80" : ""}`}
                    onClick={() => handleRowClick(item)}
                  >
                    <TableCell className="max-w-xs">
                      <p className="truncate whitespace-nowrap">{item.text}</p>
                    </TableCell>
                    <TableCell>
                      <p className="truncate whitespace-nowrap text-muted-foreground text-xs">{item.context || "—"}</p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.date ? new Date(item.date).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-0.5">
                        {item.tags.slice(0, 2).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                            {tag}
                          </Badge>
                        ))}
                        {item.tags.length > 2 && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            +{item.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id);
                        }}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 border-t text-sm">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              {t("common:previous", { defaultValue: "Previous" })}
            </Button>
            <span className="text-muted-foreground text-xs">
              {page + 1} / {totalPages}
            </span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              {t("common:next", { defaultValue: "Next" })}
            </Button>
          </div>
        )}
      </div>

      {/* 右侧：详情面板 */}
      {selectedId && (
        <DetailPanel
          item={detail}
          onClose={() => {
            setSelectedId(null);
            setDetail(null);
          }}
        />
      )}

      {/* Recall 弹窗 */}
      <RecallDialog open={showRecall} onOpenChange={setShowRecall} factType={factType} />

      {/* Retain 弹窗 */}
      <RetainDialog open={showRetain} onOpenChange={setShowRetain} onSuccess={loadMemories} />
    </div>
  );
}
