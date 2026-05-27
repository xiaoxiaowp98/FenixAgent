# v2 智能体列表 UI 优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 优化 v2 Agent 面板侧边栏的智能体列表交互——点击名字进入默认实例，左侧 chevron 展开/折叠，增加重启/停止按钮，配置保存后提示重启。

**Architecture:** 纯前端改动，不新增后端接口。重启通过 `instanceApi.delete` + `instanceApi.spawn` 前端组合调用实现。AgentSidebarTree 重构交互模型，AgentConfigDialog 扩展保存流程。复用已有 AlertDialog 组件。

**Tech Stack:** React 19, TanStack Router, i18next (NS.AGENT_PANEL), shadcn/ui AlertDialog, Tailwind CSS

---

### Task 1: 添加 i18n 翻译

**Files:**
- Modify: `web/src/i18n/locales/en/agentPanel.json`
- Modify: `web/src/i18n/locales/zh/agentPanel.json`

- [ ] **Step 1: 在英文翻译文件中添加新 key**

在 `web/src/i18n/locales/en/agentPanel.json` 末尾添加：

```json
"restart": "Restart",
"stop": "Stop",
"restartAgent": "Restart Agent",
"stopAgent": "Stop Agent",
"restarting": "Restarting...",
"stopping": "Stopping...",
"restartSuccess": "Instance restarted",
"restartFailed": "Restart failed: {{message}}",
"stopSuccess": "Instance stopped",
"restartTitle": "Restart Agent Instances",
"restartDescription": "Select instances to restart. Configuration changes require a restart to take effect.",
"restartConfirm": "Restart Selected",
"restartLater": "Later",
"configSavedRestartTitle": "Configuration Saved",
"configSavedRestartDescription": "Configuration has been saved. Agent instances need to restart for changes to take effect. Restart now?",
"selectAll": "Select All"
```

- [ ] **Step 2: 在中文翻译文件中添加对应 key**

在 `web/src/i18n/locales/zh/agentPanel.json` 末尾添加：

```json
"restart": "重启",
"stop": "停止",
"restartAgent": "重启智能体",
"stopAgent": "停止智能体",
"restarting": "重启中...",
"stopping": "停止中...",
"restartSuccess": "实例已重启",
"restartFailed": "重启失败: {{message}}",
"stopSuccess": "实例已停止",
"restartTitle": "重启智能体实例",
"restartDescription": "选择需要重启的实例。配置更改需要重启才能生效。",
"restartConfirm": "重启选中",
"restartLater": "稍后",
"configSavedRestartTitle": "配置已保存",
"configSavedRestartDescription": "配置已保存，需要重启智能体实例才能生效。是否立即重启？",
"selectAll": "全选"
```

- [ ] **Step 3: Commit**

```bash
git add web/src/i18n/locales/en/agentPanel.json web/src/i18n/locales/zh/agentPanel.json
git commit -m "feat: 添加智能体列表重启/停止相关 i18n 翻译"
```

---

### Task 2: 添加 CSS 样式

**Files:**
- Modify: `web/src/pages/agent-panel/agent-panel.css`

- [ ] **Step 1: 在现有 agent-tree 样式后面添加新样式**

在 `agent-panel.css` 文件中 `.agent-tree-new-instance:hover` 规则之后、`.status-dot` 规则之前，插入以下样式：

```css
/* 智能体行操作按钮 */
.agent-tree-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
}

.agent-tree-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--color-text-dim);
  cursor: pointer;
  transition:
    background 150ms,
    color 150ms;
  padding: 0;
}

.agent-tree-action-btn:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}

.agent-tree-action-btn.active {
  color: var(--color-brand);
}

/* 实例行操作按钮（hover 显示） */
.agent-tree-instance-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: auto;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 150ms;
}

.agent-tree-instance:hover .agent-tree-instance-actions {
  opacity: 1;
}

/* 实例行需要 group 相对定位来支持 hover */
.agent-tree-instance {
  position: relative;
}

/* chevron 可点击区域 */
.agent-tree-chevron {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: none;
  color: var(--color-text-dim);
  cursor: pointer;
  transition:
    background 150ms,
    color 150ms;
  padding: 0;
  flex-shrink: 0;
}

.agent-tree-chevron:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/pages/agent-panel/agent-panel.css
git commit -m "feat: 添加智能体树操作按钮和 hover 显示样式"
```

---

### Task 3: 重构 AgentSidebarTree 交互模型

这是核心改动。将智能体行从"点击整行展开"改为"左侧 chevron 展开 + 点击名字进入实例"，并添加重启/停止按钮。

**Files:**
- Modify: `web/src/pages/agent-panel/AgentSidebarTree.tsx`

- [ ] **Step 1: 添加新的 import 和图标**

在文件顶部的 lucide-react import 中添加 `RotateCw` 和 `Square` 图标：

```typescript
import { Bot, ChevronDown, ChevronRight, Loader2, Plus, RotateCw, Settings, Square } from "lucide-react";
```

添加 AlertDialog 组件 import：

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

添加 Checkbox import（用于多实例重启弹窗）：

```typescript
import { Checkbox } from "@/components/ui/checkbox";
```

- [ ] **Step 2: 添加重启相关 state**

在组件内，`enteringAgentId` state 之后添加：

```typescript
const [restartingIds, setRestartingIds] = useState<Set<string>>(new Set());
const [stoppingIds, setStoppingIds] = useState<Set<string>>(new Set());
const [restartDialogOpen, setRestartDialogOpen] = useState(false);
const [restartTargetNode, setRestartTargetNode] = useState<AgentTreeNode | null>(null);
const [selectedRestartInstances, setSelectedRestartInstances] = useState<Set<string>>(new Set());
```

- [ ] **Step 3: 添加重启和停止的 handler 函数**

在 `handleEnterAgent` 函数之后，添加以下函数：

```typescript
// 获取运行中的实例列表
const getRunningInstances = useCallback((node: AgentTreeNode) => {
  return node.instances.filter((inst) => inst.status === "running" || inst.status === "starting");
}, []);

// 重启单个实例
const handleRestartInstance = useCallback(
  async (node: AgentTreeNode, instance: EnvironmentInstance) => {
    const envId = node.environment?.id;
    if (!envId) return;
    setRestartingIds((prev) => new Set(prev).add(instance.id));
    try {
      await instanceApi.delete({ id: instance.id });
      await instanceApi.spawn({ environmentId: envId });
      await loadData();
      toast.success(t("restartSuccess"));
    } catch (err) {
      console.error("Failed to restart instance:", err);
      toast.error(t("restartFailed", { message: (err as Error).message }));
    } finally {
      setRestartingIds((prev) => {
        const next = new Set(prev);
        next.delete(instance.id);
        return next;
      });
    }
  },
  [t, loadData],
);

// 停止单个实例
const handleStopInstance = useCallback(
  async (instanceId: string) => {
    setStoppingIds((prev) => new Set(prev).add(instanceId));
    try {
      await instanceApi.delete({ id: instanceId });
      await loadData();
      toast.success(t("stopSuccess"));
    } catch (err) {
      console.error("Failed to stop instance:", err);
      toast.error(t("stopInstanceFailed", { message: (err as Error).message }));
    } finally {
      setStoppingIds((prev) => {
        const next = new Set(prev);
        next.delete(instanceId);
        return next;
      });
    }
  },
  [t, loadData],
);

// 智能体行重启按钮：判断单实例直接重启 / 多实例弹窗
const handleRestartAgent = useCallback(
  (node: AgentTreeNode) => {
    const running = getRunningInstances(node);
    if (running.length === 0) {
      toast.info(t("noInstancesToRestart"));
      return;
    }
    if (running.length === 1) {
      handleRestartInstance(node, running[0]);
      return;
    }
    setRestartTargetNode(node);
    setSelectedRestartInstances(new Set(running.map((i) => i.id)));
    setRestartDialogOpen(true);
  },
  [getRunningInstances, handleRestartInstance, t],
);

// 批量重启确认
const handleRestartConfirm = useCallback(async () => {
  if (!restartTargetNode) return;
  const running = getRunningInstances(restartTargetNode);
  const targets = running.filter((inst) => selectedRestartInstances.has(inst.id));
  setRestartDialogOpen(false);
  for (const inst of targets) {
    await handleRestartInstance(restartTargetNode, inst);
  }
  setRestartTargetNode(null);
}, [restartTargetNode, getRunningInstances, selectedRestartInstances, handleRestartInstance]);
```

- [ ] **Step 4: 重构智能体行 JSX**

将现有的智能体行渲染（`treeNodes.map` 内部的 `<div key={agent.id}>` 部分）替换为：

```tsx
{treeNodes.map((node, idx) => {
  const { agent, instances } = node;
  const collapsed = !!collapsedAgents[agent.id];
  const isEntering = enteringAgentId === agent.id;
  const runningInstances = getRunningInstances(node);
  const isRestarting = runningInstances.some((inst) => restartingIds.has(inst.id));
  return (
    <div key={agent.id} className={idx > 0 ? "mt-1.5" : ""}>
      <div className="agent-tree-env-header">
        {/* 左侧 chevron：展开/折叠 */}
        <button
          type="button"
          className="agent-tree-chevron"
          onClick={() =>
            setCollapsedAgents((prev) => ({
              ...prev,
              [agent.id]: !prev[agent.id],
            }))
          }
        >
          {collapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>

        {/* 点击名字区域：进入默认实例 */}
        <button
          type="button"
          disabled={isEntering}
          onClick={() => handleEnterAgent(node)}
          className="flex items-center gap-1 flex-1 min-w-0 bg-transparent border-none cursor-pointer text-inherit p-0 text-left"
        >
          {isEntering ? (
            <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
          ) : (
            <Bot className="w-4 h-4 flex-shrink-0" />
          )}
          <span className="truncate">{agent.name}</span>
          {instances.length > 0 && (
            <span className="agent-tree-instance-count">{instances.length}</span>
          )}
        </button>

        {/* 右侧操作按钮 */}
        <div className="agent-tree-actions">
          <button
            type="button"
            className="agent-tree-action-btn"
            disabled={isRestarting}
            onClick={() => handleRestartAgent(node)}
            title={t("restartAgent")}
          >
            <RotateCw className={`w-3.5 h-3.5 ${isRestarting ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            className="agent-tree-action-btn"
            onClick={() => onEditAgent?.(agent.name)}
            title={t("agentConfig")}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 展开的实例列表 */}
      {!collapsed && (
        <div className="agent-tree-env-body">
          {instances.length > 0
            ? instances.map((inst) => {
                const isInstRestarting = restartingIds.has(inst.id);
                const isInstStopping = stoppingIds.has(inst.id);
                return (
                  <div
                    key={inst.id}
                    className={`agent-tree-instance ${selectedInstanceId === inst.id ? "selected" : ""}`}
                    onClick={() => handleEnterAgent(node, { instanceNumber: inst.instance_number })}
                  >
                    <span className={`status-dot ${getInstanceStatus(inst)}`} />
                    <span className="truncate">
                      {t("instanceN", { number: inst.instance_number })}
                    </span>
                    <div className="agent-tree-instance-actions">
                      <button
                        type="button"
                        className="agent-tree-action-btn"
                        disabled={isInstRestarting}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRestartInstance(node, inst);
                        }}
                        title={t("restart")}
                      >
                        <RotateCw className={`w-3.5 h-3.5 ${isInstRestarting ? "animate-spin" : ""}`} />
                      </button>
                      <button
                        type="button"
                        className="agent-tree-action-btn"
                        disabled={isInstStopping}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStopInstance(inst.id);
                        }}
                        title={t("stop")}
                      >
                        <Square className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            : null}
          {/* 新实例按钮在底部 */}
          <button
            type="button"
            disabled={isEntering}
            onClick={() => handleEnterAgent(node, { spawnNew: true })}
            title={t("newInstance")}
            className="agent-tree-new-instance"
          >
            <Plus className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{t("newInstance")}</span>
          </button>
        </div>
      )}
    </div>
  );
})}
```

- [ ] **Step 5: 在组件 return 末尾添加多实例重启弹窗**

在 `AgentSidebarTree` 组件的 return JSX 最末尾（最外层 `<div>` 的关闭标签之前），添加重启选择弹窗：

```tsx
{/* 多实例重启选择弹窗 */}
<AlertDialog open={restartDialogOpen} onOpenChange={setRestartDialogOpen}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{t("restartTitle")}</AlertDialogTitle>
      <AlertDialogDescription>{t("restartDescription")}</AlertDialogDescription>
    </AlertDialogHeader>
    {restartTargetNode && (
      <div className="space-y-2 max-h-48 overflow-y-auto">
        <label className="flex items-center gap-2 px-2 py-1 text-sm font-medium">
          <Checkbox
            checked={
              getRunningInstances(restartTargetNode).length > 0 &&
              getRunningInstances(restartTargetNode).every((inst) => selectedRestartInstances.has(inst.id))
            }
            onCheckedChange={(checked) => {
              if (checked) {
                setSelectedRestartInstances(new Set(getRunningInstances(restartTargetNode).map((i) => i.id)));
              } else {
                setSelectedRestartInstances(new Set());
              }
            }}
          />
          {t("selectAll")}
        </label>
        {getRunningInstances(restartTargetNode).map((inst) => (
          <label key={inst.id} className="flex items-center gap-2 px-2 py-1 text-sm">
            <Checkbox
              checked={selectedRestartInstances.has(inst.id)}
              onCheckedChange={(checked) => {
                setSelectedRestartInstances((prev) => {
                  const next = new Set(prev);
                  if (checked) next.add(inst.id);
                  else next.delete(inst.id);
                  return next;
                });
              }}
            />
            {t("instanceN", { number: inst.instance_number })}
          </label>
        ))}
      </div>
    )}
    <AlertDialogFooter>
      <AlertDialogCancel>{t("restartLater")}</AlertDialogCancel>
      <AlertDialogAction onClick={handleRestartConfirm} disabled={selectedRestartInstances.size === 0}>
        {t("restartConfirm")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 6: 删除旧的 `_handleStopInstance` 函数**

删除原有的 `_handleStopInstance` 函数（已被新的 `handleStopInstance` 替代）。

- [ ] **Step 7: 检查 Checkbox 组件是否存在**

```bash
ls web/components/ui/checkbox.tsx
```

如果不存在，运行 `bunx shadcn add checkbox` 安装。

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/agent-panel/AgentSidebarTree.tsx
git commit -m "feat: 重构智能体树交互模型——点击名字进入实例，chevron 展开，添加重启/停止按钮"
```

---

### Task 4: AgentConfigDialog 保存后重启提示

**Files:**
- Modify: `web/src/pages/agent-panel/AgentConfigDialog.tsx`

- [ ] **Step 1: 添加 import**

在文件顶部的 import 区域添加：

```typescript
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { instanceApi } from "@/src/api/sdk";
```

- [ ] **Step 2: 添加重启相关 state**

在组件内 `formSaving` state 之后添加：

```typescript
const [restartDialogOpen, setRestartDialogOpen] = useState(false);
const [restarting, setRestarting] = useState(false);
```

- [ ] **Step 3: 添加获取运行中实例的函数**

在 `handleSave` 函数之后添加：

```typescript
const getRunningInstanceIds = useCallback(async () => {
  try {
    // 先通过 agent name 找到 agent config ID
    const { data: agentsResult } = await agentApi.list();
    const rawAgents = (agentsResult as unknown as { agents?: { id: string; name: string }[] } | null)?.agents;
    const agents = Array.isArray(rawAgents) ? rawAgents : [];
    const matchedAgent = agents.find((a) => a.name === agentName);
    if (!matchedAgent) return [];

    // 用 agent config ID 找到对应的 environment
    const { data: envsData } = await envApi.list();
    const envs = Array.isArray(envsData)
      ? (envsData as { id: string; agent_config_id?: string; instances_count?: number }[])
      : [];
    const matchedEnv = envs.find((e) => e.agent_config_id === matchedAgent.id);
    if (!matchedEnv || !(matchedEnv.instances_count ?? 0 > 0)) return [];

    // 获取该 environment 下运行中的实例
    const { data: instData } = await envApi.listInstances({ id: matchedEnv.id });
    const instances = (instData as { instances?: { id: string; status: string; environment_id: string }[] } | null)
      ?.instances ?? [];
    return instances
      .filter((inst) => inst.status === "running" || inst.status === "starting")
      .map((inst) => ({ id: inst.id, environmentId: inst.environment_id }));
  } catch (err) {
    console.error("Failed to get running instances:", err);
    return [];
  }
}, [agentName]);

const handleRestartAfterSave = useCallback(async () => {
  setRestarting(true);
  try {
    const runningInstances = await getRunningInstanceIds();
    for (const inst of runningInstances) {
      await instanceApi.delete({ id: inst.id });
      await instanceApi.spawn({ environmentId: inst.environmentId });
    }
    toast.success(tAgentPanel("restartSuccess"));
  } catch (err) {
    console.error("Failed to restart:", err);
    toast.error(tAgentPanel("restartFailed", { message: (err as Error).message }));
  } finally {
    setRestarting(false);
    setRestartDialogOpen(false);
    onOpenChange(false);
  }
}, [getRunningInstanceIds, tAgentPanel, onOpenChange]);
```

注意：`AgentConfigDialog` 使用 `useTranslation("agents")` 命名空间，而重启相关的翻译在 `agentPanel` 命名空间。需要同时导入 agentPanel 翻译：

在现有 `const { t } = useTranslation("agents");` 后添加：

```typescript
const { t: tAgentPanel } = useTranslation("agentPanel");
```

然后将上面的 `t("restartSuccess")` 改为 `tAgentPanel("restartSuccess")`，`t("restartFailed", ...)` 改为 `tAgentPanel("restartFailed", ...)`。

- [ ] **Step 4: 修改 handleSave 中的保存成功逻辑**

在 `handleSave` 函数中，找到保存成功的处理块（`toast.success(t("save.successUpdate"));` 和 `onOpenChange(false);` 所在位置），替换为：

```typescript
toast.success(t("save.successUpdate"));
dispatchConfigChange("agents");
// 不直接关闭，而是弹出重启确认
setRestartDialogOpen(true);
```

删除原来的 `onOpenChange(false);` 调用。

- [ ] **Step 5: 在 return JSX 末尾添加重启确认弹窗**

在 `AgentConfigDialog` 的 return JSX 中，最外层 `<div>` 的关闭标签之前，添加：

```tsx
<AlertDialog open={restartDialogOpen} onOpenChange={(open) => {
  if (!open) {
    setRestartDialogOpen(false);
    onOpenChange(false);
  }
}}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>{tAgentPanel("configSavedRestartTitle")}</AlertDialogTitle>
      <AlertDialogDescription>{tAgentPanel("configSavedRestartDescription")}</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel
        onClick={() => {
          setRestartDialogOpen(false);
          onOpenChange(false);
        }}
      >
        {tAgentPanel("restartLater")}
      </AlertDialogCancel>
      <AlertDialogAction onClick={handleRestartAfterSave} disabled={restarting}>
        {restarting ? tAgentPanel("restarting") : tAgentPanel("restart")}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 6: 添加 envApi import（如果尚未引入）**

检查文件顶部是否已有 `envApi` 的 import，如果没有则添加到 `agentApi, envApi, kbApi, modelApi, skillConfigApi` 的 import 中。

- [ ] **Step 7: Commit**

```bash
git add web/src/pages/agent-panel/AgentConfigDialog.tsx
git commit -m "feat: AgentConfigDialog 保存后弹出重启确认弹窗"
```

---

### Task 5: 验证和最终提交

- [ ] **Step 1: 运行 precheck**

```bash
bun run precheck
```

Expected: 全部通过（格式化、import 排序、tsc、biome check）

- [ ] **Step 2: 运行前端测试**

```bash
bun test web/src/__tests__/
```

Expected: 全部通过

- [ ] **Step 3: 构建前端确认无编译错误**

```bash
bun run build:web
```

Expected: 构建成功

- [ ] **Step 4: 检查 i18n key 完整性**

确保 `en/agentPanel.json` 和 `zh/agentPanel.json` 中新增的所有 key 完全对齐（key 名称一致），没有遗漏。

```bash
diff <(jq -r 'keys[]' web/src/i18n/locales/en/agentPanel.json | sort) <(jq -r 'keys[]' web/src/i18n/locales/zh/agentPanel.json | sort)
```

Expected: 无输出（key 完全一致）
