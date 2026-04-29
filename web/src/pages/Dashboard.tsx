import { useState, useEffect, useCallback } from "react";
import { apiFetchEnvironments, apiGetEnvironment, apiCreateEnvironment, apiUpdateEnvironment, apiDeleteEnvironment, apiListAgents, apiEnterEnvironment, apiDeleteInstance } from "../api/client";
import type { Environment } from "../types";
import { ConfirmDialog } from "@/components/config/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Bot, Plus, Pencil, Trash2, Loader2, Power } from "lucide-react";

interface DashboardProps {
  onNavigateToSession?: (sessionId: string, options?: { cwd?: string }) => void;
}

export function Dashboard({ onNavigateToSession }: DashboardProps) {
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formWorkspacePath, setFormWorkspacePath] = useState("");
  const [formAgentName, setFormAgentName] = useState("");
  const [formAutoStart, setFormAutoStart] = useState(false);
  const [secretDialogOpen, setSecretDialogOpen] = useState(false);
  const [currentSecret, setCurrentSecret] = useState<string | null>(null);
  const [agentOptions, setAgentOptions] = useState<string[]>([]);
  const [enteringEnvId, setEnteringEnvId] = useState<string | null>(null);

  const loadEnvs = useCallback(async () => {
    try {
      const data = await apiFetchEnvironments();
      setEnvs(data || []);
    } catch (err) {
      console.error("Failed to load environments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEnvs();
    apiListAgents()
      .then((data) => {
        setAgentOptions(data.agents.map((a) => a.name));
      })
      .catch(() => {});
  }, [loadEnvs]);

  const openCreateDialog = useCallback(() => {
    setEditingEnv(null);
    setFormName("");
    setFormDescription("");
    setFormWorkspacePath("");
    setFormAgentName("");
    setFormAutoStart(false);
    setDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((env: Environment) => {
    setEditingEnv(env);
    setFormName(env.name);
    setFormDescription(env.description || "");
    setFormWorkspacePath(env.workspace_path);
    setFormAgentName(env.agent_name || "");
    setFormAutoStart(env.auto_start ?? false);
    setDialogOpen(true);
  }, []);

  const handleFormSubmit = useCallback(async () => {
    if (!formName || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(formName)) {
      alert("名称必须为 kebab-case 格式（小写字母、数字、连字符）");
      return;
    }
    if (!formWorkspacePath.startsWith("/")) {
      alert("workspace 路径必须是绝对路径");
      return;
    }

    setFormSaving(true);
    try {
      if (editingEnv) {
        await apiUpdateEnvironment(editingEnv.id, {
          name: formName,
          description: formDescription || undefined,
          workspacePath: formWorkspacePath,
          agentName: formAgentName || undefined,
          autoStart: formAutoStart,
        });
      } else {
        const result = await apiCreateEnvironment({
          name: formName,
          description: formDescription || undefined,
          workspacePath: formWorkspacePath,
          agentName: formAgentName || undefined,
          autoStart: formAutoStart,
        });
        setCurrentSecret(result.secret);
        setSecretDialogOpen(true);
      }
      setDialogOpen(false);
      await loadEnvs();
    } catch (err) {
      console.error("Failed to save environment:", err);
      alert((err as Error).message);
    } finally {
      setFormSaving(false);
    }
  }, [editingEnv, formName, formDescription, formWorkspacePath, formAgentName, formAutoStart, loadEnvs]);

  const handleEnterAgent = useCallback(async (env: Environment) => {
    if (!onNavigateToSession) return;
    setEnteringEnvId(env.id);
    try {
      const result = await apiEnterEnvironment(env.id);
      onNavigateToSession(result.session_id, { cwd: env.workspace_path });
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setEnteringEnvId(null);
    }
  }, [onNavigateToSession]);

  const handleStopInstance = useCallback(async (instanceId: string) => {
    try {
      await apiDeleteInstance(instanceId);
      await loadEnvs();
    } catch (err) {
      alert((err as Error).message);
    }
  }, [loadEnvs]);

  const handleViewSecret = useCallback(async (id: string) => {
    try {
      const detail = await apiGetEnvironment(id);
      setCurrentSecret(detail.secret);
      setSecretDialogOpen(true);
    } catch (err) {
      console.error("Failed to get secret:", err);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await apiDeleteEnvironment(deleteTarget);
      setDeleteTarget(null);
      setConfirmOpen(false);
      await loadEnvs();
    } catch (err) {
      console.error("Failed to delete environment:", err);
    }
  }, [deleteTarget, loadEnvs]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-text-muted">加载中...</div>
      </div>
    );
  }

  const isOnline = (env: Environment) =>
    env.instance_status === "running" || env.instance_status === "starting";

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-text-primary">智能体</h1>
          <Button onClick={openCreateDialog} size="sm">
            <Plus className="mr-1 h-4 w-4" />
            创建智能体
          </Button>
        </div>

        {envs.length === 0 ? (
          <button
            type="button"
            onClick={openCreateDialog}
            className="flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-surface-1/50 px-6 py-16 text-text-muted transition-colors hover:border-brand/40 hover:bg-brand/5 cursor-pointer"
          >
            <Bot className="mb-3 h-10 w-10 opacity-40" />
            <span className="text-sm font-medium">创建第一个智能体</span>
            <span className="mt-1 text-xs opacity-60">配置工作目录和 Agent 类型，即可开始对话</span>
          </button>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {envs.map((env) => {
              const online = isOnline(env);
              const entering = enteringEnvId === env.id;
              return (
                <div
                  key={env.id}
                  className="group flex flex-col rounded-xl border border-border bg-surface-1 p-4 transition-shadow hover:shadow-md"
                >
                  {/* Header: name + status dot */}
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${online ? "bg-green-500" : "bg-gray-400"}`} />
                      <span className="truncate text-sm font-medium text-text-primary">{env.name}</span>
                      {env.auto_start && (
                        <span className="rounded bg-brand/10 px-1 py-0.5 text-[10px] font-medium text-brand">自启</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openEditDialog(env)}
                        title="编辑"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => handleViewSecret(env.id)}
                        title="查看 Secret"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      </Button>
                      {env.instance_id && online && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                          onClick={() => handleStopInstance(env.instance_id!)}
                          title="停止实例"
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                        onClick={() => { setDeleteTarget(env.id); setConfirmOpen(true); }}
                        title="删除"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Info */}
                  <div className="mb-4 flex-1 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-text-muted">
                      <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      <span className="truncate">{env.workspace_path}</span>
                    </div>
                    {env.agent_name && (
                      <div className="flex items-center gap-1.5 text-xs text-text-muted">
                        <Bot className="h-3 w-3 shrink-0" />
                        <span>{env.agent_name}</span>
                      </div>
                    )}
                    {env.description && (
                      <p className="text-xs text-text-muted line-clamp-2">{env.description}</p>
                    )}
                  </div>

                  {/* Enter button */}
                  <Button
                    className="w-full"
                    size="sm"
                    disabled={entering}
                    onClick={() => handleEnterAgent(env)}
                  >
                    {entering ? (
                      <>
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                        启动中...
                      </>
                    ) : online ? "进入对话" : "启动并进入"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {/* Create/Edit Form Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingEnv ? "编辑智能体" : "创建智能体"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">名称</Label>
                <Input id="name" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="my-agent (kebab-case)" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="description">描述</Label>
                <Input id="description" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="可选" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="workspacePath">Workspace 路径</Label>
                <Input id="workspacePath" value={formWorkspacePath} onChange={(e) => setFormWorkspacePath(e.target.value)} placeholder="/home/user/project" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="agentName">关联 Agent</Label>
                <Select value={formAgentName} onValueChange={setFormAgentName}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择 Agent（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    {agentOptions.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <button
                type="button"
                className="flex items-center gap-2 text-left"
                onClick={() => setFormAutoStart(!formAutoStart)}
              >
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded border ${formAutoStart ? "bg-brand border-brand" : "border-border bg-transparent"}`}>
                  {formAutoStart && (
                    <svg className="h-3 w-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </span>
                <span className="text-sm text-text-primary cursor-pointer">服务器启动时自动运行</span>
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
              <Button onClick={handleFormSubmit} disabled={formSaving}>
                {formSaving ? "保存中..." : editingEnv ? "更新" : "创建"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Secret Display Dialog */}
        <Dialog open={secretDialogOpen} onOpenChange={setSecretDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>智能体 Secret</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <p className="mb-2 text-sm text-text-muted">请立即保存此 Secret，之后将无法再通过列表查看</p>
              <div className="flex items-center gap-2 rounded-md bg-gray-100 p-3 font-mono text-sm break-all dark:bg-gray-800">
                <span className="flex-1">{currentSecret}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (currentSecret) navigator.clipboard.writeText(currentSecret);
                  }}
                >
                  复制
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setSecretDialogOpen(false)}>关闭</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm Dialog */}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title="确认删除"
          description="确定要删除此智能体吗？此操作不可撤销。"
          onConfirm={handleDelete}
        />
      </div>
    </div>
  );
}
