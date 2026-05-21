import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/config/ConfirmDialog";
import { FormDialog } from "@/components/config/FormDialog";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { client } from "../../../api/client";
import { unwrapConfigData } from "../../../api/config-response";
import type { McpInspectResult, McpServerConfig, McpServerInfo, McpToolInfo } from "../../../types/config";
import { AgentCardList } from "../shared/AgentCardList";
import { AgentPageHeader } from "../shared/AgentPageHeader";

type KeyValueEntry = { key: string; value: string };

function validateMcpForm(
  name: string,
  type: "local" | "remote",
  command: string,
  url: string,
  t: (key: string) => string,
): string | null {
  if (!name.trim()) return t("validation.nameRequired");
  if (/--/.test(name)) return t("validation.nameNoDoubleHyphen");
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(name)) return t("validation.namePattern");
  if (name.length > 64) return t("validation.nameTooLong");
  if (type === "local") {
    if (!command.trim()) return t("validation.commandRequired");
    const parts = parseCommandString(command);
    if (parts.length === 0) return t("validation.commandInvalid");
  }
  if (type === "remote") {
    if (!url.trim()) return t("validation.urlRequired");
    try {
      new URL(url);
    } catch {
      return t("validation.urlInvalid");
    }
  }
  return null;
}

function parseCommandString(input: string): string[] {
  const tokens: string[] = [];
  const regex = /(?:[^\s"]+|"[^"]*")+/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex iteration pattern
  while ((match = regex.exec(input)) !== null) {
    tokens.push(match[0].replace(/^"|"$/g, ""));
  }
  return tokens;
}

function commandToString(command: string[]): string {
  return command.map((part) => (/\s/.test(part) ? `"${part}"` : part)).join(" ");
}

function buildMcpPayload(
  type: "local" | "remote",
  command: string,
  url: string,
  environment: KeyValueEntry[],
  headers: KeyValueEntry[],
  oauthClientId: string,
  oauthClientSecret: string,
  oauthScope: string,
  oauthRedirectUri: string,
  timeout: string,
): McpServerConfig {
  const timeoutNum = timeout ? parseInt(timeout, 10) : undefined;
  const envObj: Record<string, string> | undefined =
    environment.filter((e) => e.key.trim()).length > 0
      ? Object.fromEntries(environment.filter((e) => e.key.trim()).map((e) => [e.key, e.value]))
      : undefined;
  const headersObj: Record<string, string> | undefined =
    headers.filter((h) => h.key.trim()).length > 0
      ? Object.fromEntries(headers.filter((h) => h.key.trim()).map((h) => [h.key, h.value]))
      : undefined;
  const oauthObj =
    oauthClientId || oauthClientSecret || oauthScope || oauthRedirectUri
      ? {
          clientId: oauthClientId || undefined,
          clientSecret: oauthClientSecret || undefined,
          scope: oauthScope || undefined,
          redirectUri: oauthRedirectUri || undefined,
        }
      : undefined;
  if (type === "local") {
    return {
      type: "local",
      command: parseCommandString(command),
      ...(envObj ? { environment: envObj } : {}),
      ...(timeoutNum ? { timeout: timeoutNum } : {}),
    };
  }
  return {
    type: "remote",
    url,
    ...(headersObj ? { headers: headersObj } : {}),
    ...(oauthObj ? { oauth: oauthObj } : {}),
    ...(timeoutNum ? { timeout: timeoutNum } : {}),
  };
}

export function AgentMcpPage() {
  const { t } = useTranslation("mcp");
  const [servers, setServers] = useState<McpServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServerInfo | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<McpServerInfo[]>([]);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [batchAction, setBatchAction] = useState<"enable" | "disable" | "delete" | null>(null);

  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"local" | "remote">("remote");
  const [formCommand, setFormCommand] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEnvironment, setFormEnvironment] = useState<KeyValueEntry[]>([{ key: "", value: "" }]);
  const [formHeaders, setFormHeaders] = useState<KeyValueEntry[]>([{ key: "", value: "" }]);
  const [formTimeout, setFormTimeout] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  const [oauthExpanded, setOauthExpanded] = useState(false);
  const [formOauthClientId, setFormOauthClientId] = useState("");
  const [formOauthClientSecret, setFormOauthClientSecret] = useState("");
  const [formOauthScope, setFormOauthScope] = useState("");
  const [formOauthRedirectUri, setFormOauthRedirectUri] = useState("");

  const [testingUrl, setTestingUrl] = useState(false);
  const [inspectingServer, setInspectingServer] = useState<string | null>(null);
  const [toolsCache, setToolsCache] = useState<Record<string, McpToolInfo[]>>({});
  const [expandedServer, setExpandedServer] = useState<string | null>(null);

  const loadServers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: listData, error: listErr } = await client.web.config.mcp.post({ action: "list" });
      if (listErr) throw new Error(listErr.message ?? t("toast.loadListFailed"));
      const unwrapped = unwrapConfigData(listData) ?? listData;
      const data = Array.isArray(unwrapped) ? unwrapped : ((unwrapped as { servers?: McpServerInfo[] }).servers ?? []);
      setServers(data);
    } catch (e) {
      console.error(t("toast.loadListFailed"), e);
      toast.error(t("toast.loadListFailedWith", { message: e instanceof Error ? e.message : t("toast.saveFailed") }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadServers();
  }, [loadServers]);

  const handleOpenCreate = () => {
    setEditingServer(null);
    setFormName("");
    setFormType("remote");
    setFormCommand("");
    setFormUrl("");
    setFormEnvironment([{ key: "", value: "" }]);
    setFormHeaders([{ key: "", value: "" }]);
    setFormTimeout("");
    setFormOauthClientId("");
    setFormOauthClientSecret("");
    setFormOauthScope("");
    setFormOauthRedirectUri("");
    setOauthExpanded(false);
    setDialogOpen(true);
  };

  const handleOpenEdit = async (server: McpServerInfo) => {
    setEditingServer(server);
    setFormName(server.name);
    try {
      const { data: detailData, error: detailErr } = await client.web.config.mcp.post({
        action: "get",
        name: server.name,
      });
      if (detailErr) throw new Error(detailErr.message ?? t("toast.loadDetailFailed"));
      const detail = unwrapConfigData(detailData) ?? detailData;
      const config = detail.config as McpServerConfig;
      if ("type" in config && config.type === "local") {
        setFormType("local");
        setFormCommand(commandToString(config.command));
        setFormEnvironment(
          config.environment
            ? Object.entries(config.environment).map(([key, value]) => ({ key, value: String(value) }))
            : [{ key: "", value: "" }],
        );
        setFormHeaders([{ key: "", value: "" }]);
        setFormTimeout(config.timeout != null ? String(config.timeout) : "");
        setFormUrl("");
        setFormOauthClientId("");
        setFormOauthClientSecret("");
        setFormOauthScope("");
        setFormOauthRedirectUri("");
        setOauthExpanded(false);
      } else if ("type" in config && config.type === "remote") {
        setFormType("remote");
        setFormUrl(config.url);
        setFormHeaders(
          config.headers
            ? Object.entries(config.headers).map(([key, value]) => ({ key, value: String(value) }))
            : [{ key: "", value: "" }],
        );
        setFormEnvironment([{ key: "", value: "" }]);
        setFormCommand("");
        setFormTimeout(config.timeout != null ? String(config.timeout) : "");
        if (config.oauth && typeof config.oauth === "object") {
          setFormOauthClientId(config.oauth.clientId ?? "");
          setFormOauthClientSecret(config.oauth.clientSecret ?? "");
          setFormOauthScope(config.oauth.scope ?? "");
          setFormOauthRedirectUri(config.oauth.redirectUri ?? "");
          setOauthExpanded(true);
        } else {
          setFormOauthClientId("");
          setFormOauthClientSecret("");
          setFormOauthScope("");
          setFormOauthRedirectUri("");
          setOauthExpanded(false);
        }
      }
    } catch (e) {
      console.error(t("toast.loadDetailFailed"), e);
      toast.error(t("toast.loadDetailFailed"));
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const err = validateMcpForm(formName, formType, formCommand, formUrl, t);
    if (err) {
      console.error(t("toast.saveFailed"), err);
      toast.error(err);
      return;
    }
    setFormSaving(true);
    try {
      const payload = buildMcpPayload(
        formType,
        formCommand,
        formUrl,
        formEnvironment,
        formHeaders,
        formOauthClientId,
        formOauthClientSecret,
        formOauthScope,
        formOauthRedirectUri,
        formTimeout,
      );
      if (editingServer) {
        const { error: updErr } = await client.web.config.mcp.post({ action: "set", name: formName, data: payload });
        if (updErr) throw new Error(updErr.message ?? t("toast.saveFailed"));
        toast.success(t("toast.serverUpdated"));
      } else {
        const { error: crtErr } = await client.web.config.mcp.post({ action: "create", name: formName, data: payload });
        if (crtErr) throw new Error(crtErr.message ?? t("toast.saveFailed"));
        toast.success(t("toast.serverCreated"));
      }
      setDialogOpen(false);
      loadServers();
    } catch (e) {
      console.error(t("toast.saveFailed"), e);
      toast.error(t("toast.saveFailedWith", { message: e instanceof Error ? e.message : t("toast.saveFailed") }));
    } finally {
      setFormSaving(false);
    }
  };

  const handleToggle = async (server: McpServerInfo) => {
    try {
      if (server.enabled) {
        const { error: disErr } = await client.web.config.mcp.post({ action: "disable", name: server.name });
        if (disErr) throw new Error(disErr.message ?? t("toast.disableFailed"));
        toast.success(t("toast.disabled", { name: server.name }));
      } else {
        const { error: enbErr } = await client.web.config.mcp.post({ action: "enable", name: server.name });
        if (enbErr) throw new Error(enbErr.message ?? t("toast.enableFailed"));
        toast.success(t("toast.enabled", { name: server.name }));
      }
      loadServers();
    } catch (e) {
      console.error(t("toast.operationFailed"), e);
      toast.error(t("toast.operationFailedWith", { message: e instanceof Error ? e.message : t("toast.saveFailed") }));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error: delErr } = await client.web.config.mcp.post({ action: "delete", name: deleteTarget });
      if (delErr) throw new Error(delErr.message ?? t("toast.deleteFailed"));
      toast.success(t("toast.serverDeleted"));
      setConfirmOpen(false);
      loadServers();
    } catch (e) {
      console.error(t("toast.deleteFailed"), e);
      toast.error(t("toast.deleteFailedWith", { message: e instanceof Error ? e.message : t("toast.saveFailed") }));
    }
  };

  const handleInspect = async (server: McpServerInfo) => {
    setInspectingServer(server.name);
    try {
      const { data: inspectData, error: inspectErr } = await client.web.config.mcp.post({
        action: "inspect",
        name: server.name,
      });
      if (inspectErr) throw new Error(inspectErr.message ?? t("toast.inspectFailed"));
      const result = unwrapConfigData<McpInspectResult>(inspectData);
      if (!result) {
        const errResp = inspectData as { error?: { code?: string; message?: string } } | null;
        throw new Error(errResp?.error?.message ?? t("toast.inspectFailed"));
      }
      toast.success(
        t("toast.inspectSuccess", {
          name: server.name,
          serverInfo: result.serverInfo.name ?? "",
          version: result.serverInfo.version ?? "",
          toolCount: result.tools.length,
        }),
      );
      loadServers();
      setToolsCache((prev) => ({
        ...prev,
        [server.name]: result.tools.map((toolItem) => ({
          id: `${server.name}:${toolItem.name}`,
          toolName: toolItem.name,
          description: toolItem.description ?? null,
          inputSchema: toolItem.inputSchema ? JSON.stringify(toolItem.inputSchema) : null,
          inspectedAt: Date.now(),
        })),
      }));
      setExpandedServer(server.name);
    } catch (e) {
      console.error(t("toast.inspectFailed"), e);
      toast.error(t("toast.inspectFailedWith", { message: e instanceof Error ? e.message : t("toast.saveFailed") }));
    } finally {
      setInspectingServer(null);
    }
  };

  const handleTestFormUrl = async () => {
    if (!formUrl.trim()) return;
    setTestingUrl(true);
    try {
      const headersObj =
        formHeaders.filter((h) => h.key.trim()).length > 0
          ? Object.fromEntries(formHeaders.filter((h) => h.key.trim()).map((h) => [h.key, h.value]))
          : undefined;
      const timeoutNum = formTimeout ? parseInt(formTimeout, 10) : undefined;
      const { data: testUrlData, error: testUrlErr } = await client.web.config.mcp.post({
        action: "test_url",
        url: formUrl,
        headers: headersObj,
        timeout: timeoutNum,
      });
      if (testUrlErr) throw new Error(testUrlErr.message ?? t("toast.testFailed"));
      const result = unwrapConfigData(testUrlData) ?? testUrlData;
      if (result.reachable && result.protocol) {
        const toolsInfo = result.toolsCount != null ? `，${result.toolsCount} ${t("column.tools").toLowerCase()}` : "";
        toast.success(
          t("toast.testSuccess", {
            serverName: result.serverName ?? "",
            serverVersion: result.serverVersion ?? "",
            toolsInfo,
          }),
        );
      } else if (result.reachable) {
        toast.warning(t("toast.testReachable", { message: result.message ?? "" }));
      } else {
        toast.error(t("toast.testFailed", { message: result.message ?? t("toast.saveFailed") }));
      }
    } catch (e) {
      console.error(t("toast.testFailed"), e);
      toast.error(t("toast.testFailedWith", { message: e instanceof Error ? e.message : t("toast.saveFailed") }));
    } finally {
      setTestingUrl(false);
    }
  };

  const handleBatchAction = (action: "enable" | "disable" | "delete") => {
    setBatchAction(action);
    setBatchConfirmOpen(true);
  };

  const confirmBatchAction = async () => {
    try {
      if (batchAction === "delete") {
        await Promise.all(
          selected.map((s) =>
            client.web.config.mcp
              .post({ action: "delete", name: s.name })
              .then((r: { error?: { message?: string } }) => {
                if (r.error) throw new Error(r.error.message ?? t("toast.deleteFailed"));
              }),
          ),
        );
        toast.success(t("toast.batchDeleted", { count: selected.length }));
      } else if (batchAction === "enable") {
        await Promise.all(
          selected
            .filter((s) => !s.enabled)
            .map((s) =>
              client.web.config.mcp
                .post({ action: "enable", name: s.name })
                .then((r: { error?: { message?: string } }) => {
                  if (r.error) throw new Error(r.error.message ?? t("toast.enableFailed"));
                }),
            ),
        );
        toast.success(t("toast.batchEnabled", { count: selected.length }));
      } else {
        await Promise.all(
          selected
            .filter((s) => s.enabled)
            .map((s) =>
              client.web.config.mcp
                .post({ action: "disable", name: s.name })
                .then((r: { error?: { message?: string } }) => {
                  if (r.error) throw new Error(r.error.message ?? t("toast.disableFailed"));
                }),
            ),
        );
        toast.success(t("toast.batchDisabled", { count: selected.length }));
      }
      setBatchConfirmOpen(false);
      setSelected([]);
      loadServers();
    } catch (e) {
      console.error(t("toast.batchFailed"), e);
      toast.error(t("toast.batchFailedWith", { message: e instanceof Error ? e.message : t("toast.saveFailed") }));
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

  const batchActionLabel =
    batchAction === "delete" ? t("btn.delete") : batchAction === "enable" ? t("btn.enable") : t("btn.disable");

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <AgentPageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={<Button onClick={handleOpenCreate}>{t("btn.newServer")}</Button>}
      />
      <AgentCardList
        items={servers}
        cardKey={(s) => s.name}
        searchPlaceholder={t("search")}
        searchFn={(s, q) => s.name.toLowerCase().includes(q) || (s.summary ?? "").toLowerCase().includes(q)}
        selectable
        selectedItems={selected}
        onSelectionChange={setSelected}
        emptyMessage={t("empty")}
        batchActions={
          <div className="flex gap-1.5">
            <Button size="xs" variant="outline" onClick={() => handleBatchAction("enable")}>
              {t("btn.batchEnable")}
            </Button>
            <Button size="xs" variant="outline" onClick={() => handleBatchAction("disable")}>
              {t("btn.batchDisable")}
            </Button>
            <Button size="xs" variant="destructive" onClick={() => handleBatchAction("delete")}>
              {t("btn.batchDelete")}
            </Button>
          </div>
        }
        renderCard={(server, isSelected, toggleSelect) => {
          const isExpanded = expandedServer === server.name;
          const tools = toolsCache[server.name];
          return (
            <div className="rounded-lg border border-border-light bg-surface-1 transition-colors hover:border-border-active hover:shadow-sm overflow-hidden">
              <div className="group flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={isSelected} onChange={toggleSelect} className="rounded border-border" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium text-text-bright">{server.name}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                        server.type === "local"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : server.type === "remote"
                            ? "bg-cyan-subtle text-cyan dark:text-cyan"
                            : "bg-surface-2 text-text-muted"
                      }`}
                    >
                      {server.type === "local" ? "Local" : server.type === "remote" ? "Remote" : t("disabled")}
                    </span>
                    <span
                      className={`inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded-full text-xs font-medium ${
                        server.enabled
                          ? "bg-brand-subtle text-brand dark:text-brand-light"
                          : "bg-surface-2 text-text-muted"
                      }`}
                    >
                      {server.enabled ? t("btn.enable") : t("btn.disable")}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-text-secondary mt-1 truncate">{server.summary || "—"}</p>
                  {(server.toolsCount ?? 0) > 0 && (
                    <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-xs bg-surface-2 text-text-muted">
                      {server.toolsCount} {t("column.tools").toLowerCase()}
                    </span>
                  )}
                </div>
                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={inspectingServer === server.name}
                    onClick={() => handleInspect(server)}
                  >
                    {inspectingServer === server.name ? t("btn.inspecting") : t("btn.inspect")}
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => handleToggle(server)}>
                    {server.enabled ? t("btn.disable") : t("btn.enable")}
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => handleOpenEdit(server)}>
                    {t("btn.edit")}
                  </Button>
                  <Button
                    size="xs"
                    variant="destructive"
                    onClick={() => {
                      setDeleteTarget(server.name);
                      setConfirmOpen(true);
                    }}
                  >
                    {t("btn.delete")}
                  </Button>
                  {tools && tools.length > 0 && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => setExpandedServer(isExpanded ? null : server.name)}
                    >
                      {isExpanded ? "▲" : "▼"}
                    </Button>
                  )}
                </div>
              </div>
              {isExpanded && tools && tools.length > 0 && (
                <div className="border-t border-border-subtle px-4 py-3 bg-surface-2/30 grid gap-2 max-h-72 overflow-y-auto">
                  {tools.map((tool) => (
                    <div key={tool.id} className="rounded-lg border border-border-light bg-surface-1 px-3 py-2.5">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-sm font-medium text-text-bright">{tool.toolName}</span>
                          {tool.description && (
                            <p className="mt-0.5 text-xs text-text-secondary line-clamp-2">{tool.description}</p>
                          )}
                        </div>
                        {tool.inputSchema ? (
                          <details className="shrink-0">
                            <summary className="text-xs text-text-muted cursor-pointer hover:text-text-primary">
                              {t("form.parameters")}
                            </summary>
                            <pre className="mt-2 text-xs p-2.5 bg-surface-2 rounded-lg overflow-x-auto max-h-40 min-w-[200px] font-mono">
                              {(() => {
                                try {
                                  return JSON.stringify(JSON.parse(tool.inputSchema), null, 2);
                                } catch {
                                  return tool.inputSchema;
                                }
                              })()}
                            </pre>
                          </details>
                        ) : (
                          <span className="shrink-0 text-xs text-text-muted">{t("form.noParameters")}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        }}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingServer ? t("dialog.editTitle") : t("dialog.createTitle")}
        onSubmit={handleSave}
        loading={formSaving}
        width="sm:max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-text-primary">{t("form.name")}</label>
            <Input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              disabled={!!editingServer}
              placeholder="my-mcp-server"
              className="mt-1 font-mono text-sm"
            />
            {editingServer && <p className="text-xs text-text-muted mt-1">{t("dialog.nameImmutable")}</p>}
          </div>
          <div>
            <label className="text-sm font-medium text-text-primary">{t("form.type")}</label>
            <p className="text-xs text-text-muted mb-1.5">
              {formType === "local" ? t("form.typeLocalDesc") : t("form.typeRemoteDesc")}
            </p>
            <Select
              value={formType}
              onValueChange={(v) => setFormType(v as "local" | "remote")}
              disabled={!!editingServer}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">{t("form.typeLocalOption")}</SelectItem>
                <SelectItem value="remote">{t("form.typeRemoteOption")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formType === "local" && (
            <>
              <div>
                <label className="text-sm font-medium text-text-primary">{t("form.command")}</label>
                <p className="text-xs text-text-muted mb-1.5">{t("form.commandHint")}</p>
                <Input
                  value={formCommand}
                  onChange={(e) => setFormCommand(e.target.value)}
                  placeholder="npx @anthropic/mcp-server-xxx --arg1 val1"
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-text-primary">{t("form.environment")}</label>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setFormEnvironment([...formEnvironment, { key: "", value: "" }])}
                  >
                    {t("btn.add")}
                  </Button>
                </div>
                <div className="space-y-2">
                  {formEnvironment.map((entry, idx) => (
                    <div key={entry.key || `env-${idx}`} className="flex gap-2 items-center">
                      <Input
                        placeholder="KEY"
                        value={entry.key}
                        onChange={(e) => {
                          const next = [...formEnvironment];
                          next[idx] = { ...next[idx], key: e.target.value };
                          setFormEnvironment(next);
                        }}
                        className="flex-1 font-mono text-sm"
                      />
                      <Input
                        placeholder="VALUE"
                        value={entry.value}
                        onChange={(e) => {
                          const next = [...formEnvironment];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setFormEnvironment(next);
                        }}
                        className="flex-1 text-sm"
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="text-text-muted hover:text-destructive shrink-0"
                        onClick={() => setFormEnvironment(formEnvironment.filter((_, i) => i !== idx))}
                      >
                        {t("btn.delete")}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
          {formType === "remote" && (
            <>
              <div>
                <label className="text-sm font-medium text-text-primary">{t("form.url")}</label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={formUrl}
                    onChange={(e) => setFormUrl(e.target.value)}
                    placeholder="https://example.com/mcp"
                    className="flex-1 font-mono text-sm"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={testingUrl || !formUrl.trim()}
                    onClick={handleTestFormUrl}
                  >
                    {testingUrl ? t("btn.testing") : t("btn.test")}
                  </Button>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-text-primary">{t("form.headers")}</label>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => setFormHeaders([...formHeaders, { key: "", value: "" }])}
                  >
                    {t("btn.add")}
                  </Button>
                </div>
                <div className="space-y-2">
                  {formHeaders.map((entry, idx) => (
                    <div key={entry.key || `header-${idx}`} className="flex gap-2 items-center">
                      <Input
                        placeholder="Header Name"
                        value={entry.key}
                        onChange={(e) => {
                          const next = [...formHeaders];
                          next[idx] = { ...next[idx], key: e.target.value };
                          setFormHeaders(next);
                        }}
                        className="flex-1 text-sm"
                      />
                      <Input
                        placeholder="Header Value"
                        value={entry.value}
                        onChange={(e) => {
                          const next = [...formHeaders];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setFormHeaders(next);
                        }}
                        className="flex-1 text-sm"
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        className="text-text-muted hover:text-destructive shrink-0"
                        onClick={() => setFormHeaders(formHeaders.filter((_, i) => i !== idx))}
                      >
                        {t("btn.delete")}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <Collapsible open={oauthExpanded} onOpenChange={setOauthExpanded}>
                <div className="rounded-lg border border-border-light">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-text-primary hover:bg-surface-hover transition-colors">
                    {t("form.oauthConfig")}
                    <span className="text-xs text-text-muted">
                      {oauthExpanded ? t("form.oauthCollapse") : t("form.oauthExpand")}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-4 px-4 pb-4 border-t border-border-light pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-text-primary">{t("form.clientId")}</label>
                          <Input
                            value={formOauthClientId}
                            onChange={(e) => setFormOauthClientId(e.target.value)}
                            placeholder={t("form.optional")}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-text-primary">{t("form.clientSecret")}</label>
                          <Input
                            type="password"
                            value={formOauthClientSecret}
                            onChange={(e) => setFormOauthClientSecret(e.target.value)}
                            placeholder={t("form.optional")}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-text-primary">{t("form.scope")}</label>
                          <Input
                            value={formOauthScope}
                            onChange={(e) => setFormOauthScope(e.target.value)}
                            placeholder={t("form.optional")}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-text-primary">{t("form.redirectUri")}</label>
                          <Input
                            value={formOauthRedirectUri}
                            onChange={(e) => setFormOauthRedirectUri(e.target.value)}
                            placeholder={t("form.optional")}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            </>
          )}
          <div>
            <label className="text-sm font-medium text-text-primary">{t("form.timeout")}</label>
            <p className="text-xs text-text-muted mb-1.5">{t("form.timeoutHint")}</p>
            <Input
              type="number"
              value={formTimeout}
              onChange={(e) => setFormTimeout(e.target.value)}
              placeholder="5000"
              min={1}
              className="font-mono text-sm"
            />
          </div>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t("confirm.deleteTitle")}
        description={t("confirm.deleteDescription", { name: deleteTarget ?? "" })}
        variant="destructive"
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={batchConfirmOpen}
        onOpenChange={setBatchConfirmOpen}
        title={t("confirm.batchTitle", { action: batchActionLabel })}
        description={t("confirm.batchDescription", {
          action: batchActionLabel,
          count: selected.length,
          hint: batchAction === "delete" ? t("confirm.batchDeleteHint") : "",
        })}
        variant={batchAction === "delete" ? "destructive" : "default"}
        onConfirm={confirmBatchAction}
      />
    </div>
  );
}
