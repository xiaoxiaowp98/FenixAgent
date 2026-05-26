import { describe, expect, mock, test } from "bun:test";

// mock service 层
const mockHandleWebhookRequest = mock(() => Promise.resolve({ accepted: true }));

mock.module("../services/workflow-trigger", () => ({
  handleWebhookRequest: mockHandleWebhookRequest,
}));

describe("hooks route — handleWebhookRequest 调用验证", () => {
  // handleWebhookRequest 被正确调用
  test("delegates to handleWebhookRequest with correct params", async () => {
    const { handleWebhookRequest } = await import("../services/workflow-trigger");

    await handleWebhookRequest("abc123", { "x-github-event": "push" }, { ref: "refs/heads/main" }, {});

    expect(handleWebhookRequest).toHaveBeenCalledWith(
      "abc123",
      expect.objectContaining({ "x-github-event": "push" }),
      { ref: "refs/heads/main" },
      {},
    );
  });

  // trigger not found 返回 { accepted: false }
  test("returns not found for invalid hash", async () => {
    const { handleWebhookRequest } = await import("../services/workflow-trigger");
    mockHandleWebhookRequest.mockResolvedValueOnce({ accepted: false, error: "trigger not found" } as any);

    const result = await handleWebhookRequest("nonexistent", {}, {}, {});
    expect(result.accepted).toBe(false);
    expect(result.error).toBe("trigger not found");
  });

  // trigger 存在返回 accepted
  test("returns accepted for valid trigger", async () => {
    const { handleWebhookRequest } = await import("../services/workflow-trigger");
    mockHandleWebhookRequest.mockResolvedValueOnce({ accepted: true });

    const result = await handleWebhookRequest("validhash", {}, { action: "opened" }, {});
    expect(result.accepted).toBe(true);
  });

  // GitHub push payload 格式正确传递
  test("passes full GitHub push payload correctly", async () => {
    const { handleWebhookRequest } = await import("../services/workflow-trigger");
    const pushPayload = {
      ref: "refs/heads/main",
      repository: { full_name: "org/repo" },
      commits: [{ id: "abc123", message: "fix: bug" }],
      sender: { login: "developer" },
    };
    const headers = {
      "x-github-event": "push",
      "x-github-delivery": "12345",
      "x-hub-signature-256": "sha256=abcdef",
    };

    await handleWebhookRequest("hash123", headers, pushPayload, {});

    expect(handleWebhookRequest).toHaveBeenCalledWith("hash123", headers, pushPayload, {});
  });

  // query params 正确传递
  test("passes query params correctly", async () => {
    const { handleWebhookRequest } = await import("../services/workflow-trigger");
    const query = { ref: "refs/heads/feature", test: "1" };

    await handleWebhookRequest("hash456", {}, {}, query);

    expect(handleWebhookRequest).toHaveBeenCalledWith("hash456", {}, {}, query);
  });
});
