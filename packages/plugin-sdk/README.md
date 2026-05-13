# plugin-sdk

`@mothership/plugin-sdk` 定义 engine plugin 和宿主之间的最小契约。

## 最小约定

一个第三方 engine 包最少只需要：

```text
your-engine-package/
├── package.json
└── src/
    ├── index.ts
    └── plugin.ts
```

1. `plugin.ts` 实现 `createEnginePlugin()`
2. `index.ts` 导出 `createEnginePlugin()`

`createEnginePlugin()` 需要返回一个 `EnginePlugin`，其中：

- `meta` 声明插件 id、展示名、版本和 `multiInstance`
- `createRuntime(ctx)` 返回 `EngineRuntime`

`EngineRuntime` 最少实现：

- `prepareEnvironment()`
- `startInstance()`
- `stopInstance()`
- `connectRelay()`

具体写法请直接看 demo：

- [demo/minimal-engine](demo/minimal-engine)

后续如果需要更完整的真实场景参考，可以再结合 `opencode` engine 的实现来看进程管理、配置注入和 relay 适配的拆分方式。

- [plugins/opencode](../../plugins/opencode)
