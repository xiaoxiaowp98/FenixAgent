import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { ConfirmDialog } from "@/components/config/ConfirmDialog";
import { client } from "../api/client";

interface ApiKeyInfo {
  id: string;
  label: string;
  keyPrefix: string;
  createdAt: number;
  lastUsedAt: number | null;
}

export function ApiKeyManager() {
  const { t } = useTranslation("apikey");
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [newLabel, setNewLabel] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const { data, error: err } = await client.web.apiKeys.get();
      if (err) {
        setError(t("toast.loadFailed"));
        return;
      }
      setKeys(data ?? []);
    } catch {
      setError(t("toast.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = async () => {
    setError("");
    try {
      const { data, error: err } = await client.web.apiKeys.post({ label: newLabel || undefined });
      if (err) {
        setError(err.message ?? t("toast.createFailed"));
        return;
      }
      setCreatedKey((data as { full_key?: string } | null)?.full_key);
      setNewLabel("");
      await loadKeys();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("toast.createFailed"));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await client.web.apiKeys({ id }).delete();
      await loadKeys();
    } catch {
      setError(t("toast.deleteFailed"));
    }
  };

  const handleUpdateLabel = async (id: string) => {
    try {
      await client.web.apiKeys({ id }).patch({ label: editLabel });
      setEditingId(null);
      await loadKeys();
    } catch {
      setError(t("toast.updateLabelFailed"));
    }
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-text-muted">{t("loading")}</div>;
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-6">
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => void navigate({ to: "/" })}
            className="text-text-muted hover:text-text-primary text-sm"
          >
            &larr; {t("back")}
          </button>
          <h1 className="text-lg font-semibold text-text-primary">{t("title")}</h1>
        </div>

        {error && <div className="mb-4 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</div>}

        {createdKey && (
          <div className="mb-4 rounded-md border border-status-active/30 bg-status-active/5 px-4 py-3">
            <p className="text-sm font-medium text-status-active">{t("createdNotice.title")}</p>
            <p className="mt-1 text-xs text-text-muted">{t("createdNotice.copyHint")}</p>
            <div className="mt-2 flex items-center gap-2">
              <code className="flex-1 rounded bg-surface-0 px-3 py-2 text-xs font-mono break-all">{createdKey}</code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(createdKey);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className={
                  copied
                    ? "shrink-0 rounded-md bg-status-active/15 px-3 py-2 text-xs font-medium text-status-active"
                    : "shrink-0 rounded-md bg-surface-2 px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-3"
                }
              >
                {copied ? t("createdNotice.copied") : t("createdNotice.copy")}
              </button>
            </div>
            <button
              onClick={() => {
                setCreatedKey(null);
                setCopied(false);
              }}
              className="mt-2 text-xs text-text-muted hover:text-text-primary"
            >
              {t("createdNotice.close")}
            </button>
          </div>
        )}

        {/* Create new key */}
        <div className="mb-6 rounded-lg border border-border bg-surface-1 p-4">
          <h2 className="mb-3 text-sm font-medium text-text-primary">{t("createForm.title")}</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder={t("createForm.labelPlaceholder")}
              className="flex-1 rounded-md border border-border bg-surface-0 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
            <button
              onClick={handleCreate}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
            >
              {t("createForm.create")}
            </button>
          </div>
        </div>

        {/* Key list */}
        <div className="space-y-2">
          {keys.length === 0 && <p className="text-center text-sm text-text-muted py-8">{t("keyList.empty")}</p>}
          {keys.map((key) => (
            <div
              key={key.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                {editingId === key.id ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="flex-1 rounded border border-border bg-surface-0 px-2 py-1 text-sm text-text-primary"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleUpdateLabel(key.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      autoFocus
                    />
                    <button onClick={() => handleUpdateLabel(key.id)} className="text-xs text-brand hover:underline">
                      {t("keyList.save")}
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-text-muted hover:underline">
                      {t("cancel")}
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="text-sm font-medium text-text-primary truncate">
                      {key.label || t("keyList.unnamed")}
                    </p>
                    <p className="text-xs text-text-muted font-mono">{key.keyPrefix}</p>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editingId !== key.id && (
                  <>
                    <button
                      onClick={() => {
                        setEditingId(key.id);
                        setEditLabel(key.label);
                      }}
                      className="text-xs text-text-muted hover:text-text-primary"
                    >
                      {t("keyList.edit")}
                    </button>
                    <button
                      onClick={() => setDeleteTarget(key.id)}
                      className="text-xs text-status-error hover:underline"
                    >
                      {t("keyList.delete")}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t("deleteDialog.title")}
        description={t("deleteDialog.description")}
        variant="destructive"
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget);
        }}
      />
    </div>
  );
}
