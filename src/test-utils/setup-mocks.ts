// setup-mocks.ts — 项目中唯一调用 mock.module() 的文件
// 通过 bunfig.toml preload 在所有测试前加载

import { mock } from "bun:test";
import { getApiKeyServiceStub, getAuthApiStub } from "./stubs/auth-stub";
import { getConfigPgStub } from "./stubs/config-pg-stub";
import { getDbStub } from "./stubs/db-stub";

// ── mock ../services/config-pg ──

mock.module("../services/config-pg", () => {
  return new Proxy(
    {},
    {
      get(_, prop: string) {
        if (prop === "__esModule") return true;
        return getConfigPgStub(prop as never);
      },
    },
  );
});

// ── mock ../auth/better-auth ──

mock.module("../auth/better-auth", () => {
  return {
    auth: {
      api: new Proxy(
        {},
        {
          get(_, prop: string) {
            return getAuthApiStub(prop as never);
          },
        },
      ),
      handler: (_req: Request) => new Response("mocked", { status: 200 }),
    },
  };
});

// ── mock ../auth/api-key-service ──

mock.module("../auth/api-key-service", () => {
  return new Proxy(
    {},
    {
      get(_, prop: string) {
        return getApiKeyServiceStub(prop as never);
      },
    },
  );
});

// ── mock ../db ──

mock.module("../db", () => {
  return { db: getDbStub() };
});
