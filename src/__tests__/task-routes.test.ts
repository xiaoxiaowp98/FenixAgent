import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { db } from "../db";
import { user, scheduledTask, taskExecutionLog } from "../db/schema";
import { eq } from "drizzle-orm";

// Mock better-auth so sessionAuth passes with a test user.
mock.module("../auth/better-auth", () => ({
  auth: {
    api: {
      getSession: async () => ({
        user: { id: "test_user", email: "task-routes@test.com", name: "Test" },
        session: { id: "sess_test", userId: "test_user", token: "tok" },
      }),
      signUpEmail: async () => ({}),
    },
  },
}));

// Mock scheduler functions only — real task service used
const mockScheduleTask = mock(() => {});
const mockUnscheduleTask = mock(() => {});
const mockRescheduleTask = mock(() => {});

mock.module("../services/scheduler", () => ({
  scheduleTask: mockScheduleTask,
  unscheduleTask: mockUnscheduleTask,
  rescheduleTask: mockRescheduleTask,
  startScheduler: mock(() => Promise.resolve()),
  stopScheduler: mock(() => {}),
}));

// Ensure test user exists
const TEST_USER_ID = "test_user";
function ensureUser() {
  const existing = db.select().from(user).where(eq(user.id, TEST_USER_ID)).limit(1).all();
  if (existing.length > 0) return;
  const now = new Date();
  try {
    db.insert(user).values({
      id: TEST_USER_ID, name: "Test", email: "task-routes@test.com",
      emailVerified: false, createdAt: now, updatedAt: now,
    }).run();
  } catch {}
}
ensureUser();

function cleanup() {
  try { db.delete(taskExecutionLog).run(); } catch {}
  try { db.delete(scheduledTask).where(eq(scheduledTask.userId, TEST_USER_ID)).run(); } catch {}
}

const app = (await import("../routes/web/tasks")).default;

async function fetch(path: string, options: any = {}) {
  return app.fetch(new Request(`http://localhost${path}`, options));
}

/** Helper: create a task via the route and return its id */
async function createTaskViaRoute(overrides: Record<string, any> = {}) {
  const res = await fetch("/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Route Test",
      cron: "*/5 * * * *",
      url: "http://localhost:1",
      ...overrides,
    }),
  });
  const body: any = await res.json();
  return body.data?.id as string | undefined;
}

describe("Task Routes", () => {
  beforeEach(() => {
    cleanup();
    mockScheduleTask.mockClear();
    mockUnscheduleTask.mockClear();
    mockRescheduleTask.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  describe("GET /web/tasks", () => {
    it("should return task list", async () => {
      const res = await fetch("/tasks");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe("POST /web/tasks", () => {
    it("should create a task and schedule it", async () => {
      const res = await fetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", cron: "*/5 * * * *", url: "https://example.com" }),
      });
      expect(res.status).toBe(201);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toMatch(/^task_/);
      expect(mockScheduleTask).toHaveBeenCalled();
    });

    it("should return 400 on validation error", async () => {
      const res = await fetch("/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", cron: "bad", url: "https://example.com" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /web/tasks/:id", () => {
    it("should return task detail", async () => {
      const id = await createTaskViaRoute();
      expect(id).toBeTruthy();
      const res = await fetch(`/tasks/${id}`);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.id).toBe(id);
    });

    it("should return 404 for not found", async () => {
      const res = await fetch("/tasks/task_nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("PUT /web/tasks/:id", () => {
    it("should update a task and reschedule", async () => {
      const id = await createTaskViaRoute();
      expect(id).toBeTruthy();
      const res = await fetch(`/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated" }),
      });
      expect(res.status).toBe(200);
      expect(mockRescheduleTask).toHaveBeenCalled();
    });

    it("should return 404 for not found", async () => {
      const res = await fetch("/tasks/task_nonexistent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      });
      expect(res.status).toBe(404);
    });

    it("should return 400 on validation error", async () => {
      const id = await createTaskViaRoute();
      expect(id).toBeTruthy();
      const res = await fetch(`/tasks/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "ftp://bad" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /web/tasks/:id", () => {
    it("should delete a task and unschedule", async () => {
      const id = await createTaskViaRoute();
      expect(id).toBeTruthy();
      const res = await fetch(`/tasks/${id}`, { method: "DELETE" });
      expect(res.status).toBe(200);
      expect(mockUnscheduleTask).toHaveBeenCalled();
    });

    it("should return 404 for not found", async () => {
      const res = await fetch("/tasks/task_nonexistent", { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /web/tasks/:id/toggle", () => {
    it("should disable task and unschedule", async () => {
      const id = await createTaskViaRoute();
      expect(id).toBeTruthy();
      // Task is enabled by default → toggle disables it
      const res = await fetch(`/tasks/${id}/toggle`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(mockUnscheduleTask).toHaveBeenCalled();
    });

    it("should enable task and schedule", async () => {
      const id = await createTaskViaRoute();
      expect(id).toBeTruthy();
      // Toggle once to disable
      await fetch(`/tasks/${id}/toggle`, { method: "POST" });
      mockScheduleTask.mockClear();
      // Toggle again to enable
      const res = await fetch(`/tasks/${id}/toggle`, { method: "POST" });
      expect(res.status).toBe(200);
      expect(mockScheduleTask).toHaveBeenCalled();
    });

    it("should return 404 for not found", async () => {
      const res = await fetch("/tasks/task_nonexistent/toggle", { method: "POST" });
      expect(res.status).toBe(404);
    });
  });

  describe("POST /web/tasks/:id/trigger", () => {
    it("should trigger task and return result", async () => {
      const id = await createTaskViaRoute({ url: "http://localhost:1" });
      expect(id).toBeTruthy();
      const res = await fetch(`/tasks/${id}/trigger`, { method: "POST" });
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });

    it("should return 404 for not found", async () => {
      const res = await fetch("/tasks/task_nonexistent/trigger", { method: "POST" });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /web/tasks/:id/logs", () => {
    it("should return paginated logs", async () => {
      const id = await createTaskViaRoute();
      expect(id).toBeTruthy();
      const res = await fetch(`/tasks/${id}/logs`);
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });

    it("should return 404 for non-owned task", async () => {
      const res = await fetch("/tasks/task_nonexistent/logs");
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /web/tasks/:id/logs", () => {
    it("should clear logs", async () => {
      const id = await createTaskViaRoute();
      expect(id).toBeTruthy();
      const res = await fetch(`/tasks/${id}/logs`, { method: "DELETE" });
      expect(res.status).toBe(200);
      const body: any = await res.json();
      expect(body.success).toBe(true);
    });

    it("should return 404 for non-owned task", async () => {
      const res = await fetch("/tasks/task_nonexistent/logs", { method: "DELETE" });
      expect(res.status).toBe(404);
    });
  });
});
