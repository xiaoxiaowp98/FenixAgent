"use client";

import { Loader2, Network, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { kbApi } from "@/src/api/knowledge-bases";
import { NS } from "@/src/i18n";
import type { KnowledgeGraphData, KnowledgeGraphProgress } from "@/src/types/knowledge";

interface KnowledgeGraphPanelProps {
  knowledgeBaseId: string;
}

/** 轮询间隔（毫秒） */
const POLL_INTERVAL_MS = 3000;

/**
 * 知识图谱面板：生成、查看、删除知识图谱。
 * 包含生成按钮 + 进度轮询 + 简单节点/边列表展示。
 */
export function KnowledgeGraphPanel({ knowledgeBaseId }: KnowledgeGraphPanelProps) {
  const { t } = useTranslation(NS.KNOWLEDGE);

  // 图谱数据
  const [graphData, setGraphData] = useState<KnowledgeGraphData | null>(null);
  const [graphLoading, setGraphLoading] = useState(false);

  // 生成进度
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<KnowledgeGraphProgress | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 组件挂载时拉取已有图谱
  const fetchGraph = useCallback(async () => {
    try {
      setGraphLoading(true);
      const resp = await kbApi.getGraph({ id: knowledgeBaseId });
      setGraphData(resp.data ?? null);
    } catch {
      // 图谱不存在时不显示错误
    } finally {
      setGraphLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // 清理轮询
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // 开始生成
  const handleGenerate = useCallback(async () => {
    try {
      setGenerating(true);
      setProgress({ progress: 0 });
      await kbApi.generateGraph({ id: knowledgeBaseId });

      // 开始轮询进度
      pollRef.current = setInterval(async () => {
        try {
          const resp = await kbApi.getGraphProgress({ id: knowledgeBaseId });
          if (resp.success && resp.data) {
            setProgress(resp.data);
            // 进度 >= 1 表示完成
            if (resp.data.progress >= 1) {
              if (pollRef.current) clearInterval(pollRef.current);
              pollRef.current = null;
              setGenerating(false);
              setProgress(null);
              // 刷新图谱数据
              await fetchGraph();
              toast.success(t("graph.generateSuccess"));
            }
          }
        } catch {
          // 轮询失败静默处理
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      console.error("[KnowledgeGraphPanel] generate failed", err);
      toast.error(t("graph.generateFailed"));
      setGenerating(false);
      setProgress(null);
    }
  }, [knowledgeBaseId, fetchGraph, t]);

  // 删除图谱
  const handleDelete = useCallback(async () => {
    try {
      await kbApi.deleteGraph({ id: knowledgeBaseId });
      setGraphData(null);
      toast.success(t("graph.deleteSuccess"));
    } catch (err) {
      console.error("[KnowledgeGraphPanel] delete failed", err);
      toast.error(t("graph.deleteFailed"));
    }
  }, [knowledgeBaseId, t]);

  return (
    <div className="space-y-3">
      {/* 操作按钮行 */}
      <div className="flex items-center gap-2">
        {graphData && (
          <Button variant="outline" size="sm" className="text-[12px] h-8" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            {t("graph.delete")}
          </Button>
        )}
        <Button size="sm" className="text-[12px] h-8" onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5 mr-1" />
          )}
          {generating ? t("graph.generating") : t("graph.generate")}
        </Button>
      </div>

      {/* 进度条 */}
      {generating && progress && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[12px] text-[#64748b]">
            <span>{t("graph.generating")}...</span>
            <span>{Math.round(progress.progress * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[#e8edf4] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#1677ff] transition-all duration-500"
              style={{ width: `${Math.round(progress.progress * 100)}%` }}
            />
          </div>
          {progress.progressMsg && <p className="text-[11px] text-[#94a3b8] truncate">{progress.progressMsg}</p>}
        </div>
      )}

      {/* 图谱内容 */}
      {graphLoading && (
        <div className="flex items-center justify-center min-h-[200px]">
          <Loader2 className="h-6 w-6 text-[#1677ff] animate-spin" />
        </div>
      )}

      {!graphLoading && !graphData && !generating && (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-2">
          <Network className="h-10 w-10 text-[#c0c8d4]" />
          <p className="text-[13px] text-[#94a3b8]">{t("graph.empty")}</p>
          <p className="text-[12px] text-[#c0c8d4]">{t("graph.emptyHint")}</p>
        </div>
      )}

      {!graphLoading && graphData && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* 节点列表 */}
          <div className="rounded-lg border border-[#e8edf4] bg-[#f8fafc] p-4">
            <h4 className="text-[13px] font-medium text-[#1a2944] mb-3">
              {t("graph.nodes")} ({graphData.graph.nodes.length})
            </h4>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {graphData.graph.nodes.map((node) => (
                <div key={node.id} className="rounded border border-[#e8edf4] bg-white p-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center rounded-full w-6 h-6 bg-[#1677ff]/10 text-[11px] font-medium text-[#1677ff]">
                      {node.entity_type?.charAt(0)?.toUpperCase() ?? "E"}
                    </span>
                    <span className="text-[13px] font-medium text-[#1a2944]">{node.name}</span>
                    {node.weight != null && (
                      <span className="text-[11px] text-[#94a3b8] ml-auto">{node.weight.toFixed(2)}</span>
                    )}
                  </div>
                  {node.description && (
                    <p className="mt-1 text-[12px] text-[#64748b] line-clamp-2">{node.description}</p>
                  )}
                  {node.entity_type && (
                    <span className="inline-block mt-1.5 rounded bg-[#e8edf4] px-1.5 py-0.5 text-[10px] text-[#64748b]">
                      {node.entity_type}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 边列表 */}
          <div className="rounded-lg border border-[#e8edf4] bg-[#f8fafc] p-4">
            <h4 className="text-[13px] font-medium text-[#1a2944] mb-3">
              {t("graph.edges")} ({graphData.graph.edges.length})
            </h4>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
              {graphData.graph.edges.map((edge) => {
                const srcNode = graphData.graph.nodes.find((n) => n.id === edge.source);
                const tgtNode = graphData.graph.nodes.find((n) => n.id === edge.target);
                return (
                  <div key={edge.id} className="rounded border border-[#e8edf4] bg-white p-3">
                    <div className="flex items-center gap-1.5 text-[12px]">
                      <span className="font-medium text-[#1677ff] truncate max-w-[120px]">
                        {srcNode?.name ?? edge.source}
                      </span>
                      <span className="text-[#c0c8d4]">→</span>
                      <span className="font-medium text-[#10b981] truncate max-w-[120px]">
                        {tgtNode?.name ?? edge.target}
                      </span>
                      {edge.weight != null && (
                        <span className="text-[11px] text-[#94a3b8] ml-auto">{edge.weight.toFixed(2)}</span>
                      )}
                    </div>
                    {edge.description && (
                      <p className="mt-1 text-[11px] text-[#64748b] line-clamp-1">{edge.description}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
