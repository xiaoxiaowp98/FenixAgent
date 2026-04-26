import { randomBytes } from "node:crypto";
import { config } from "../config";
import {
  storeCreateEnvironment,
  storeCreateSession,
  storeGetEnvironment,
  storeUpdateEnvironment,
  storeListActiveEnvironments,
  storeListActiveEnvironmentsByUsername,
  storeListSessionsByEnvironment,
} from "../store";
import type { RegisterEnvironmentRequest, EnvironmentResponse } from "../types/api";
import type { EnvironmentRecord } from "../store";

function toResponse(row: EnvironmentRecord): EnvironmentResponse {
  return {
    id: row.id,
    machine_name: row.machineName,
    directory: row.directory,
    branch: row.branch,
    status: row.status,
    username: row.username,
    last_poll_at: row.lastPollAt ? row.lastPollAt.getTime() / 1000 : null,
    worker_type: row.workerType,
    capabilities: row.capabilities,
  };
}

export function registerEnvironment(req: RegisterEnvironmentRequest & { metadata?: { worker_type?: string }; username?: string; userId?: string }) {
  const secret = `env_${randomBytes(24).toString("hex")}`;
  const workerType = req.worker_type || req.metadata?.worker_type;
  const record = storeCreateEnvironment({
    secret,
    userId: req.userId || "system",
    machineName: req.machine_name,
    directory: req.directory,
    branch: req.branch,
    gitRepoUrl: req.git_repo_url,
    maxSessions: req.max_sessions,
    workerType,
    username: req.username,
    capabilities: req.capabilities,
  });

  let sessionId: string | undefined;
  // ACP agents: reuse existing session or create one
  if (workerType === "acp") {
    const existing = storeListSessionsByEnvironment(record.id);
    if (existing.length > 0) {
      sessionId = existing[0].id;
    } else {
      const session = storeCreateSession({
        environmentId: record.id,
        title: req.machine_name || "ACP Agent",
        source: "acp",
      });
      sessionId = session.id;
    }
  }

  return { environment_id: record.id, environment_secret: record.secret, status: record.status as "active", session_id: sessionId };
}

export function deregisterEnvironment(envId: string) {
  storeUpdateEnvironment(envId, { status: "deregistered" });
}

export function getEnvironment(envId: string) {
  return storeGetEnvironment(envId);
}

export function updatePollTime(envId: string) {
  storeUpdateEnvironment(envId, { lastPollAt: new Date() });
}

export function listActiveEnvironments() {
  return storeListActiveEnvironments();
}

export function listActiveEnvironmentsResponse(): EnvironmentResponse[] {
  return storeListActiveEnvironments().map(toResponse);
}

export function listActiveEnvironmentsByUsername(username: string): EnvironmentResponse[] {
  return storeListActiveEnvironmentsByUsername(username).map(toResponse);
}

export function reconnectEnvironment(envId: string) {
  storeUpdateEnvironment(envId, { status: "active" });
}
