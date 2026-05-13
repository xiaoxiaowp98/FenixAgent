/**
 * 平台内部使用的强类型 ID 定义与工厂。
 *
 * 这些类型的目标不是改变运行时数据结构，而是让 TypeScript 在编译期
 * 区分 environment / instance / session / engine session 这几类容易混用的字符串。
 */
/**
 * 使用 branded type 区分语义上不同但底层同为 string 的标识。
 */
type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type EnvironmentId = Brand<string, "EnvironmentId">;
export type InstanceId = Brand<string, "InstanceId">;
export type SessionId = Brand<string, "SessionId">;
export type EngineSessionId = Brand<string, "EngineSessionId">;

/** 生成带前缀的 branded id。 */
function createBrandedId<T extends string>(
  prefix: string,
  value?: string,
): Brand<string, T> {
  const suffix = value && value.length > 0 ? value : crypto.randomUUID();
  return `${prefix}_${suffix}` as Brand<string, T>;
}

/** 创建平台 environment 主键。 */
export function createEnvironmentId(value?: string): EnvironmentId {
  return createBrandedId<"EnvironmentId">("env", value);
}

/** 创建平台 instance 主键。 */
export function createInstanceId(value?: string): InstanceId {
  return createBrandedId<"InstanceId">("ins", value);
}

/** 创建平台 session 主键。 */
export function createSessionId(value?: string): SessionId {
  return createBrandedId<"SessionId">("ses", value);
}

/** 创建 engine 原生 session 主键映射值。 */
export function createEngineSessionId(value?: string): EngineSessionId {
  return createBrandedId<"EngineSessionId">("engine_ses", value);
}
