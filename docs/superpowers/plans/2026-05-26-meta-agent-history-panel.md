# Meta Agent 会话历史浮空面板 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 workflow 编辑器的 MetaAgentPanel 左上角添加汉堡菜单按钮，点击弹出浮空面板显示 Meta Agent 的对话历史列表。

**Architecture:** 利用 ChatPanel 已有的 `onClientChange` 回调获取 ACPClient 引用，通过 `client.listSessions()` 加载会话列表，`client.loadSession()` / `client.resumeSession()` 切换会话。浮空面板使用 absolute 定位，复用 ACPMain 中 `SidebarSessionList` 的按日期分组模式。

**Tech Stack:** TypeScript, React 19, lucide-react, react-i18next

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `web/src/pages/workflow/components/MetaAgentPanel.tsx` | 汉堡按钮 + 浮空会话列表面板 |
| Modify | `web/src/i18n/locales/en/workflows.json` | 英文 i18n key |
| Modify | `web/src/i18n/locales/zh/workflows.json` | 中文 i18n key |

---

### Task 1: 新增 i18n key

**Files:**
- Modify: `web/src/i18n/locales/en/workflows.json`
- Modify: `web/src/i18n/locales/zh/workflows.json`

- [ ] **Step 1: 在英文 i18n 文件的 `editor` 对象末尾（`trigger_type_webhook` 之后，`page` 之前）添加 history 相关 key**

在 `"trigger_type_webhook": "Webhook"` 之后、`"page"` 之前添加：

```json
    "trigger_type_webhook": "Webhook",
    "history_title": "History",
    "history_today": "Today",
    "history_yesterday": "Yesterday",
    "history_earlier": "Earlier",
    "history_empty": "No conversations yet",
    "history_loading": "Loading...",
    "history_untitled": "New conversation"
```

- [ ] **Step 2: 在中文 i18n 文件的相同位置添加 history 相关 key**

```json
    "trigger_type_webhook": "Webhook",
    "history_title": "历史记录",
    "history_today": "今天",
    "history_yesterday": "昨天",
    "history_earlier": "更早",
    "history_empty": "暂无对话记录",
    "history_loading": "加载中...",
    "history_untitled": "新对话"
```

- [ ] **Step 3: 提交 i18n 改动**

```bash
git add web/src/i18n/locales/en/workflows.json web/src/i18n/locales/zh/workflows.json
git commit -m "feat: meta agent 会话历史面板 i18n key"
```

---

### Task 2: MetaAgentPanel 添加汉堡按钮和浮空会话列表面板

**Files:**
- Modify: `web/src/pages/workflow/components/MetaAgentPanel.tsx`（当前 69 行）

**关键依赖（不要修改，只使用）：**
- `ChatPanel` 组件有 `onClientChange?: (client: ACPClient | null) => void` prop
- `ACPClient` 接口提供 `listSessions()`、`loadSession()`、`resumeSession()`、`supportsSessionList`、`supportsLoadSession`、`supportsResumeSession`
- `AgentSessionInfo` 类型字段：`{ sessionId: string; cwd: string; title?: string | null; updatedAt?: string | null }`

- [ ] **Step 1: 完整重写 MetaAgentPanel.tsx**

将整个文件替换为以下内容。核心改动点：

1. 导入 `Menu`、`MessageSquare`、`Loader2` 图标
2. 导入 ACPClient 和 AgentSessionInfo 类型
3. 通过 `onClientChange` 回调从 ChatPanel 获取 ACPClient
4. 新增 `historyOpen` / `sessions` / `loading` / `activeSessionId` 状态
5. 头部左侧添加 `Menu` 汉堡按钮
6. 浮空面板：absolute 定位，带阴影和圆角，按"今天/昨天/更早"分组
7. 点击外部关闭（panelRef + useEffect 监听 mousedown）
8. 点击会话项调用 `client.loadSession()` 或 `client.resumeSession()`，然后关闭面板

```tsx
import type { ACPClient } from "../../../acp/client";
import type { AgentSessionInfo } from "../../../acp/types";
import { Bot, ChevronRight, Loader2, Menu, MessageSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChatPanel } from "../../agent-panel/ChatPanel";

interface MetaAgentPanelProps {
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  metaAgentId: string | null;
  scenePrompt: string | undefined;
}

export function MetaAgentPanel({ chatOpen, setChatOpen, metaAgentId, scenePrompt }: MetaAgentPanelProps) {
  const { t } = useTranslation("workflows");
  const [client, setClient] = useState<ACPClient | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<AgentSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // 加载会话列表
  const loadSessions = useCallback(async () => {
    if (!client?.supportsSessionList) return;
    setLoading(true);
    try {
      const response = await client.listSessions();
      setSessions(response.sessions);
    } catch (err) {
      console.warn("[MetaAgentPanel] Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  }, [client]);

  // client 变化时加载会话
  useEffect(() => {
    if (client?.supportsSessionList && client.getState() === "connected") {
      loadSessions();
    }
  }, [client, loadSessions]);

  // 监听 capabilities 变化
  useEffect(() => {
    if (!client) return;
    const onCaps = () => {
      if (client.supportsSessionList) {
        loadSessions();
      }
    };
    client.state.on("capabilitiesChange", onCaps);
    return () => client.state.off("capabilitiesChange", onCaps);
  }, [client, loadSessions]);

  // 点击外部关闭历史面板
  useEffect(() => {
    if (!historyOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [historyOpen]);

  // 切换会话
  const handleSelectSession = useCallback(
    async (session: AgentSessionInfo) => {
      if (!client) return;
      try {
        if (client.supportsLoadSession) {
          await client.loadSession({ sessionId: session.sessionId, cwd: session.cwd });
        } else if (client.supportsResumeSession) {
          await client.resumeSession({ sessionId: session.sessionId, cwd: session.cwd });
        }
        setActiveSessionId(session.sessionId);
        setHistoryOpen(false);
      } catch (err) {
        console.error("[MetaAgentPanel] Failed to load session:", err);
      }
    },
    [client],
  );

  // 按日期分组
  const grouped = useMemo(() => {
    const sorted = [...sessions].sort((a, b) => {
      const ta = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
      const tb = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
      return tb - ta;
    });
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const groups: { label: string; items: AgentSessionInfo[] }[] = [
      { label: t("editor.history_today"), items: [] },
      { label: t("editor.history_yesterday"), items: [] },
      { label: t("editor.history_earlier"), items: [] },
    ];
    for (const s of sorted) {
      const d = s.updatedAt ? new Date(s.updatedAt) : new Date(0);
      if (d >= today) groups[0].items.push(s);
      else if (d >= yesterday) groups[1].items.push(s);
      else groups[2].items.push(s);
    }
    return groups.filter((g) => g.items.length > 0);
  }, [sessions, t]);

  if (!chatOpen) return null;

  return (
    <div
      style={{
        width: 400,
        minWidth: 400,
        display: "flex",
        flexDirection: "column",
        background: "#fff",
        borderLeft: "1px solid #e5e7eb",
        position: "relative",
      }}
    >
      {/* 头部 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <button
            type="button"
            onClick={() => setHistoryOpen(!historyOpen)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              color: historyOpen ? "#3b82f6" : "#6b7280",
              display: "flex",
              alignItems: "center",
              transition: "color 0.15s",
            }}
            title={t("editor.history_title")}
          >
            <Menu size={14} />
          </button>
          <Bot size={14} />
          Meta Agent
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button
            type="button"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              borderRadius: 4,
              color: "#6b7280",
              display: "flex",
              alignItems: "center",
            }}
            onClick={() => setChatOpen(false)}
            title={t("editor.chat_collapse")}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* 浮空会话历史面板 */}
      {historyOpen && (
        <div
          ref={panelRef}
          style={{
            position: "absolute",
            top: 44,
            left: 4,
            width: 260,
            maxHeight: 400,
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            zIndex: 50,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "8px 12px",
              fontSize: 11,
              fontWeight: 600,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            {t("editor.history_title")}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            {loading && sessions.length === 0 ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                <Loader2 size={16} style={{ animation: "wf-spin 1s linear infinite", color: "#9ca3af" }} />
              </div>
            ) : sessions.length === 0 ? (
              <div style={{ padding: 16, textAlign: "center", fontSize: 12, color: "#9ca3af" }}>
                {t("editor.history_empty")}
              </div>
            ) : (
              grouped.map((group, gi) => (
                <div key={group.label}>
                  {gi > 0 && <div style={{ margin: "4px 12px", borderTop: "1px solid #f3f4f6" }} />}
                  <div style={{ padding: "6px 12px 2px", fontSize: 10, fontWeight: 600, color: "#d1d5db", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    {group.label}
                  </div>
                  {group.items.map((session) => (
                    <button
                      key={session.sessionId}
                      type="button"
                      onClick={() => handleSelectSession(session)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        width: "100%",
                        padding: "6px 12px",
                        border: "none",
                        background: session.sessionId === activeSessionId ? "#eff6ff" : "transparent",
                        cursor: "pointer",
                        textAlign: "left",
                        fontSize: 12,
                        color: session.sessionId === activeSessionId ? "#3b82f6" : "#374151",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        if (session.sessionId !== activeSessionId) e.currentTarget.style.background = "#f9fafb";
                      }}
                      onMouseLeave={(e) => {
                        if (session.sessionId !== activeSessionId) e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <MessageSquare size={13} style={{ flexShrink: 0, opacity: 0.5 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {session.title?.trim() || t("editor.history_untitled")}
                      </span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 聊天区域 */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        <ChatPanel
          agentId={metaAgentId}
          hideSidebar
          scenePrompt={scenePrompt}
          onClientChange={setClient}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 验证编译通过**

```bash
bun run build:web
```

预期：编译成功，无 TypeScript 错误。

- [ ] **Step 3: 提交改动**

```bash
git add web/src/pages/workflow/components/MetaAgentPanel.tsx
git commit -m "feat: meta agent 面板左上角添加会话历史浮空面板"
```

---

### Task 3: 验证

- [ ] **Step 1: 运行 precheck**

```bash
bun run precheck
```

预期：修改的文件通过所有检查（biome + tsc）。如果有预存在的其他文件错误可忽略。

- [ ] **Step 2: 手动验证**

1. 打开 workflow 编辑器
2. 点击工具栏 Meta Agent 按钮打开聊天面板
3. 确认头部左侧有三横线按钮（Menu 图标）
4. 点击三横线 → 弹出浮空面板
5. 确认面板显示"今天/昨天/更早"分组
6. 确认点击某个会话可以加载恢复对话
7. 确认点击面板外部可以关闭面板
8. 确认聊天功能不受影响
