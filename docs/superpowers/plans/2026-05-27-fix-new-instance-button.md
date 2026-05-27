# 修复 v2 面板"新建实例"按钮 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 v2 Agent 面板中"新建实例"按钮无法创建新实例的 bug，使其正确调用 spawn 接口而非 enter 接口。

**Architecture:** 前端 `AgentSidebarTree.tsx` 的 `handleEnterAgent` 函数目前对所有场景（新建/进入已有实例）都调用 `envApi.enter()`，而 `enter` 内部的 `ensureRunning` 会复用已有运行实例。修复方案：将"新建实例"按钮的逻辑改为先 `instanceApi.spawn()` 创建新实例，再 `envApi.enter()` 带 `instance_number` 进入该实例。

**Tech Stack:** React 19, TypeScript, @fenix/sdk (InstanceApi/EnvironmentApi)

---

### Task 1: 修改 handleEnterAgent 区分"新建"和"进入已有实例"

**Files:**
- Modify: `web/src/pages/agent-panel/AgentSidebarTree.tsx:142-188`

**背景知识：**
- `instanceApi` 已在文件第 5 行导入，有 `.spawn({ environmentId })` 方法 → `POST /web/instances/from-environment`
- `envApi.enter({ id }, { instance_number })` → `POST /web/environments/:id/enter`，传入 `instance_number` 时直接查找该编号实例，不触发 `ensureRunning` 的复用逻辑
- `instanceApi.spawn()` 返回 `{ data: { id, environment_id, instance_number, status, ... } }`（参见 `packages/sdk/src/types/schemas.ts:232-248`）
- `envApi.enter()` 返回 `{ data: { session_id, instance_id, environment_id, ... } }`

- [ ] **Step 1: 修改 handleEnterAgent 函数，增加 `spawnNew` 参数区分新建/进入**

将 `handleEnterAgent` 的签名增加 `spawnNew?: boolean` 参数。当 `spawnNew=true` 时，走 spawn → enter 流程；否则保持原来的 enter 逻辑。

```typescript
// 进入智能体：如果没有 environment 则自动创建
const handleEnterAgent = useCallback(
  async (node: AgentTreeNode, instanceNumber?: number) => {
    const { agent, environment } = node;
    setEnteringAgentId(agent.id);
    try {
      let envId = environment?.id;

      // 没有 environment，自动创建
      if (!envId) {
        const { data: newEnv } = await envApi.create({
          name: agent.name,
          agentConfigId: agent.id,
          autoStart: true,
        });
        envId = (newEnv as unknown as Environment | null)?.id;
        if (!envId) {
          toast.error(t("enterInstanceFailed", { message: "Failed to create environment" }));
          return;
        }
        // 刷新数据以关联新建的 environment
        await loadData();
      }

      // 进入 environment（复用已有实例）
      const body = instanceNumber !== undefined ? { instance_number: instanceNumber } : {};
      const { data: result } = await envApi.enter({ id: envId }, body);
      const enterResult = result as { session_id?: string; instance_id?: string; environment_id?: string } | null;
      onSelectInstance(
        enterResult?.instance_id ?? "",
        enterResult?.environment_id ?? envId,
        enterResult?.session_id ?? null,
      );
      // 刷新列表以展示新实例
      loadData();
    } catch (err) {
      console.error("Failed to enter instance:", err);
      toast.error(
        t("enterInstanceFailed", {
          message: (err as Error).message,
        }),
      );
    } finally {
      setEnteringAgentId(null);
    }
  },
  [onSelectInstance, t, loadData],
);
```

替换为：

```typescript
// 进入智能体：如果没有 environment 则自动创建
const handleEnterAgent = useCallback(
  async (node: AgentTreeNode, opts?: { instanceNumber?: number; spawnNew?: boolean }) => {
    const { agent, environment } = node;
    const { instanceNumber, spawnNew } = opts ?? {};
    setEnteringAgentId(agent.id);
    try {
      let envId = environment?.id;

      // 没有 environment，自动创建
      if (!envId) {
        const { data: newEnv } = await envApi.create({
          name: agent.name,
          agentConfigId: agent.id,
          autoStart: true,
        });
        envId = (newEnv as unknown as Environment | null)?.id;
        if (!envId) {
          toast.error(t("enterInstanceFailed", { message: "Failed to create environment" }));
          return;
        }
        // 刷新数据以关联新建的 environment
        await loadData();
      }

      // 新建实例：先 spawn，再 enter 指定 instance_number
      if (spawnNew) {
        const { data: spawnResult } = await instanceApi.spawn({ environmentId: envId });
        const spawned = spawnResult as { instance_number?: number } | null;
        const newInstanceNumber = spawned?.instance_number;
        if (newInstanceNumber !== undefined) {
          const { data: result } = await envApi.enter({ id: envId }, { instance_number: newInstanceNumber });
          const enterResult = result as { session_id?: string; instance_id?: string; environment_id?: string } | null;
          onSelectInstance(
            enterResult?.instance_id ?? "",
            enterResult?.environment_id ?? envId,
            enterResult?.session_id ?? null,
          );
        }
      } else {
        // 进入已有实例
        const body = instanceNumber !== undefined ? { instance_number: instanceNumber } : {};
        const { data: result } = await envApi.enter({ id: envId }, body);
        const enterResult = result as { session_id?: string; instance_id?: string; environment_id?: string } | null;
        onSelectInstance(
          enterResult?.instance_id ?? "",
          enterResult?.environment_id ?? envId,
          enterResult?.session_id ?? null,
        );
      }

      // 刷新列表以展示新实例
      loadData();
    } catch (err) {
      console.error("Failed to enter instance:", err);
      toast.error(
        t("enterInstanceFailed", {
          message: (err as Error).message,
        }),
      );
    } finally {
      setEnteringAgentId(null);
    }
  },
  [onSelectInstance, t, loadData],
);
```

- [ ] **Step 2: 修改"新建实例"按钮的 onClick 调用**

将"新建实例"按钮的 `onClick` 从 `handleEnterAgent(node)` 改为 `handleEnterAgent(node, { spawnNew: true })`。

找到第 285 行附近的代码：

```tsx
                  onClick={() => handleEnterAgent(node)}
```

替换为：

```tsx
                  onClick={() => handleEnterAgent(node, { spawnNew: true })}
```

- [ ] **Step 3: 修改已有实例行的 onClick 调用**

将已有实例行的 `onClick` 从 `handleEnterAgent(node, inst.instance_number)` 改为 `handleEnterAgent(node, { instanceNumber: inst.instance_number })`。

找到第 297 行附近的代码：

```tsx
                        onClick={() => handleEnterAgent(node, inst.instance_number)}
```

替换为：

```tsx
                        onClick={() => handleEnterAgent(node, { instanceNumber: inst.instance_number })}
```

- [ ] **Step 4: 构建 + 手动验证**

```bash
bun run build:web
```

在浏览器中验证：
1. 点击某个 Agent 的展开箭头
2. 点击"新建实例"按钮 → 应在 sidebar 中看到新实例出现
3. 点击已有实例行 → 应进入对应实例的聊天界面
4. 再次点击"新建实例" → 应再创建一个新实例（不是复用）

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/agent-panel/AgentSidebarTree.tsx
git commit -m "fix: v2 面板新建实例按钮改为调用 spawn 接口而非 enter"
```
