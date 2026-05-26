// setup-mocks.ts — 项目中唯一调用 mock.module() 的文件
// 通过 bunfig.toml preload 在所有测试前加载
//
// Bun 的 ESM namespace 会在 import 时提前求值 getter，
// 所以 getter 必须返回一个惰性包装函数，将 stub 查找延迟到调用时。

import { mock } from "bun:test";
import { getApiKeyServiceStub, getAuthApiStub } from "./stubs/auth-stub";
import { getConfigPgStub } from "./stubs/config-pg-stub";
import { getDbStub } from "./stubs/db-stub";

// biome-ignore lint/suspicious/noExplicitAny: stub 注册表需要宽松类型
type AnyFn = (...args: any[]) => any;

// ── config-pg 导出名称 ──

const CONFIG_PG_KEYS = [
  "AGENT_SETTABLE_FIELDS",
  "addModel",
  "createAgentConfig",
  "createMcpServer",
  "deleteAgentConfig",
  "deleteMcpServer",
  "deleteProvider",
  "deleteSkill",
  "getAgentConfig",
  "getAgentConfigById",
  "getAgentFullConfig",
  "getMcpServer",
  "getProvider",
  "getSkill",
  "getUserConfig",
  "listAgentConfigs",
  "listAgentSkillIds",
  "listMcpServers",
  "listProviders",
  "listSkills",
  "removeModel",
  "setMcpServerEnabled",
  "setUserConfig",
  "syncAgentSkills",
  "updateAgentConfig",
  "updateMcpServer",
  "updateModel",
  "upsertProvider",
  "upsertSkill",
] as const;

mock.module("../services/config-pg", () => {
  const obj: Record<string, unknown> = {};
  for (const key of CONFIG_PG_KEYS) {
    Object.defineProperty(obj, key, {
      enumerable: true,
      configurable: true,
      // 惰性包装：getter 返回一个函数，调用时才查找 stub
      get:
        () =>
        (...args: unknown[]) =>
          (getConfigPgStub(key) as AnyFn)(...args),
    });
  }
  return obj;
});

// ── auth.api 方法名称 ──

const AUTH_API_KEYS = [
  "listApiKeys",
  "deleteApiKey",
  "createApiKey",
  "listMembers",
  "listOrganizations",
  "createOrganization",
  "verifyApiKey",
  "getSession",
] as const;

mock.module("../auth/better-auth", () => {
  const apiObj: Record<string, unknown> = {};
  for (const key of AUTH_API_KEYS) {
    Object.defineProperty(apiObj, key, {
      enumerable: true,
      configurable: true,
      get:
        () =>
        (...args: unknown[]) =>
          (getAuthApiStub(key) as AnyFn)(...args),
    });
  }
  return {
    auth: {
      api: apiObj,
      handler: (_req: Request) => new Response("mocked", { status: 200 }),
    },
  };
});

// ── api-key-service 导出名称 ──

const API_KEY_SERVICE_KEYS = ["createApiKey", "hashApiKey"] as const;

mock.module("../auth/api-key-service", () => {
  const obj: Record<string, unknown> = {};
  for (const key of API_KEY_SERVICE_KEYS) {
    Object.defineProperty(obj, key, {
      enumerable: true,
      configurable: true,
      get:
        () =>
        (...args: unknown[]) =>
          (getApiKeyServiceStub(key) as AnyFn)(...args),
    });
  }
  return obj;
});

// ── raw db ──

mock.module("../db", () => ({ db: getDbStub() }));
