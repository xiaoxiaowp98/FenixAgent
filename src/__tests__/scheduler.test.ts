import { describe, it, expect, mock, beforeEach, afterAll } from "bun:test";
import { db } from "../db";
import { user, scheduledTask } from "../db/schema";
import { eq } from "drizzle-orm";

// Mock node-schedule
const mockCancel = mock(() => {});
const mockNextInvocation = mock(() => ({ toJSDate: mock(() => new Date(Date.now() + 60000)) }));
const mockScheduleJob = mock(() => ({
  cancel: mockCancel,
  nextInvocation: mockNextInvocation,
}));

mock.module("node-schedule", () => ({
  default: { scheduleJob: mockScheduleJob },
}));

// Mock logger
mock.module("../logger", () => ({
  log: mock(() => {}),
  error: mock(() => {}),
}));

// Restore mocks after all tests to prevent pollution
afterAll(() => mock.restore());

// Ensure test user exists
function ensureUser() {
  const existing = db.select().from(user).where(eq(user.email, "scheduler-test@rcs.local")).limit(1).all();
  if (existing.length > 0) return existing[0].id;
  const id = "user_scheduler_test";
  const now = new Date();
  try {
    db.insert(user).values({
      id, name: "Scheduler Test", email: "scheduler-test@rcs.local",
      emailVerified: false, createdAt: now, updatedAt: now,
    }).run();
  } catch {}
  return id;
}

const testUserId = ensureUser();

// Dynamic import for fresh module
const scheduler = await import("../services/scheduler");

describe("Scheduler", () => {
  const enabledTask = {
    id: "task_abc",
    cron: "*/5 * * * *",
    timezone: "UTC",
    enabled: true,
  };

  const disabledTask = {
    id: "task_def",
    cron: "*/5 * * * *",
    timezone: "UTC",
    enabled: false,
  };

  // Cleanup between tests
  const cleanup = () => scheduler.stopScheduler();

  describe("scheduleTask", () => {
    it("should register a cron job for enabled task", () => {
      cleanup();
      scheduler.scheduleTask(enabledTask);
      expect(mockScheduleJob).toHaveBeenCalled();
      cleanup();
    });

    it("should skip disabled task", () => {
      cleanup();
      const before = mockScheduleJob.mock.calls.length;
      scheduler.scheduleTask(disabledTask);
      expect(mockScheduleJob.mock.calls.length).toBe(before);
      cleanup();
    });

    it("should be idempotent — re-scheduling same task replaces old job", () => {
      cleanup();
      scheduler.scheduleTask(enabledTask);
      const count1 = mockScheduleJob.mock.calls.length;
      scheduler.scheduleTask(enabledTask);
      expect(mockScheduleJob.mock.calls.length).toBeGreaterThan(count1);
      cleanup();
    });
  });

  describe("unscheduleTask", () => {
    it("should cancel a scheduled task without error", () => {
      cleanup();
      scheduler.scheduleTask(enabledTask);
      scheduler.unscheduleTask(enabledTask.id);
      expect(mockCancel).toHaveBeenCalled();
      cleanup();
    });

    it("should handle non-existent task gracefully", () => {
      cleanup();
      expect(() => scheduler.unscheduleTask("task_nonexistent")).not.toThrow();
      cleanup();
    });
  });

  describe("rescheduleTask", () => {
    it("should call scheduleJob with updated cron", () => {
      cleanup();
      scheduler.scheduleTask(enabledTask);
      mockScheduleJob.mock.calls.length = 0;
      scheduler.rescheduleTask({ ...enabledTask, cron: "0 * * * *" });
      expect(mockScheduleJob.mock.calls.length).toBe(1);
      cleanup();
    });
  });

  describe("startScheduler", () => {
    beforeEach(() => {
      // Insert test tasks into real db
      const now = new Date();
      try {
        db.insert(scheduledTask).values({
          id: "task_s1", userId: testUserId, name: "Test 1", cron: "* * * * *",
          url: "http://localhost", enabled: true, createdAt: now, updatedAt: now,
        }).run();
      } catch {}
      try {
        db.insert(scheduledTask).values({
          id: "task_s2", userId: testUserId, name: "Test 2", cron: "*/10 * * * *",
          url: "http://localhost", enabled: true, createdAt: now, updatedAt: now,
        }).run();
      } catch {}
    });

    it("should schedule all enabled tasks from db", async () => {
      cleanup();
      await scheduler.startScheduler();
      expect(mockScheduleJob.mock.calls.length).toBeGreaterThanOrEqual(2);
      cleanup();
    });

    it("should handle no tasks without error", async () => {
      cleanup();
      // Delete our test tasks temporarily
      try { db.delete(scheduledTask).where(eq(scheduledTask.id, "task_s1")).run(); } catch {}
      try { db.delete(scheduledTask).where(eq(scheduledTask.id, "task_s2")).run(); } catch {}

      await scheduler.startScheduler();
      expect(true).toBe(true); // No error = pass
      cleanup();
    });

    afterAll(() => {
      // Clean up test tasks
      try { db.delete(scheduledTask).where(eq(scheduledTask.id, "task_s1")).run(); } catch {}
      try { db.delete(scheduledTask).where(eq(scheduledTask.id, "task_s2")).run(); } catch {}
    });
  });

  describe("stopScheduler", () => {
    it("should stop without error even with active jobs", () => {
      cleanup();
      scheduler.scheduleTask(enabledTask);
      scheduler.scheduleTask({ ...enabledTask, id: "task_2" });
      expect(() => scheduler.stopScheduler()).not.toThrow();
      cleanup();
    });
  });
});
