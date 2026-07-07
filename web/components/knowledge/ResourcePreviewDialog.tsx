import { useRequest } from "ahooks";
import mammoth from "mammoth";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { kbApi } from "@/src/api/knowledge-bases";
import { NS } from "@/src/i18n";
import type { KnowledgeResourceInfo } from "../../src/types/knowledge";

/** 根据扩展名将文件归类为可预览的类别 */
type FileCategory = "pdf" | "image" | "markdown" | "text" | "html" | "office" | "other";

/** Office 文档子类型，用于 PDF 转换不可用时的降级预览 */
type OfficeKind = "word" | "excel" | "powerpoint";

function getFileCategory(filename: string): FileCategory {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (ext === "pdf") return "pdf";

  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)) return "image";

  if (["md", "markdown"].includes(ext)) return "markdown";

  if (["html", "htm"].includes(ext)) return "html";

  if (
    [
      "txt",
      "json",
      "xml",
      "csv",
      "yaml",
      "yml",
      "js",
      "ts",
      "tsx",
      "jsx",
      "py",
      "go",
      "rs",
      "sh",
      "bash",
      "sql",
      "css",
      "log",
      "env",
    ].includes(ext)
  )
    return "text";

  if (["docx", "xlsx", "pptx", "doc", "xls", "ppt"].includes(ext)) return "office";

  return "other";
}

/** 确定 Office 文档子类型 */
function getOfficeKind(filename: string): OfficeKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "docx" || ext === "doc") return "word";
  if (ext === "xlsx" || ext === "xls") return "excel";
  return "powerpoint";
}

interface ResourcePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: KnowledgeResourceInfo;
  kbId: string;
}

/** Office 预览模式：checking → loading → pdf 可用 → mammoth(仅 docx) → download 降级 */
type OfficeMode = "checking" | "pdf" | "docxHtml" | "fallback";

/** 文件预览对话框，根据资源类型渲染适当的预览视图 */
export function ResourcePreviewDialog({ open, onOpenChange, resource, kbId }: ResourcePreviewDialogProps) {
  const { t } = useTranslation(NS.KNOWLEDGE);
  const category = getFileCategory(resource.sourceName);
  const fileUrl = kbApi.getFileUrl({ kbId, resourceId: resource.id });

  // —— 文本 / Markdown 内容加载 ——
  const needsFetch = category === "markdown" || category === "text" || category === "html";
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);

  const {
    loading: fetchLoading,
    error: fetchError,
    run: runFetch,
  } = useRequest(
    async () => {
      const response = await fetch(fileUrl, { credentials: "include" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
    {
      manual: true,
      onSuccess: setFetchedContent,
      onError: (err) => {
        console.error("Failed to fetch preview content", err);
        toast.error(t("preview.loadError"));
      },
    },
  );

  // —— Office 文档预览：先尝试 PDF 转换，不可用时用 mammoth(docx) 或降级 ——
  const isOffice = category === "office";
  const officeKind = isOffice ? getOfficeKind(resource.sourceName) : "word";
  const pdfUrl = isOffice ? kbApi.getPdfUrl({ kbId, resourceId: resource.id }) : "";
  const [officeMode, setOfficeMode] = useState<OfficeMode>("checking");
  const [docxHtml, setDocxHtml] = useState<string | null>(null);

  // 检查 PDF 转换端点是否可用
  const { loading: officeLoading, run: runOfficeCheck } = useRequest(
    async (): Promise<OfficeMode> => {
      const resp = await fetch(pdfUrl, { credentials: "include" });
      if (resp.ok && resp.headers.get("content-type")?.includes("pdf")) {
        return "pdf";
      }
      // PDF 不可用，对 Word 文档尝试 mammoth
      if (officeKind === "word") {
        try {
          const fileResp = await fetch(fileUrl, { credentials: "include" });
          if (!fileResp.ok) throw new Error(`HTTP ${fileResp.status}`);
          const arrayBuffer = await fileResp.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          setDocxHtml(result.value);
          return "docxHtml";
        } catch (mammothErr) {
          console.error("mammoth conversion failed", mammothErr);
        }
      }
      return "fallback";
    },
    {
      manual: true,
      onSuccess: (mode) => setOfficeMode(mode),
      onError: () => setOfficeMode("fallback"),
    },
  );

  const needsOfficeCheck = isOffice;

  const startOfficeCheck = useCallback(() => {
    setOfficeMode("checking");
    setDocxHtml(null);
    runOfficeCheck();
  }, [runOfficeCheck]);

  // 对话框打开/关闭/资源变化时触发加载
  // biome-ignore lint/correctness/useExhaustiveDependencies: resource.id 故意保留——同类型资源切换时 needsFetch/needsOfficeCheck 不变，必须依赖 resource.id 才会重新拉取预览，否则预览内容会停留在上一个资源
  useEffect(() => {
    if (!open) {
      setFetchedContent(null);
      setOfficeMode("checking");
      setDocxHtml(null);
      return;
    }
    if (needsFetch) {
      setFetchedContent(null);
      runFetch();
    }
    if (needsOfficeCheck) {
      startOfficeCheck();
    }
  }, [open, needsFetch, needsOfficeCheck, resource.id, runFetch, startOfficeCheck]);

  // ── 渲染各类型预览内容 ──
  const renderContent = () => {
    switch (category) {
      case "pdf":
        return (
          <iframe
            src={`${fileUrl}#navpanes=0`}
            title={resource.sourceName}
            className="w-full flex-1 min-h-0 rounded-md border border-border"
          />
        );

      case "image":
        return (
          <div className="flex-1 flex items-center justify-center bg-surface-2 rounded-md p-4 min-h-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fileUrl} alt={resource.sourceName} className="max-w-full max-h-full object-contain rounded-md" />
          </div>
        );

      case "markdown":
        if (fetchLoading) return <MarkdownSkeleton />;
        if (fetchError || !fetchedContent) return <ErrorPlaceholder message={t("preview.loadError")} />;
        return (
          <div className="flex-1 overflow-auto p-6">
            <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-text-primary prose-p:text-text-primary prose-strong:text-text-primary prose-li:text-text-primary [&_pre]:bg-surface-2 [&_pre]:rounded-lg [&_pre]:p-4 [&_pre]:text-text-primary [&_code]:bg-surface-2 [&_code]:rounded [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-text-primary [&_code]:text-xs [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-text-primary [&_table]:w-full [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:bg-surface-2 [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_img]:max-w-full [&_img]:rounded-lg [&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:text-text-muted [&_hr]:border-border [&_a]:text-primary [&_a]:underline">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{fetchedContent}</ReactMarkdown>
            </div>
          </div>
        );

      case "text":
        if (fetchLoading) return <TextSkeleton />;
        if (fetchError || !fetchedContent) return <ErrorPlaceholder message={t("preview.loadError")} />;
        return (
          <pre className="flex-1 overflow-auto m-0 p-4 bg-surface-2 text-text-primary text-xs font-mono whitespace-pre-wrap break-all rounded-md border border-border">
            {fetchedContent}
          </pre>
        );

      case "html":
        if (fetchLoading) return <TextSkeleton />;
        if (fetchError || !fetchedContent) return <ErrorPlaceholder message={t("preview.loadError")} />;
        return (
          <iframe
            srcDoc={fetchedContent}
            title={resource.sourceName}
            sandbox="allow-scripts allow-same-origin"
            className="w-full flex-1 min-h-0 rounded-md border border-border bg-white"
          />
        );

      case "office": {
        // Office 文档：优先级 PDF 转换 > mammoth(docx) > 下载
        if (officeMode === "checking" || officeLoading) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
              <div className="h-8 w-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
              <p className="text-sm">{t("preview.converting")}</p>
            </div>
          );
        }

        if (officeMode === "pdf") {
          return (
            <iframe
              src={`${pdfUrl}#navpanes=0`}
              title={resource.sourceName}
              className="w-full flex-1 min-h-0 rounded-md border border-border"
            />
          );
        }

        if (officeMode === "docxHtml" && docxHtml) {
          return (
            <div className="flex-1 overflow-auto p-6">
              <div
                className="prose prose-sm max-w-none dark:prose-invert [&_table]:w-full [&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:bg-surface-2 [&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_img]:max-w-full [&_img]:rounded-lg"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: mammoth outputs sanitized HTML
                dangerouslySetInnerHTML={{ __html: docxHtml }}
              />
            </div>
          );
        }

        // fallback：PDF 转换不可用且非 Word 文档（或 mammoth 也失败）
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
            <p className="text-sm">{t("preview.unsupported")}</p>
            <Button variant="outline" size="sm" asChild>
              <a href={fileUrl} download={resource.sourceName} target="_blank" rel="noreferrer">
                {t("preview.download")}
              </a>
            </Button>
          </div>
        );
      }

      default:
        return (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-text-muted">
            <p className="text-sm">{t("preview.unsupported")}</p>
            <Button variant="outline" size="sm" asChild>
              <a href={fileUrl} download={resource.sourceName} target="_blank" rel="noreferrer">
                {t("preview.download")}
              </a>
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[1000px] max-w-[1000px] h-[90vh] flex flex-col p-0 gap-0"
        showCloseButton={false}
      >
        {/* Header：标题 + 下载 + 关闭 */}
        <DialogHeader className="flex-row items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <DialogTitle className="truncate flex-1 min-w-0">
            {t("preview.title", { name: resource.sourceName })}
          </DialogTitle>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild>
              <a href={fileUrl} download={resource.sourceName} target="_blank" rel="noreferrer">
                {t("preview.download")}
              </a>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              {t("preview.close")}
            </Button>
          </div>
        </DialogHeader>

        {/* 预览内容区域 */}
        <div className="flex flex-col flex-1 min-h-0">{renderContent()}</div>
      </DialogContent>
    </Dialog>
  );
}

// ── 骨架屏 / 错误占位组件 ──

function MarkdownSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-3">
      <Skeleton className="h-4 w-3/4 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-5/6 rounded" />
      <Skeleton className="h-4 w-2/3 rounded" />
    </div>
  );
}

function TextSkeleton() {
  return (
    <div className="flex-1 p-6 space-y-2">
      <Skeleton className="h-3 w-full rounded" />
      <Skeleton className="h-3 w-5/6 rounded" />
      <Skeleton className="h-3 w-full rounded" />
      <Skeleton className="h-3 w-4/6 rounded" />
      <Skeleton className="h-3 w-full rounded" />
    </div>
  );
}

function ErrorPlaceholder({ message }: { message: string }) {
  return <div className="flex-1 flex items-center justify-center text-text-muted text-sm">{message}</div>;
}
