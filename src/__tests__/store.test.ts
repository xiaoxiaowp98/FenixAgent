import { describe, test, expect, beforeEach } from "bun:test";
import {
  storeReset,
  storeCreateEnvironment,
  storeGetEnvironment,
  storeUpdateEnvironment,
  storeListActiveEnvironments,
  storeListEnvironmentsByUserId,
  storeCreateSession,
  storeGetSession,
  storeUpdateSession,
  storeListSessions,
  storeListSessionsByEnvironment,
  storeListSessionsByUserId,
  storeDeleteSession,
  storeDeleteEnvironment,
  storeListAcpAgents,
  storeListAcpAgentsByUserId,
  storeListOnlineAcpAgents,
} from "../store";

describe("store", () => {
  beforeEach(() => {
    storeReset();
  });

  // ---------- Environment ----------

  describe("storeCreateEnvironment", () => {
    test("creates environment with defaults", () => {
      const env = storeCreateEnvironment({ secret: "s1", userId: "user1" });
      expect(env.id).toMatch(/^env_/);
      expect(env.secret).toBe("s1");
      expect(env.status).toBe("active");
      expect(env.machineName).toBeNull();
      expect(env.maxSessions).toBe(1);
      expect(env.workerType).toBe("acp");
      expect(env.userId).toBe("user1");
      expect(env.lastPollAt).toBeInstanceOf(Date);
    });

    test("creates ACP environment with machineName", () => {
      const env = storeCreateEnvironment({
        secret: "s2",
        userId: "user1",
        machineName: "my-agent",
        workerType: "acp",
        capabilities: { foo: true },
      });
      expect(env.machineName).toBe("my-agent");
      expect(env.workerType).toBe("acp");
      expect(env.capabilities).toEqual({ foo: true });
    });

    test("always creates a new record even with same machineName", () => {
      const env1 = storeCreateEnvironment({ secret: "s1", userId: "user1", machineName: "agent1", workerType: "acp" });
      const env2 = storeCreateEnvironment({ secret: "s2", userId: "user1", machineName: "agent1", workerType: "acp" });
      expect(env1.id).not.toBe(env2.id);
    });
  });

  describe("storeGetEnvironment", () => {
    test("returns undefined for non-existent env", () => {
      expect(storeGetEnvironment("env_no")).toBeUndefined();
    });

    test("returns created environment", () => {
      const env = storeCreateEnvironment({ secret: "s", userId: "u1" });
      expect(storeGetEnvironment(env.id)).toBe(env);
    });
  });

  describe("storeUpdateEnvironment", () => {
    test("updates existing environment", () => {
      const env = storeCreateEnvironment({ secret: "s", userId: "u1" });
      const result = storeUpdateEnvironment(env.id, { status: "offline" });
      expect(result).toBe(true);
      const updated = storeGetEnvironment(env.id);
      expect(updated?.status).toBe("offline");
    });

    test("returns false for non-existent environment", () => {
      expect(storeUpdateEnvironment("env_no", { status: "active" })).toBe(false);
    });
  });

  describe("storeListActiveEnvironments", () => {
    test("returns only active environments", () => {
      const env1 = storeCreateEnvironment({ secret: "s1", userId: "u1" });
      storeCreateEnvironment({ secret: "s2", userId: "u1" });
      storeUpdateEnvironment(env1.id, { status: "offline" });
      const active = storeListActiveEnvironments();
      expect(active).toHaveLength(1);
    });
  });

  describe("storeListEnvironmentsByUserId", () => {
    test("filters by userId", () => {
      storeCreateEnvironment({ secret: "s1", userId: "user-a" });
      storeCreateEnvironment({ secret: "s2", userId: "user-b" });
      storeCreateEnvironment({ secret: "s3", userId: "user-a" });
      expect(storeListEnvironmentsByUserId("user-a")).toHaveLength(2);
      expect(storeListEnvironmentsByUserId("user-b")).toHaveLength(1);
      expect(storeListEnvironmentsByUserId("user-c")).toHaveLength(0);
    });
  });

  // ---------- Session ----------

  describe("storeCreateSession", () => {
    test("creates session with defaults", () => {
      const session = storeCreateSession({});
      expect(session.id).toMatch(/^session_/);
      expect(session.status).toBe("idle");
      expect(session.source).toBe("acp");
      expect(session.environmentId).toBeNull();
      expect(session.userId).toBeNull();
    });

    test("creates session with options", () => {
      const env = storeCreateEnvironment({ secret: "s", userId: "u1" });
      const session = storeCreateSession({
        environmentId: env.id,
        title: "Test Session",
        source: "web",
        userId: "u1",
      });
      expect(session.environmentId).toBe(env.id);
      expect(session.title).toBe("Test Session");
      expect(session.source).toBe("web");
      expect(session.userId).toBe("u1");
    });
  });

  describe("storeGetSession", () => {
    test("returns undefined for non-existent session", () => {
      expect(storeGetSession("nope")).toBeUndefined();
    });
  });

  describe("storeUpdateSession", () => {
    test("updates existing session", () => {
      const session = storeCreateSession({});
      storeUpdateSession(session.id, { title: "Updated", status: "active" });
      const updated = storeGetSession(session.id);
      expect(updated?.title).toBe("Updated");
      expect(updated?.status).toBe("active");
    });
  });

  describe("storeListSessions", () => {
    test("returns all sessions", () => {
      storeCreateSession({});
      storeCreateSession({});
      expect(storeListSessions()).toHaveLength(2);
    });
  });

  describe("storeListSessionsByEnvironment", () => {
    test("filters by environment", () => {
      const env = storeCreateEnvironment({ secret: "s", userId: "u1" });
      storeCreateSession({ environmentId: env.id });
      storeCreateSession({});
      expect(storeListSessionsByEnvironment(env.id)).toHaveLength(1);
    });
  });

  describe("storeListSessionsByUserId", () => {
    test("filters by userId", () => {
      storeCreateSession({ userId: "user-a" });
      storeCreateSession({ userId: "user-b" });
      storeCreateSession({ userId: "user-a" });
      expect(storeListSessionsByUserId("user-a")).toHaveLength(2);
      expect(storeListSessionsByUserId("user-b")).toHaveLength(1);
    });
  });

  describe("storeDeleteSession", () => {
    test("deletes existing session", () => {
      const session = storeCreateSession({});
      expect(storeDeleteSession(session.id)).toBe(true);
      expect(storeGetSession(session.id)).toBeUndefined();
    });
  });

  // ---------- ACP Agent ----------

  describe("ACP agent lifecycle", () => {
    test("deletes agent and associated sessions", () => {
      const env = storeCreateEnvironment({ secret: "s", userId: "u1", workerType: "acp", machineName: "agent1" });
      storeCreateSession({ environmentId: env.id, title: "test session", userId: "u1" });
      expect(storeDeleteEnvironment(env.id)).toBe(true);
      expect(storeGetEnvironment(env.id)).toBeUndefined();
      expect(storeListSessionsByEnvironment(env.id)).toHaveLength(0);
    });

    test("lists ACP agents", () => {
      storeCreateEnvironment({ secret: "s1", userId: "u1", workerType: "acp", machineName: "a1" });
      storeCreateEnvironment({ secret: "s2", userId: "u1", workerType: "acp", machineName: "a2" });
      expect(storeListAcpAgents()).toHaveLength(2);
    });

    test("lists ACP agents by userId", () => {
      storeCreateEnvironment({ secret: "s1", userId: "user-a", workerType: "acp", machineName: "a1" });
      storeCreateEnvironment({ secret: "s2", userId: "user-b", workerType: "acp", machineName: "a2" });
      expect(storeListAcpAgentsByUserId("user-a")).toHaveLength(1);
      expect(storeListAcpAgentsByUserId("user-b")).toHaveLength(1);
    });

    test("lists online ACP agents", () => {
      storeCreateEnvironment({ secret: "s1", userId: "u1", workerType: "acp", machineName: "a1" });
      storeCreateEnvironment({ secret: "s2", userId: "u1", workerType: "acp", machineName: "a2" });
      expect(storeListOnlineAcpAgents()).toHaveLength(2);
    });
  });

  // ---------- storeReset ----------

  describe("storeReset", () => {
    test("clears all data", () => {
      storeCreateEnvironment({ secret: "s", userId: "u1" });
      storeCreateSession({});

      storeReset();

      expect(storeListActiveEnvironments()).toHaveLength(0);
      expect(storeListSessions()).toHaveLength(0);
    });
  });
});
