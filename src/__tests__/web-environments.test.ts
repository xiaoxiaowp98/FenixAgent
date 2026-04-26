import { describe, test, expect, beforeEach, mock } from "bun:test";

// Mock config before imports
mock.module("../config", () => ({
  config: { port: 3000, host: "0.0.0.0", apiKeys: [], baseUrl: "http://localhost:3000" },
  getBaseUrl: () => "http://localhost:3000",
}));

// Mock auth to bypass authentication
mock.module("../auth/better-auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "test-user-1", email: "test@test.com", name: "TestUser" },
        session: { id: "sess-1", userId: "test-user-1", token: "tok-1" },
      }),
      signUpEmail: async () => ({}),
    },
  },
}));

const { storeReset, storeCreateEnvironment, storeGetEnvironment } = await import("../store");
const { db } = await import("../db");
const { user } = await import("../db/schema");
const { eq } = await import("drizzle-orm");
const { Hono } = await import("hono");
const webEnvironments = (await import("../routes/web/environments")).default;

const testApp = new Hono();
testApp.route("/web", webEnvironments);

function ensureTestUser() {
  const existing = db.select().from(user).where(eq(user.id, "test-user-1")).limit(1).all();
  if (existing.length > 0) return;
  const now = new Date();
  try {
    db.insert(user).values({
      id: "test-user-1",
      name: "TestUser",
      email: "test-webenv@test.com",
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    }).run();
  } catch {
    // User might already exist from other tests
  }
}

describe("Web Environments CRUD API", () => {
  beforeEach(() => {
    storeReset();
    ensureTestUser();
  });

  test("POST /web/environments — registers successfully", async () => {
    const res = await testApp.request("/web/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "test-env", workspacePath: "/tmp/test-crud-ws" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe("test-env");
    expect(body.secret).toMatch(/^env_secret_/);
    expect(body.workspace_path).toBe("/tmp/test-crud-ws");
  });

  test("POST /web/environments — rejects invalid name", async () => {
    const res = await testApp.request("/web/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "INVALID", workspacePath: "/tmp/ws" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.type).toBe("VALIDATION_ERROR");
  });

  test("POST /web/environments — rejects relative workspacePath", async () => {
    const res = await testApp.request("/web/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "env-rel", workspacePath: "relative/path" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.type).toBe("VALIDATION_ERROR");
  });

  test("POST /web/environments — rejects system directory", async () => {
    const res = await testApp.request("/web/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "env-sys", workspacePath: "/" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.type).toBe("VALIDATION_ERROR");
  });

  test("GET /web/environments — lists environments without secret", async () => {
    storeCreateEnvironment({ name: "env-1", secret: "s1", workspacePath: "/tmp/ws1", userId: "test-user-1", status: "idle" });

    const res = await testApp.request("/web/environments");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("env-1");
    expect(body[0].secret).toBeUndefined();
  });

  test("GET /web/environments/:id — returns detail with secret", async () => {
    const env = storeCreateEnvironment({ name: "env-detail", secret: "secret_xyz", workspacePath: "/tmp/ws", userId: "test-user-1", status: "idle" });

    const res = await testApp.request(`/web/environments/${env.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.secret).toBe("secret_xyz");
  });

  test("GET /web/environments/:id — returns 404 for non-existent", async () => {
    const res = await testApp.request("/web/environments/env_noexist");
    expect(res.status).toBe(404);
  });

  test("PUT /web/environments/:id — updates description", async () => {
    const env = storeCreateEnvironment({ name: "env-put", secret: "s", workspacePath: "/tmp/ws", userId: "test-user-1", status: "idle" });

    const res = await testApp.request(`/web/environments/${env.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "updated desc" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.description).toBe("updated desc");
  });

  test("DELETE /web/environments/:id — deletes environment", async () => {
    const env = storeCreateEnvironment({ name: "env-del", secret: "s", workspacePath: "/tmp/ws", userId: "test-user-1", status: "idle" });

    const res = await testApp.request(`/web/environments/${env.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    expect(storeGetEnvironment(env.id)).toBeUndefined();
  });
});
