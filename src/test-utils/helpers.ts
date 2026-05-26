import { resetAuthStubs } from "./stubs/auth-stub";
import { resetConfigPgStubs } from "./stubs/config-pg-stub";
import { resetDbStub } from "./stubs/db-stub";

export function resetAllStubs() {
  resetConfigPgStubs();
  resetAuthStubs();
  resetDbStub();
}

export { getApiKeyServiceStub, getAuthApiStub, stubApiKeyService, stubAuthApi } from "./stubs/auth-stub";
// 重新导出 stub 函数，方便测试文件从统一入口引入
export { getConfigPgStub, stubConfigPg } from "./stubs/config-pg-stub";
export { stubDb } from "./stubs/db-stub";
