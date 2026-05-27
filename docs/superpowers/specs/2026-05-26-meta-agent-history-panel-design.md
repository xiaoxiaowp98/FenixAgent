# Meta Agent 会话历史浮空面板

**目标：** 在 workflow 编辑器的 MetaAgentPanel 左上角添加汉堡菜单按钮，点击后弹出浮空面板显示 Meta Agent 的会话历史列表，点击会话可恢复/加载该对话。

---

## 交互设计

1. MetaAgentPanel 头部左侧新增 `Menu`（三横线）图标按钮
2. 点击后从头部左下方弹出浮空面板（absolute 定位），展示会话历史列表
3. 列表按"今天/昨天/更早"分组，样式复用 ACPMain 的 `SidebarSessionList` 模式
4. 点击某个会话 → 调用 `client.loadSession()` 或 `client.resumeSession()` 加载该会话 → 关闭面板
5. 点击面板外部 → 关闭面板
6. 面板宽度 260px，最大高度 400px，带阴影和圆角

---

## 技术方案

### 数据流

```
ChatPanel (onClientChange 回调)
  → MetaAgentPanel 拿到 ACPClient 引用
  → 用 client.listSessions() 加载会话列表
  → 用 client.loadSession() / client.resumeSession() 切换会话
```

`ChatPanel` 已有 `onClientChange?: (client: ACPClient | null) => void` prop，可以向上传递 client 引用，无需改动 ChatPanel 或 ACPMain。

### 改动文件

| 操作 | 文件 | 说明 |
|------|------|------|
| Modify | `web/src/pages/workflow/components/MetaAgentPanel.tsx` | 添加汉堡按钮 + 浮空会话列表面板 |
| Modify | `web/src/i18n/locales/en/workflows.json` | 添加 history 相关 i18n key |
| Modify | `web/src/i18n/locales/zh/workflows.json` | 添加 history 相关 i18n key |

### MetaAgentPanel.tsx 改动

1. 导入 `Menu` 图标（lucide-react）
2. 通过 `onClientChange` 回调获取 ACPClient 引用
3. 新增 state：`historyOpen`（面板开关）、`sessions`（会话列表）、`loading`
4. 添加 `useEffect`：client 变化且 `supportsSessionList` 时调用 `client.listSessions()`
5. 在头部 `<span>` 之前添加 `Menu` 按钮
6. 添加浮空面板 JSX：absolute 定位，包含按日期分组的会话列表
7. 使用 `useRef` + 外部点击检测关闭面板
8. 点击会话 → 调用 `client.loadSession()` / `client.resumeSession()` → 关闭面板

### i18n key

```json
{
  "editor.history_title": "History",
  "editor.history_today": "Today",
  "editor.history_yesterday": "Yesterday",
  "editor.history_earlier": "Earlier",
  "editor.history_empty": "No conversations yet",
  "editor.history_loading": "Loading..."
}
```

### 不做的事

- 不改动 ChatPanel 或 ACPMain（利用已有的 `onClientChange` 回调）
- 不新建独立组件文件（历史面板代码量小，直接内联在 MetaAgentPanel 中）
- 不添加新建会话按钮（头部已有 "+" 按钮）
- 不添加删除/编辑会话功能
