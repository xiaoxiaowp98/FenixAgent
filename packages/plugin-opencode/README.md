# opencode Plugin

`@mothership/opencode` 是一个 engine plugin，实现了新 Core 所需的 opencode 运行时适配。

## 文件架构

```text
src/
├── index.ts                         # 包入口，导出 createEnginePlugin 和少量工具
├── plugin.ts                        # 插件主入口，负责组装 runtime
├── process/
│   ├── acp-link-process-manager.ts  # 管理 acp-link 进程、状态和 token 捕获
│   └── port-allocator.ts            # 分配和释放本地端口
├── runtime/
│   ├── config-writer.ts             # 将配置写入 .opencode/opencode.json
│   └── runtime-config.ts            # 将 AgentRuntimeSpec 翻译成 opencode 私有配置
├── relay/
│   └── relay-handle.ts              # 适配本地 WS relay，过滤 keep_alive 等噪音消息
└── __tests__/
    ├── acp-link-process-manager.test.ts # 验证 token 捕获与停止流程
    ├── config-writer.test.ts            # 验证配置写入
    └── relay-handle.test.ts             # 验证 relay 转发、过滤与清理行为
```

## 职责边界

- 负责 `acp-link` 本地进程管理，包括端口分配、stdout token 捕获和停止清理。
- 负责把 `plugin-sdk` 暴露的 `AgentRuntimeSpec` 翻译为 engine 私有的 `.opencode/opencode.json` 注入文件。
- 负责把本地 relay WebSocket 适配为 `EngineRelayHandle`，并过滤 `keep_alive` 等 engine 私有噪音消息。
