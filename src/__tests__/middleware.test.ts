import { describe, test, expect, beforeEach, afterAll, mock } from "bun:test";

// Mock config before imports — this is the only mock needed
mock.module("../config", () => ({
  config: {
    port: 3000,
    host: "0.0.0.0",
    apiKeys: ["test-api-key"],
    baseUrl: "http://localhost:3000",
    pollTimeout: 8,
    heartbeatInterval: 20,
    jwtExpiresIn: 3600,
    disconnectTimeout: 300,
  },
  getBaseUrl: () => "http://localhost:3000",
}));

import { Hono } from "hono";
import { db } from "../db";
import { user as userTable } from "../db/schema";
import { eq } from "drizzle-orm";
import { storeReset } from "../store";
import { apiKeyAuth, sessionIngressAuth, uuidAuth, getUuidFromRequest, acceptCliHeaders } from "../auth/middleware";
import { generateWorkerJwt } from "../auth/jwt";

// Ensure system user exists for apiKeyAuth's ensureSystemUser fallback
function ensureSystemUser() {
  const existing = db.select().from(userTable).where(eq(userTable.email, "system@rcs.local")).limit(1).all();
  if (existing.length > 0) return;
  const now = new Date();
  try {
    db.insert(userTable).values({
      id: "system", name: "System", email: "system@rcs.local",
      emailVerified: false, createdAt: now, updatedAt: now,
    }).run();
  } catch {}
}
ensureSystemUser();

// Helper: create a test app with middleware and a simple handler
function createTestApp() {
  const app = new Hono();

  app.get("/api-key-test", apiKeyAuth, (c) => {
    const user = c.get("user");
    return c.json({ userId: user?.id || null });
  });

  app.get("/ingress/:id", sessionIngressAuth, (c) => {
    return c.json({ ok: true });
  });

  app.get("/uuid-test", uuidAuth, (c) => {
    return c.json({ uuid: c.get("uuid") });
  });

  app.get("/uuid-extract", (c) => {
    return c.json({ uuid: getUuidFromRequest(c) });
  });

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
