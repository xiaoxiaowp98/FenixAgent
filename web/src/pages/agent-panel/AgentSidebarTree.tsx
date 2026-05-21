import { Bot, ChevronDown, ChevronRight, Loader2, Plus, Power, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { client } from "../../api/client";
import { NS } from "../../i18n";
import type { Environment, EnvironmentInstance } from "../../types/index";

interface AgentSidebarTreeProps {
  selectedInstanceId: string | null;
  onSelectInstance: (instanceId: string, envId: string, sessionId: string | null) => void;
  onCreateAgent?: () => void;
}

export function AgentSidebarTree({ selectedInstanceId, onSelectInstance, onCreateAgent }: AgentSidebarTreeProps) {
  const { t } = useTranslation(NS.AGENT_PANEL);
  const [envs, setEnvs] = useState<Environment[]>([]);
  const [instancesMap, setInstancesMap] = useState<Record<string, EnvironmentInstance[]>>({});
  const [collapsedEnvs, setCollapsedEnvs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const { data, error: err } = await client.web.environments.get();
      if (err) {
        console.error("Failed to load environments:", err);
        return;
      }
      const list = Array.isArray(data) ? (data as unknown as Environment[]) : [];
      setEnvs(list);

      const activeEnvs = list.filter((e: Environment) => (e.instances_count ?? 0) > 0);
      if (activeEnvs.length > 0) {
        const results = await Promise.allSettled(
          activeEnvs.map((env: Environment) => client.web.environments({ id: env.id }).instances.get()),
        );
        const newMap: Record<string, EnvironmentInstance[]> = {};
        activeEnvs.forEach((env: Environment, i: number) => {
          const r = results[i];
          if (r.status === "fulfilled") {
            const instData = r.value.data as { instances?: EnvironmentInstance[] } | null;
            newMap[env.id] = instData?.instances ?? [];
          }
        });
        setInstancesMap((prev) => ({ ...prev, ...newMap }));
      }
    } catch (err) {
      console.error("Failed to load agent tree:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const tree = useMemo(() => {
    return envs.map((env) => ({
      env,
      instances: instancesMap[env.id] ?? [],
    }));
  }, [envs, instancesMap]);

  const getInstanceStatus = (instance: EnvironmentInstance) => {
    if (instance.status === "running") return "running";
    if (instance.status === "starting") return "starting";
    if (instance.status === "error") return "error";
    return "stopped";
  };

  const handleStopInstance = useCallback(
    async (instanceId: string) => {
      try {
        await client.web.instances({ id: instanceId }).delete();
        await loadData();
      } catch (err) {
        console.error("Failed to stop instance:", err);
        toast.error(t("stopInstanceFailed", { message: (err as Error).message }));
      }
    },
    [loadData, t],
  );

  const handleEnterInstance = useCallback(
    async (env: Environment, instanceNumber?: number) => {
      try {
        const body = instanceNumber !== undefined ? { instance_number: instanceNumber } : {};
        const { data, error: err } = await client.web.environments({ id: env.id }).enter.post(body);
        if (err) throw new Error(err.message ?? t("enterFailed"));
        const result = data as { session_id: string; instance_id: string; environment_id: string } | null;
        onSelectInstance(result?.instance_id ?? "", result?.environment_id ?? env.id, result?.session_id ?? null);
      } catch (err) {
        console.error("Failed to enter instance:", err);
        toast.error(t("enterInstanceFailed", { message: (err as Error).message }));
      }
    },
    [onSelectInstance, t],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="px-4 py-4 text-center">
        <Bot className="h-8 w-8 mx-auto mb-2 text-text-muted opacity-30" />
        <p className="text-xs text-text-muted">{t("noAgents")}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-2">
      <div className="flex items-center justify-between px-4 pt-1 pb-2">
        <span className="agent-tree-section-title">{t("agents")}</span>
        {onCreateAgent && (
          <button
            type="button"
            onClick={onCreateAgent}
            title={t("createAgent")}
            className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface-hover cursor-pointer transition-colors text-text-dim hover:text-text-primary"
          >
            <Plus className="w-4 h-4" />
          </button>
        )}
      </div>
      {tree.map(({ env, instances }, idx) => {
        const collapsed = !!collapsedEnvs[env.id];
        return (
          <div key={env.id} className={idx > 0 ? "mt-1.5" : ""}>
            <button
              type="button"
              onClick={() => setCollapsedEnvs((prev) => ({ ...prev, [env.id]: !prev[env.id] }))}
              className="agent-tree-env-header"
            >
              {collapsed ? <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />}
              <Bot className="w-4 h-4 flex-shrink-0" />
              <span className="truncate">{env.name}</span>
              {instances.length > 0 && (
                <span className="agent-tree-instance-count">{instances.length}</span>
              )}
            </button>
            {!collapsed && (
              <div className="agent-tree-env-body">
                <button
                  type="button"
                  onClick={() => handleEnterInstance(env)}
                  title={t("newInstance")}
                  className="agent-tree-new-instance"
                >
                  <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{t("newInstance")}</span>
                </button>
                {instances.length > 0
                  ? instances.map((inst) => (
                      <div
                        key={inst.id}
                        className={`agent-tree-instance ${selectedInstanceId === inst.id ? "selected" : ""}`}
                        onClick={() => handleEnterInstance(env, inst.instance_number)}
                      >
                        <span className={`status-dot ${getInstanceStatus(inst)}`} />
                        <span className="truncate">{t("instanceN", { number: inst.instance_number })}</span>
                      </div>
                    ))
                  : null}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
