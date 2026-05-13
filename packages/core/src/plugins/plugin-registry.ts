import type { EnginePlugin, EnginePluginMeta } from "@mothership/plugin-sdk";

/**
 * Engine 插件注册表，负责按 plugin id 管理运行时可用插件。
 */
export class PluginRegistry {
  private readonly plugins = new Map<string, EnginePlugin>();

  /** 注册一个 engine 插件；同 id 重复注册会直接报错。 */
  register(plugin: EnginePlugin): void {
    if (this.plugins.has(plugin.meta.id)) {
      throw new Error(`Engine plugin already registered: ${plugin.meta.id}`);
    }

    this.plugins.set(plugin.meta.id, plugin);
  }

  /** 按 plugin id 读取插件；不存在时返回 undefined。 */
  get(pluginId: string): EnginePlugin | undefined {
    return this.plugins.get(pluginId);
  }

  /** 按 plugin id 读取插件；不存在时抛出错误。 */
  require(pluginId: string): EnginePlugin {
    const plugin = this.get(pluginId);

    if (!plugin) {
      throw new Error(`Engine plugin not found: ${pluginId}`);
    }

    return plugin;
  }

  /** 返回当前已注册的全部 engine 插件。 */
  list(): EnginePlugin[] {
    return Array.from(this.plugins.values());
  }

  /** 读取某个插件是否声明支持指定 capability。 */
  supports(pluginId: string, capability: keyof EnginePluginMeta["capabilities"]): boolean {
    return this.require(pluginId).meta.capabilities[capability];
  }
}
