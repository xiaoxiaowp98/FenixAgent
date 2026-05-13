/** PluginRegistry 注册、查询与 capability 判定测试。 */
import { describe, expect, test } from "bun:test";
import type { EnginePlugin } from "@mothership/plugin-sdk";
import { PluginRegistry } from "../index";

function createPlugin(id: string, multiInstance: boolean): EnginePlugin {
  return {
    meta: {
      id,
      displayName: id,
      version: "0.1.0",
      capabilities: {
        multiInstance,
      },
    },
    createRuntime() {
      return {
        async prepareEnvironment(input) {
          return input;
        },
        async startInstance(input) {
          return { instanceId: input.instanceId };
        },
        async stopInstance() {},
        async connectRelay() {
          return {
            state: "open",
            send() {},
            close() {},
          };
        },
      };
    },
  };
}

describe("PluginRegistry", () => {
  // 验证 registry 能同时保存多个不同 engine 插件。
  test("register and list plugins", () => {
    const registry = new PluginRegistry();

    registry.register(createPlugin("opencode", true));
    registry.register(createPlugin("sandbox", false));

    expect(registry.list()).toHaveLength(2);
    expect(registry.get("opencode")?.meta.id).toBe("opencode");
  });

  // 验证重复注册相同 plugin id 时抛出确定性错误。
  test("register throws on duplicate plugin id", () => {
    const registry = new PluginRegistry();

    registry.register(createPlugin("opencode", true));

    expect(() => registry.register(createPlugin("opencode", false))).toThrow(
      "Engine plugin already registered: opencode",
    );
  });

  // 验证 capability 查询只依赖显式声明的 flags。
  test("supports returns explicit capability values", () => {
    const registry = new PluginRegistry();

    registry.register(createPlugin("opencode", true));

    expect(registry.supports("opencode", "multiInstance")).toBe(true);
  });
});
