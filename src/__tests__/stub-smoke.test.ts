// 验证 stub 基础设施工作正常
import { beforeEach, describe, expect, test } from "bun:test";
import { resetAllStubs, stubConfigPg } from "../test-utils/helpers";

// biome-ignore lint/suspicious/noExplicitAny: mock 模块返回惰性包装函数，测试中需要宽松断言
type MockModule = any;

describe("stub 基础设施冒烟测试", () => {
  beforeEach(() => {
    resetAllStubs();
  });

  // 配置 stub 后，被 mock 的模块返回配置的值
  test("stubConfigPg 配置后返回配置的值", async () => {
    stubConfigPg({
      listProviders: async () => [{ id: "p1", name: "test" }],
    });

    const configPg = (await import("../services/config-pg")) as MockModule;
    const result = await configPg.listProviders({ organizationId: "org1", userId: "u1", role: "owner" });
    expect(result).toEqual([{ id: "p1", name: "test" }]);
  });

  // resetAllStubs 后，未配置的 stub 抛出明确错误
  // getter 返回惰性包装函数，调用时才查找 stub
  test("resetAllStubs 后未配置的 stub 抛出明确错误", async () => {
    const configPg = (await import("../services/config-pg")) as MockModule;
    expect(() => configPg.listProviders({})).toThrow("config-pg stub 'listProviders' not configured");
  });

  // 部分配置：已配置的可用，未配置的独立报错
  test("stubConfigPg 支持部分覆盖，未覆盖的独立报错", async () => {
    stubConfigPg({
      getProvider: async () => ({ id: "p1", name: "partial" }),
    });

    const configPg = (await import("../services/config-pg")) as MockModule;
    const result = await configPg.getProvider({ organizationId: "org1", userId: "u1", role: "owner" }, "p1");
    expect(result).toEqual({ id: "p1", name: "partial" });

    expect(() => configPg.listProviders({ organizationId: "org1", userId: "u1", role: "owner" })).toThrow(
      "config-pg stub 'listProviders' not configured",
    );
  });
});
