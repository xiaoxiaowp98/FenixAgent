import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";

// Mock config before imports
const mockConfig = {
  port: 3000,
  host: "0.0.0.0",
  apiKeys: ["test-api-key"],
  baseUrl: "http://localhost:3000",
  pollTimeout: 8,
  heartbeatInterval: 20,
  jwtExpiresIn: 3600,
  disconnectTimeout: 300,
};

mock.module("../config", () => ({
  config: mockConfig,
  getBaseUrl: () => "http://localhost:3000",
}));

// Mock db and better-auth to prevent side effects
mock.module("../db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }),
    insert: () => ({ values: () => ({ run: () => ({ changes: 0 }) }) }),
  },
  initDb: () => {},
}));
mock.module("../auth/better-auth", () => ({
  auth: { api: { getSession: async () => null, signUpEmail: async () => ({}) } },
}));
mock.module("../auth/api-key-service", () => ({
  validateApiKeyAndGetUser: async () => null,
  createApiKey: async () => ({ record: {}, fullKey: "test" }),
}));

import { Hono } from "hono";
import { storeReset } from "../store";
import { apiKeyAuth, sessionIngressAuth, uuidAuth, getUuidFromRequest, acceptCliHeaders } from "../auth/middleware";
import { generateWorkerJwt } from "../auth/jwt";

// Helper: create a test app with middleware and a simple handler
function createTestApp() {
  const app = new Hono();

  // Test route for apiKeyAuth
  app.get("/api-key-test", apiKeyAuth, (c) => {
    const user = c.get("user");
    return c.json({ userId: user?.id || null });
  });

  // Test route for sessionIngressAuth
  app.get("/ingress/:id", sessionIngressAuth, (c) => {
    return c.json({ ok: true });
  });

  // Test route for uuidAuth
  app.get("/uuid-test", uuidAuth, (c) => {
    return c.json({ uuid: c.get("uuid") });
  });

  // Test route for getUuidFromRequest
  app.get("/uuid-extract", (c) => {
    return c.json({ uuid: getUuidFromRequest(c) });
  });

  // Test route for acceptCliHeaders (passthrough)
  app.get("/cli-headers", acceptCliHeaders, (c) => {
    return c.json({ ok: true });
  });

  return app;
}

describe("Auth Middleware", () => {
  let app: Hono;

  beforeEach(() => {
    storeReset();
    app = createTestApp();
  });

  describe("apiKeyAuth", () => {
    test("accepts valid legacy global API key via Bearer header", async () => {
      const res = await app.request("/api-key-test", {
        headers: { Authorization: "Bearer test-api-key" },
      });
      expect(res.status).toBe(200);
    });

    test("accepts valid legacy global API key via query param", async () => {
      const res = await app.request("/api-key-test?token=test-api-key");
      expect(res.status).toBe(200);
    });

    test("rejects invalid token", async () => {
      const res = await app.request("/api-key-test", {
        headers: { Authorization: "Bearer wrong-key" },
      });
      expect(res.status).toBe(401);
    });

    test("rejects missing token", async () => {
      const res = await app.request("/api-key-test");
      expect(res.status).toBe(401);
    });
  });

  describe("sessionIngressAuth", () => {
    const originalKeys = process.env.RCS_API_KEYS;
    beforeEach(() => {
      process.env.RCS_API_KEYS = "test-api-key";
    });
    afterAll(() => {
      process.env.RCS_API_KEYS = originalKeys;
    });

    test("accepts valid API key", async () => {
      const res = await app.request("/ingress/ses_123", {
        headers: { Authorization: "Bearer test-api-key" },
      });
      expect(res.status).toBe(200);
    });

    test("accepts valid worker JWT", async () => {
      const jwt = generateWorkerJwt("ses_123", 3600);
      const res = await app.request("/ingress/ses_123", {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      expect(res.status).toBe(200);
    });

    test("rejects missing token", async () => {
      const res = await app.request("/ingress/ses_123");
      expect(res.status).toBe(401);
    });

    test("rejects invalid token", async () => {
      const res = await app.request("/ingress/ses_123", {
        headers: { Authorization: "Bearer invalid" },
      });
      expect(res.status).toBe(401);
    });
  });

  describe("uuidAuth", () => {
    test("accepts UUID from query param", async () => {
      const res = await app.request("/uuid-test?uuid=test-uuid-1");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.uuid).toBe("test-uuid-1");
    });

    test("rejects missing UUID", async () => {
      const res = await app.request("/uuid-test");
      expect(res.status).toBe(401);
    });
  });

  describe("getUuidFromRequest", () => {
    test("extracts from query param", async () => {
      const res = await app.request("/uuid-extract?uuid=from-query");
      const body = await res.json();
      expect(body.uuid).toBe("from-query");
    });

    test("returns undefined when no UUID", async () => {
      const res = await app.request("/uuid-extract");
      const body = await res.json();
      expect(body.uuid).toBeUndefined();
    });
  });

  describe("acceptCliHeaders", () => {
    test("passes through to handler", async () => {
      const res = await app.request("/cli-headers");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });
});
