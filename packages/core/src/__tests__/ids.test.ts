/** branded id 工厂与命名空间隔离测试。 */
import { describe, expect, test } from "bun:test";
import {
  createEnvironmentId,
  createEngineSessionId,
  createSessionId,
} from "../index";

describe("branded ids and session model", () => {
  // 验证平台 session id 与 engine session id 保持独立命名空间，不会混淆。
  test("createSessionId and createEngineSessionId keep distinct prefixes", () => {
    const sessionId = createSessionId("chat");
    const engineSessionId = createEngineSessionId("chat");
    const environmentId = createEnvironmentId("workspace");

    expect(String(sessionId)).toBe("ses_chat");
    expect(String(engineSessionId)).toBe("engine_ses_chat");
    expect(String(environmentId)).toBe("env_workspace");
    expect(String(sessionId)).not.toBe(String(engineSessionId));
  });
});
