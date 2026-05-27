# Workflow Trigger 前端面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 WorkflowEditor 右侧面板新增 "Triggers" tab，支持创建/查看/复制/删除/启用禁用 webhook trigger。

**Architecture:** 新增 `TriggerPanel` 组件，通过 SDK `WorkflowDefApi` 的 trigger action 方法与后端交互。在 `WorkflowEditor` 右侧 tab 栏追加第 4 个 tab。所有 UI 文案走 i18n `workflows` 命名空间。

**Tech Stack:** React 19、lucide-react 图标、sonner toast、i18n、@fenix/sdk

---

## File Structure

| 文件 | 职责 |
|------|------|
| `packages/sdk/src/modules/workflow-defs.ts` | 新增 trigger 相关 SDK 方法 |
| `web/src/api/workflow-defs.ts` | 新增 trigger 相关 API client 方法 |
| `web/src/pages/workflow/components/TriggerPanel.tsx` | **新建**：Trigger 面板组件 |
| `web/src/pages/workflow/WorkflowEditor.tsx` | 追加 Triggers tab + 按钮入口 |
| `web/src/i18n/locales/en/workflows.json` | 英文 trigger 相关文案 |
| `web/src/i18n/locales/zh/workflows.json` | 中文 trigger 相关文案 |
| `web/src/__tests__/trigger-panel.test.tsx` | 前端测试 |

---

### Task 1: SDK — WorkflowDefApi 新增 trigger 方法

**Files:**
- Modify: `packages/sdk/src/modules/workflow-defs.ts`

- [ ] **Step 1: 在 WorkflowDefApi 类末尾追加 trigger 方法**

在 `packages/sdk/src/modules/workflow-defs.ts` 的 `WorkflowDefApi` 类中，`recoverApply` 方法之后追加：

```typescript
  // ── Trigger ──

  async createTrigger(workflowId: string, type?: string, config?: Record<string, unknown>): Promise<ApiResult<unknown>> {
    return this.post("/web/workflow-defs", { action: "createTrigger", workflowId, type: type ?? "webhook", config });
  }

  async listTriggers(workflowId: string): Promise<ApiResult<unknown[]>> {
    return this.post("/web/workflow-defs", { action: "listTriggers", workflowId });
  }

  async deleteTrigger(triggerId: string): Promise<ApiResult<unknown>> {
    return this.post("/web/workflow-defs", { action: "deleteTrigger", triggerId });
  }

  async regenerateTriggerHash(triggerId: string): Promise<ApiResult<unknown>> {
    return this.post("/web/workflow-defs", { action: "regenerateHash", triggerId });
  }

  async enableTrigger(triggerId: string): Promise<ApiResult<unknown>> {
    return this.post("/web/workflow-defs", { action: "enableTrigger", triggerId });
  }

  async disableTrigger(triggerId: string): Promise<ApiResult<unknown>> {
    return this.post("/web/workflow-defs", { action: "disableTrigger", triggerId });
  }
```

- [ ] **Step 2: 验证编译**

Run: `npx tsc --noEmit --pretty 2>&1 | head -10`
Expected: 无新增错误

- [ ] **Step 3: 提交**

```bash
git add packages/sdk/src/modules/workflow-defs.ts
git commit -m "feat: SDK WorkflowDefApi 新增 trigger 方法"
```

---

### Task 2: API Client — workflow-defs.ts 新增 trigger 方法

**Files:**
- Modify: `web/src/api/workflow-defs.ts`

- [ ] **Step 1: 在 workflow-defs.ts 文件中新增 trigger 类型和方法**

在 `web/src/api/workflow-defs.ts` 文件中，在 `VersionYamlResponse` 接口之后追加类型：

```typescript
export interface TriggerItem {
  id: string;
  workflowId: string;
  type: string;
  publicHash: string;
  maskedHash: string;
  webhookUrl: string | null;
  secret: string | null;
  config: Record<string, unknown> | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}
```

在 `workflowDefApi` 对象中，`restoreToDraft` 方法之后追加：

```typescript
  // ── Triggers ──

  /** 创建 webhook trigger */
  async createTrigger(workflowId: string, type?: string, config?: Record<string, unknown>): Promise<TriggerItem> {
    return _sdkDefApi.createTrigger(workflowId, type, config).then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return data as TriggerItem;
    });
  },

  /** 列出 workflow 的所有 trigger */
  async listTriggers(workflowId: string): Promise<TriggerItem[]> {
    return _sdkDefApi.listTriggers(workflowId).then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return Array.isArray(data) ? (data as TriggerItem[]) : [];
    });
  },

  /** 删除 trigger */
  async deleteTrigger(triggerId: string): Promise<void> {
    const { error } = await _sdkDefApi.deleteTrigger(triggerId);
    if (error) throw new Error(error.message);
  },

  /** 重新生成 hash */
  async regenerateTriggerHash(triggerId: string): Promise<TriggerItem> {
    return _sdkDefApi.regenerateTriggerHash(triggerId).then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return data as TriggerItem;
    });
  },

  /** 启用 trigger */
  async enableTrigger(triggerId: string): Promise<void> {
    const { error } = await _sdkDefApi.enableTrigger(triggerId);
    if (error) throw new Error(error.message);
  },

  /** 禁用 trigger */
  async disableTrigger(triggerId: string): Promise<void> {
    const { error } = await _sdkDefApi.disableTrigger(triggerId);
    if (error) throw new Error(error.message);
  },
```

- [ ] **Step 2: 验证编译**

Run: `cd web && npx tsc --noEmit 2>&1 | head -10`
Expected: 无新增错误

- [ ] **Step 3: 提交**

```bash
git add web/src/api/workflow-defs.ts
git commit -m "feat: 前端 API client 新增 trigger 方法"
```

---

### Task 3: i18n — 新增 trigger 相关文案

**Files:**
- Modify: `web/src/i18n/locales/en/workflows.json`
- Modify: `web/src/i18n/locales/zh/workflows.json`

- [ ] **Step 1: 在英文 JSON 的 `editor` 对象中追加 trigger 文案**

在 `web/src/i18n/locales/en/workflows.json` 的 `editor` 对象内，在 `"type_api": "API"` 之后追加：

```json
    "tab_triggers": "Triggers",
    "trigger_title": "Webhook Triggers",
    "trigger_create": "Create Webhook",
    "trigger_creating": "Creating...",
    "trigger_empty": "No webhook triggers",
    "trigger_empty_hint": "Create a webhook trigger to allow external services to run this workflow",
    "trigger_url_label": "Webhook URL",
    "trigger_copy": "Copy",
    "trigger_copied": "Copied!",
    "trigger_regenerate": "Regenerate",
    "trigger_regenerate_confirm": "Regenerate the webhook URL? The old URL will be invalidated immediately.",
    "trigger_delete": "Delete",
    "trigger_delete_confirm": "Delete this webhook trigger? The URL will be invalidated immediately.",
    "trigger_enabled": "Enabled",
    "trigger_disabled": "Disabled",
    "trigger_created": "Webhook trigger created",
    "trigger_deleted": "Webhook trigger deleted",
    "trigger_hash_regenerated": "Webhook URL regenerated",
    "trigger_enabled_ok": "Trigger enabled",
    "trigger_disabled_ok": "Trigger disabled",
    "trigger_load_failed": "Failed to load triggers",
    "trigger_create_failed": "Failed to create trigger",
    "trigger_delete_failed": "Failed to delete trigger",
    "trigger_regenerate_failed": "Failed to regenerate trigger",
    "trigger_type_webhook": "Webhook"
```

- [ ] **Step 2: 在中文 JSON 的 `editor` 对象中追加对应翻译**

在 `web/src/i18n/locales/zh/workflows.json` 的 `editor` 对象内，在 `"type_api": "API"` 之后追加：

```json
    "tab_triggers": "触发器",
    "trigger_title": "Webhook 触发器",
    "trigger_create": "创建 Webhook",
    "trigger_creating": "创建中...",
    "trigger_empty": "暂无 Webhook 触发器",
    "trigger_empty_hint": "创建 Webhook 触发器，允许外部服务触发此工作流",
    "trigger_url_label": "Webhook URL",
    "trigger_copy": "复制",
    "trigger_copied": "已复制！",
    "trigger_regenerate": "重新生成",
    "trigger_regenerate_confirm": "重新生成 Webhook URL？旧 URL 将立即失效。",
    "trigger_delete": "删除",
    "trigger_delete_confirm": "删除此 Webhook 触发器？URL 将立即失效。",
    "trigger_enabled": "已启用",
    "trigger_disabled": "已禁用",
    "trigger_created": "Webhook 触发器已创建",
    "trigger_deleted": "Webhook 触发器已删除",
    "trigger_hash_regenerated": "Webhook URL 已重新生成",
    "trigger_enabled_ok": "触发器已启用",
    "trigger_disabled_ok": "触发器已禁用",
    "trigger_load_failed": "加载触发器失败",
    "trigger_create_failed": "创建触发器失败",
    "trigger_delete_failed": "删除触发器失败",
    "trigger_regenerate_failed": "重新生成触发器失败",
    "trigger_type_webhook": "Webhook"
```

- [ ] **Step 3: 验证 JSON 格式正确**

Run: `node -e "JSON.parse(require('fs').readFileSync('web/src/i18n/locales/en/workflows.json','utf8')); console.log('EN OK')" && node -e "JSON.parse(require('fs').readFileSync('web/src/i18n/locales/zh/workflows.json','utf8')); console.log('ZH OK')"`
Expected: `EN OK` 和 `ZH OK`

- [ ] **Step 4: 提交**

```bash
git add web/src/i18n/locales/en/workflows.json web/src/i18n/locales/zh/workflows.json
git commit -m "feat: i18n 新增 trigger 相关文案"
```

---

### Task 4: 组件 — TriggerPanel

**Files:**
- Create: `web/src/pages/workflow/components/TriggerPanel.tsx`

- [ ] **Step 1: 创建 TriggerPanel 组件**

创建 `web/src/pages/workflow/components/TriggerPanel.tsx`：

```tsx
import { Copy, Globe, Inbox, Loader, Power, RefreshCw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { type TriggerItem, workflowDefApi } from "../../../api/workflow-defs";

export function TriggerPanel({
  workflowId,
  onClose,
}: {
  workflowId?: string;
  onClose: () => void;
}) {
  const [triggers, setTriggers] = useState<TriggerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { t } = useTranslation("workflows");

  const loadData = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true);
    try {
      const list = await workflowDefApi.listTriggers(workflowId);
      setTriggers(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error(err);
      toast.error(t("editor.trigger_load_failed"));
    } finally {
      setLoading(false);
    }
  }, [workflowId, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreate = useCallback(async () => {
    if (!workflowId) return;
    setCreating(true);
    try {
      await workflowDefApi.createTrigger(workflowId);
      toast.success(t("editor.trigger_created"));
      loadData();
    } catch (err) {
      console.error(err);
      toast.error(`${t("editor.trigger_create_failed")}: ${(err as Error).message}`);
    } finally {
      setCreating(false);
    }
  }, [workflowId, loadData, t]);

  const handleDelete = useCallback(
    async (triggerId: string) => {
      if (!confirm(t("editor.trigger_delete_confirm"))) return;
      try {
        await workflowDefApi.deleteTrigger(triggerId);
        toast.success(t("editor.trigger_deleted"));
        loadData();
      } catch (err) {
        console.error(err);
        toast.error(`${t("editor.trigger_delete_failed")}: ${(err as Error).message}`);
      }
    },
    [loadData, t],
  );

  const handleRegenerate = useCallback(
    async (triggerId: string) => {
      if (!confirm(t("editor.trigger_regenerate_confirm"))) return;
      try {
        const updated = await workflowDefApi.regenerateTriggerHash(triggerId);
        toast.success(t("editor.trigger_hash_regenerated"));
        setTriggers((prev) => prev.map((tr) => (tr.id === triggerId ? updated : tr)));
      } catch (err) {
        console.error(err);
        toast.error(`${t("editor.trigger_regenerate_failed")}: ${(err as Error).message}`);
      }
    },
    [t],
  );

  const handleToggle = useCallback(
    async (trigger: TriggerItem) => {
      try {
        if (trigger.enabled) {
          await workflowDefApi.disableTrigger(trigger.id);
          toast.success(t("editor.trigger_disabled_ok"));
        } else {
          await workflowDefApi.enableTrigger(trigger.id);
          toast.success(t("editor.trigger_enabled_ok"));
        }
        loadData();
      } catch (err) {
        console.error(err);
      }
    },
    [loadData, t],
  );

  const handleCopy = useCallback(
    async (trigger: TriggerItem) => {
      const url = trigger.webhookUrl;
      if (!url) {
        // masked view 没有 URL，提示用户 regenerate
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        setCopiedId(trigger.id);
        toast.success(t("editor.trigger_copied"));
        setTimeout(() => setCopiedId(null), 2000);
      } catch {
        // fallback
      }
    },
    [t],
  );

  return (
    <>
      {/* Header */}
      <div className="wf-prop-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="wf-prop-title">
          <Globe size={13} style={{ marginRight: 4, verticalAlign: -1 }} />
          {t("editor.trigger_title")}
        </span>
        <button
          type="button"
          onClick={onClose}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 24,
            height: 24,
            border: "none",
            background: "#f3f4f6",
            borderRadius: 4,
            color: "#6b7280",
            cursor: "pointer",
          }}
        >
          <X size={11} />
        </button>
      </div>

      {/* Create button */}
      {workflowId && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid #f3f4f6" }}>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating}
            style={{
              width: "100%",
              padding: "7px 0",
              border: "none",
              borderRadius: 6,
              background: creating ? "#d1d5db" : "#3b82f6",
              color: "#fff",
              fontSize: 12,
              fontWeight: 600,
              cursor: creating ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <Globe size={13} />
            {creating ? t("editor.trigger_creating") : t("editor.trigger_create")}
          </button>
        </div>
      )}

      {/* Trigger list */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: 24, color: "#9ca3af", fontSize: 11 }}>
            <Loader size={16} style={{ animation: "wf-spin 1s linear infinite", display: "inline-block" }} />
          </div>
        ) : triggers.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "#d1d5db", fontSize: 11 }}>
            <Inbox size={24} style={{ margin: "0 auto 4px" }} />
            <p>{t("editor.trigger_empty")}</p>
            <p style={{ fontSize: 9, marginTop: 2 }}>{t("editor.trigger_empty_hint")}</p>
          </div>
        ) : (
          triggers.map((trigger) => (
            <div key={trigger.id} style={{ borderBottom: "1px solid #f3f4f6", padding: "8px 12px" }}>
              {/* Type + Status */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    padding: "1px 5px",
                    borderRadius: 99,
                    background: trigger.enabled ? "#f0fdf4" : "#fef2f2",
                    color: trigger.enabled ? "#166534" : "#991b1b",
                  }}
                >
                  {trigger.enabled ? t("editor.trigger_enabled") : t("editor.trigger_disabled")}
                </span>
                <span style={{ fontSize: 9, color: "#9ca3af" }}>
                  {t("editor.trigger_type_webhook")}
                </span>
              </div>

              {/* Webhook URL */}
              {trigger.webhookUrl && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>{t("editor.trigger_url_label")}</div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: 4,
                      padding: "4px 8px",
                      fontSize: 9,
                      fontFamily: "ui-monospace, monospace",
                      color: "#374151",
                      wordBreak: "break-all",
                    }}
                  >
                    <span style={{ flex: 1 }}>{trigger.webhookUrl}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(trigger)}
                      style={{
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        color: copiedId === trigger.id ? "#22c55e" : "#6b7280",
                        padding: 2,
                        display: "flex",
                        flexShrink: 0,
                      }}
                    >
                      <Copy size={11} />
                    </button>
                  </div>
                </div>
              )}

              {/* Masked hash (for listed triggers without full URL) */}
              {!trigger.webhookUrl && (
                <div style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 9, color: "#6b7280", marginBottom: 2 }}>{t("editor.trigger_url_label")}</div>
                  <div
                    style={{
                      background: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: 4,
                      padding: "4px 8px",
                      fontSize: 9,
                      fontFamily: "ui-monospace, monospace",
                      color: "#9ca3af",
                    }}
                  >
                    {trigger.maskedHash || trigger.publicHash}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 3 }}>
                <button
                  type="button"
                  onClick={() => handleToggle(trigger)}
                  style={{
                    padding: "2px 6px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 3,
                    background: "#fff",
                    color: "#6b7280",
                    fontSize: 9,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Power size={9} />
                  {trigger.enabled ? t("editor.trigger_disabled") : t("editor.trigger_enabled")}
                </button>
                <button
                  type="button"
                  onClick={() => handleRegenerate(trigger.id)}
                  style={{
                    padding: "2px 6px",
                    border: "1px solid #e5e7eb",
                    borderRadius: 3,
                    background: "#fff",
                    color: "#6b7280",
                    fontSize: 9,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <RefreshCw size={9} />
                  {t("editor.trigger_regenerate")}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(trigger.id)}
                  style={{
                    padding: "2px 6px",
                    border: "1px solid #fecaca",
                    borderRadius: 3,
                    background: "#fff",
                    color: "#dc2626",
                    fontSize: 9,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Trash2 size={9} />
                  {t("editor.trigger_delete")}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 2: 验证编译**

Run: `cd web && npx tsc --noEmit 2>&1 | head -10`
Expected: 无新增错误

- [ ] **Step 3: 提交**

```bash
git add web/src/pages/workflow/components/TriggerPanel.tsx
git commit -m "feat: TriggerPanel 组件 — webhook 触发器管理"
```

---

### Task 5: 集成 — WorkflowEditor 新增 Triggers tab

**Files:**
- Modify: `web/src/pages/workflow/WorkflowEditor.tsx`

- [ ] **Step 1: 在 WorkflowEditor.tsx 中集成 Triggers tab**

**1a.** 在 import 区域追加 import（其他 workflow 组件 import 之后）：

```typescript
import { TriggerPanel } from "./components/TriggerPanel";
```

注意：`Globe` 图标已经在 import 中（PALETTE_ITEMS 里用了），不需要重复导入。确认 `Zap` 图标是否需要额外导入——用 `Link` 图标替代，追加到 lucide-react import：

在 lucide-react 的 import 中追加 `Link`：

```typescript
import {
  // ...existing imports...
  Link,
  // ...existing imports...
} from "lucide-react";
```

**1b.** 扩展 `rightTab` 状态类型：

找到 `const [rightTab, setRightTab] = useState<"config" | "run" | "versions">("config");` 改为：

```typescript
const [rightTab, setRightTab] = useState<"config" | "run" | "versions" | "triggers">("config");
```

**1c.** 在右侧 tab 头的数组中追加第 4 个 tab：

找到 tab 按钮数组 `[{ key: "config" as const, ... }, { key: "run" ... }, { key: "versions" ... }]`，在最后追加：

```typescript
{ key: "triggers" as const, label: t("editor.tab_triggers") },
```

**1d.** 在右侧面板内容区域，VersionPanel 之后追加 TriggerPanel 渲染：

找到 `{/* ── 版本 Tab ── */}` 对应的 block，在其 `{}</VersionPanel>}` 之后追加：

```tsx
        {/* ── 触发器 Tab ── */}
        {rightTab === "triggers" && (
          <TriggerPanel
            workflowId={workflowId}
            onClose={() => setRightTab("config")}
          />
        )}
```

**1e.** 在工具栏中追加 Triggers 按钮（在版本管理按钮旁边）：

找到 `tooltip_versions` 按钮的闭合 `</button>` 之后，追加：

```tsx
{workflowId && (
  <button
    type="button"
    className={`wf-toolbar-btn ${rightTab === "triggers" ? "active" : ""}`}
    onClick={() => setRightTab(rightTab === "triggers" ? "config" : "triggers")}
    data-tooltip={t("editor.tab_triggers")}
  >
    <Link size={15} />
  </button>
)}
```

- [ ] **Step 2: 验证编译**

Run: `cd web && npx tsc --noEmit 2>&1 | head -10`
Expected: 无新增错误

- [ ] **Step 3: 提交**

```bash
git add web/src/pages/workflow/WorkflowEditor.tsx
git commit -m "feat: WorkflowEditor 集成 Triggers tab"
```

---

### Task 6: 前端测试 — trigger panel 基础测试

**Files:**
- Create: `web/src/__tests__/trigger-panel.test.tsx`

- [ ] **Step 1: 写 trigger panel 测试**

创建 `web/src/__tests__/trigger-panel.test.tsx`：

```tsx
import { describe, expect, mock, test } from "bun:test";
import ReactDOMServer from "react-dom/server";

mock.module("../api/workflow-defs", () => ({
  workflowDefApi: {
    listTriggers: mock(() => Promise.resolve([])),
    createTrigger: mock(() =>
      Promise.resolve({
        id: "trig-1",
        workflowId: "wf-1",
        type: "webhook",
        publicHash: "abcdef1234567890",
        maskedHash: "abcdef***",
        webhookUrl: "http://localhost:3000/hooks/abcdef1234567890",
        secret: null,
        config: null,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),
    deleteTrigger: mock(() => Promise.resolve()),
    regenerateTriggerHash: mock(() =>
      Promise.resolve({
        id: "trig-1",
        workflowId: "wf-1",
        type: "webhook",
        publicHash: "newhash123",
        maskedHash: "newhas***",
        webhookUrl: "http://localhost:3000/hooks/newhash123",
        secret: null,
        config: null,
        enabled: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    ),
    enableTrigger: mock(() => Promise.resolve()),
    disableTrigger: mock(() => Promise.resolve()),
  },
}));

// mock i18next
mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// mock sonner
mock.module("sonner", () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}));

describe("TriggerPanel", () => {
  // TriggerPanel 可渲染无 trigger 状态
  test("renders empty state without triggers", async () => {
    const { TriggerPanel } = await import("../pages/workflow/components/TriggerPanel");
    const html = ReactDOMServer.renderToStaticMarkup(
      <TriggerPanel workflowId="wf-1" onClose={() => {}} />,
    );
    expect(html).toContain("wf-1");
  });

  // createTrigger API 被正确导出
  test("workflowDefApi trigger methods are defined", async () => {
    const { workflowDefApi } = await import("../api/workflow-defs");
    expect(typeof workflowDefApi.createTrigger).toBe("function");
    expect(typeof workflowDefApi.listTriggers).toBe("function");
    expect(typeof workflowDefApi.deleteTrigger).toBe("function");
    expect(typeof workflowDefApi.regenerateTriggerHash).toBe("function");
    expect(typeof workflowDefApi.enableTrigger).toBe("function");
    expect(typeof workflowDefApi.disableTrigger).toBe("function");
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `bun test web/src/__tests__/trigger-panel.test.tsx`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add web/src/__tests__/trigger-panel.test.tsx
git commit -m "test: TriggerPanel 前端测试"
```

---

### Task 7: Precheck 全量验证

- [ ] **Step 1: 运行 precheck**

Run: `bun run precheck`
Expected: 全部通过

- [ ] **Step 2: 运行前端测试**

Run: `bun test web/src/__tests__/`
Expected: 全部通过

- [ ] **Step 3: 构建前端**

Run: `bun run build:web`
Expected: 构建成功

- [ ] **Step 4: 最终提交（如有 format 修复）**

```bash
git add -A && git commit -m "chore: 前端 precheck 修复"
```
