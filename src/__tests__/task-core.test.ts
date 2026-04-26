import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { db } from "../db";
import { user, scheduledTask, taskExecutionLog } from "../db/schema";
import { eq, and } from "drizzle-orm";
import {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  toggleTask,
  listExecutionLogs,
  clearExecutionLogs,
  getTaskById,
  createExecutionLog,
} from "../services/task";

const USER_A = "user_task_a";
const USER_B = "user_task_b";

function ensureUser(id: string, name: string, email: string) {
  const existing = db.select().from(user).where(eq(user.id, id)).limit(1).all();
  if (existing.length > 0) return;
  const now = new Date();
  try {
    db.insert(user).values({
      id, name, email, emailVerified: false, createdAt: now, updatedAt: now,
    }).run();
  } catch {}
}

// Ensure test users exist
ensureUser(USER_A, "Alice Task", "alice-task@test.com");
ensureUser(USER_B, "Bob Task", "bob-task@test.com");

function cleanupTasks() {
  try { db.delete(taskExecutionLog).run(); } catch {}
  try { db.delete(scheduledTask).where(eq(scheduledTask.userId, USER_A)).run(); } catch {}
  try { db.delete(scheduledTask).where(eq(scheduledTask.userId, USER_B)).run(); } catch {}
}

beforeEach(() => {
  cleanupTasks();
});

afterEach(() => {
  cleanupTasks();
});

function getValidInput() {
  return {
    name: "Test Task",
    cron: "*/5 * * * *",
    url: "https://httpbin.org/get",
    method: "GET" as const,
  };
}

describe("Task Service", () => {
  describe("createTask", () => {
    it("should create a task successfully", async () => {
      const result = await createTask(USER_A, getValidInput());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toMatch(/^task_/);
        expect(result.data.name).toBe("Test Task");
        expect(result.data.cron).toBe("*/5 * * * *");
        expect(result.data.enabled).toBe(true);
        expect(result.data.method).toBe("GET");
      }
    });

    it("should reject invalid cron expression", async () => {
      const result = await createTask(USER_A, { ...getValidInput(), cron: "abc" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should reject 6-field cron expression", async () => {
      const result = await createTask(USER_A, { ...getValidInput(), cron: "0 */5 * * * *" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });
  });

  describe("listTasks", () => {
    it("should list tasks for the user", async () => {
      await createTask(USER_A, { ...getValidInput(), name: "Task A1" });
      await createTask(USER_A, { ...getValidInput(), name: "Task A2" });
      await createTask(USER_B, { ...getValidInput(), name: "Task B1" });

      const result = await listTasks(USER_A);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.length).toBe(2);
        expect(result.data.every((t) => t.name.startsWith("Task A"))).toBe(true);
      }
    });
  });

  describe("getTask", () => {
    it("should get a task by id", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      const result = await getTask(USER_A, created.data.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Test Task");
      }
    });

    it("should return NOT_FOUND for non-existent task", async () => {
      const result = await getTask(USER_A, "task_nonexistent");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });

    it("should return NOT_FOUND for other user's task", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      const result = await getTask(USER_B, created.data.id);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("updateTask", () => {
    it("should update task name", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      const result = await updateTask(USER_A, created.data.id, { name: "Updated Task" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Updated Task");
      }
    });

    it("should reject invalid url", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      const result = await updateTask(USER_A, created.data.id, { url: "ftp://invalid" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should return NOT_FOUND for non-existent task", async () => {
      const result = await updateTask(USER_A, "task_nonexistent", { name: "X" });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe("NOT_FOUND");
      }
    });
  });

  describe("deleteTask", () => {
    it("should delete a task", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      const result = await deleteTask(USER_A, created.data.id);
      expect(result.success).toBe(true);

      const get = await getTask(USER_A, created.data.id);
      expect(get.success).toBe(false);
    });

    it("should cascade delete execution logs", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      await createExecutionLog({ taskId: created.data.id, status: "success" });
      await createExecutionLog({ taskId: created.data.id, status: "failed" });

      await deleteTask(USER_A, created.data.id);

      const logs = await listExecutionLogs(created.data.id);
      if (logs.success) {
        expect(logs.data.total).toBe(0);
      }
    });
  });

  describe("toggleTask", () => {
    it("should toggle from enabled to disabled", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      const result = await toggleTask(USER_A, created.data.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(false);
      }
    });

    it("should toggle from disabled to enabled", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      await toggleTask(USER_A, created.data.id);
      const result = await toggleTask(USER_A, created.data.id);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.enabled).toBe(true);
      }
    });

    it("should return NOT_FOUND for non-existent task", async () => {
      const result = await toggleTask(USER_A, "task_nonexistent");
      expect(result.success).toBe(false);
    });
  });

  describe("listExecutionLogs", () => {
    it("should return paginated logs", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      for (let i = 0; i < 25; i++) {
        await createExecutionLog({ taskId: created.data.id, status: "success" });
      }

      const page1 = await listExecutionLogs(created.data.id, 1, 20);
      if (page1.success) {
        expect(page1.data.total).toBe(25);
        expect(page1.data.items.length).toBe(20);
      }

      const page2 = await listExecutionLogs(created.data.id, 2, 20);
      if (page2.success) {
        expect(page2.data.items.length).toBe(5);
      }
    });
  });

  describe("clearExecutionLogs", () => {
    it("should clear all logs for a task", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      await createExecutionLog({ taskId: created.data.id, status: "success" });
      await createExecutionLog({ taskId: created.data.id, status: "success" });
      await createExecutionLog({ taskId: created.data.id, status: "success" });

      await clearExecutionLogs(created.data.id);

      const logs = await listExecutionLogs(created.data.id);
      if (logs.success) {
        expect(logs.data.total).toBe(0);
      }
    });
  });

  describe("createExecutionLog", () => {
    it("should create a log entry", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      const logId = await createExecutionLog({
        taskId: created.data.id,
        status: "success",
        statusCode: 200,
        duration: 150,
      });
      expect(logId).toMatch(/^log_/);

      const logs = await listExecutionLogs(created.data.id);
      if (logs.success) {
        expect(logs.data.total).toBe(1);
        expect(logs.data.items[0].status).toBe("success");
        expect(logs.data.items[0].statusCode).toBe(200);
        expect(logs.data.items[0].duration).toBe(150);
      }
    });

    it("should truncate responseBody to 4096 characters", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      const longBody = "x".repeat(5000);
      await createExecutionLog({
        taskId: created.data.id,
        status: "success",
        responseBody: longBody,
      });

      const logs = await listExecutionLogs(created.data.id);
      if (logs.success) {
        expect(logs.data.items[0].responseBody!.length).toBe(4096);
      }
    });
  });

  describe("getTaskById", () => {
    it("should return task without userId check", async () => {
      const created = await createTask(USER_A, getValidInput());
      if (!created.success) return;
      const task = await getTaskById(created.data.id);
      expect(task).toBeTruthy();
      expect(task!.id).toBe(created.data.id);
    });

    it("should return null for non-existent task", async () => {
      const task = await getTaskById("task_nonexistent");
      expect(task).toBeNull();
    });
  });

  describe("sanitizeTask header masking", () => {
    it("should mask sensitive headers", async () => {
      const created = await createTask(USER_A, {
        ...getValidInput(),
        headers: {
          Authorization: "Bearer secret1234",
          "Content-Type": "application/json",
        },
      });
      expect(created.success).toBe(true);
      if (created.success) {
        expect(created.data.headers!["Authorization"]).toBe("***1234");
        expect(created.data.headers!["Content-Type"]).toBe("application/json");
      }
    });
  });
});
