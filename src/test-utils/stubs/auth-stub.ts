// auth stub 注册表
// 替代各测试文件中的 mock.module("../auth/better-auth", ...) 和 mock.module("../auth/api-key-service", ...) 调用

// biome-ignore lint/suspicious/noExplicitAny: stub 注册表需要宽松类型
type StubFn = (...args: any[]) => any;

interface AuthApiStubs {
  listApiKeys: StubFn;
  deleteApiKey: StubFn;
  createApiKey: StubFn;
  listMembers: StubFn;
  listOrganizations: StubFn;
  createOrganization: StubFn;
  verifyApiKey: StubFn;
  getSession: StubFn;
}

interface ApiKeyServiceStubs {
  createApiKey: StubFn;
  hashApiKey: StubFn;
}

let _authApiStubs: Partial<AuthApiStubs> = {};
let _apiKeyStubs: Partial<ApiKeyServiceStubs> = {};

// ── better-auth stubs ──

export function stubAuthApi(overrides: Partial<AuthApiStubs>) {
  _authApiStubs = { ..._authApiStubs, ...overrides };
}

export function getAuthApiStub<K extends keyof AuthApiStubs>(name: K): AuthApiStubs[K] {
  const fn = _authApiStubs[name];
  if (!fn) throw new Error(`auth.api stub '${String(name)}' not configured, call stubAuthApi() in beforeEach`);
  return fn;
}

// ── api-key-service stubs ──

export function stubApiKeyService(overrides: Partial<ApiKeyServiceStubs>) {
  _apiKeyStubs = { ..._apiKeyStubs, ...overrides };
}

export function getApiKeyServiceStub<K extends keyof ApiKeyServiceStubs>(name: K): ApiKeyServiceStubs[K] {
  const fn = _apiKeyStubs[name];
  if (!fn)
    throw new Error(`api-key-service stub '${String(name)}' not configured, call stubApiKeyService() in beforeEach`);
  return fn;
}

// ── reset ──

export function resetAuthStubs() {
  _authApiStubs = {};
  _apiKeyStubs = {};
}
