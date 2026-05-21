import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/config/ConfirmDialog";
import { FormDialog } from "@/components/config/FormDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, apiGet, apiPost } from "../../../api/client";
import { AgentCardList } from "../shared/AgentCardList";
import { AgentPageHeader } from "../shared/AgentPageHeader";

type ChannelBinding = {
  id: string;
  platform: string;
  chatId: string | null;
  agentId: string;
  enabled: boolean;
  agentName?: string | null;
};

type EnvironmentSummary = { id: string; name: string };

export function AgentChannelsPage() {
  const { t } = useTranslation("channels");
  const [bindings, setBindings] = useState<ChannelBinding[]>([]);
  const [environments, setEnvironments] = useState<EnvironmentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formPlatform, setFormPlatform] = useState("");
  const [formChatId, setFormChatId] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bindingsData, envsData] = await Promise.all([
        apiGet<ChannelBinding[]>("/web/channels/bindings"),
        apiGet<EnvironmentSummary[]>("/web/environments"),
      ]);
      if (bindingsData) setBindings(bindingsData as ChannelBinding[]);
      if (envsData) setEnvironments((envsData as EnvironmentSummary[]) ?? []);
    } catch (e) {
      console.error("Failed to load channels", e);
      toast.error(t("loadBindingsFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = () => {
    setFormPlatform("");
    setFormChatId("");
    setFormAgentId(environments[0]?.id ?? "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formPlatform.trim() || !formAgentId) {
      toast.error(t("validation.required"));
      return;
    }
    setFormSaving(true);
    try {
      await apiPost("/web/channels/bindings", {
        platform: formPlatform.trim(),
        chatId: formChatId.trim() || null,
        agentId: formAgentId,
      });
      toast.success(t("toast.created"));
      setDialogOpen(false);
      loadData();
    } catch (e) {
      console.error("Save failed", e);
      toast.error(t("toast.saveFailed"));
    } finally {
      setFormSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api("DELETE", `/web/channels/bindings/${deleteTarget}`);
      toast.success(t("toast.deleted"));
      setConfirmOpen(false);
      setDeleteTarget(null);
      loadData();
    } catch (e) {
      console.error("Delete failed", e);
      toast.error(t("toast.deleteFailed"));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <AgentPageHeader title={t("title")} subtitle={t("subtitle")} />
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <AgentPageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<Button onClick={handleCreate}>{t("btn.create")}</Button>}
      />
      <AgentCardList
        items={bindings}
        cardKey={(b) => b.id}
        searchPlaceholder={t("searchPlaceholder")}
        searchFn={(b, q) => b.platform.toLowerCase().includes(q) || (b.agentName?.toLowerCase().includes(q) ?? false)}
        emptyMessage={t("emptyMessage")}
        renderCard={(binding) => (
          <div className="group rounded-lg border border-border-light bg-surface-1 px-4 py-3 transition-colors hover:border-border-active hover:shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{binding.platform}</Badge>
                  <span className="text-sm font-medium text-text-bright">{binding.agentName ?? binding.agentId}</span>
                  {binding.chatId && <span className="text-xs text-text-muted">({binding.chatId})</span>}
                </div>
              </div>
              <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={() => {
                    setDeleteTarget(binding.id);
                    setConfirmOpen(true);
                  }}
                >
                  {t("btn.delete")}
                </Button>
              </div>
            </div>
          </div>
        )}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={t("dialog.createTitle")}
        onSubmit={handleSave}
        loading={formSaving}
      >
        <div className="space-y-4">
          <div>
            <Label>{t("form.platform")}</Label>
            <Input
              value={formPlatform}
              onChange={(e) => setFormPlatform(e.target.value)}
              className="mt-1"
              placeholder="telegram"
            />
          </div>
          <div>
            <Label>{t("form.chatId")}</Label>
            <Input value={formChatId} onChange={(e) => setFormChatId(e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label>{t("form.agent")}</Label>
            <Select value={formAgentId} onValueChange={setFormAgentId}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {environments.map((env) => (
                  <SelectItem key={env.id} value={env.id}>
                    {env.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("confirm.deleteTitle")}
        description={t("confirm.deleteDescription")}
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
