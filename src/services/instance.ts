import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import * as net from "node:net";
import { createApiKey } from "../auth/api-key-service";
import { getBaseUrl } from "../config";

export interface SpawnedInstance {
  id: string;
  userId: string;
  port: number;
  pid: number | null;
  status: "starting" | "running" | "stopped" | "error";
  command: string;
  error: string | null;
  apiKey: string;
  createdAt: Date;
}

const PORT_MIN = 8888;
const PORT_MAX = 8999;

const instances = new Map<string, SpawnedInstance>();
const allocatingPorts = new Set<number>();

function allocatePort(): number | null {
  const occupied = new Set<number>();
  for (const inst of instances.values()) {
    occupied.add(inst.port);
  }
  for (const port of allocatingPorts) {
    occupied.add(port);
  }
  for (let port = PORT_MIN; port <= PORT_MAX; port++) {
    if (!occupied.has(port)) return port;
  }
  return null;
}

function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

export async function spawnInstance(userId: string): Promise<SpawnedInstance> {
  // 1. Create dedicated API Key
  const { fullKey } = await createApiKey(userId, `instance-${Date.now()}`);
  const apiKey = fullKey;

  // 2. Allocate port (with concurrency guard)
  const port = allocatePort();
  if (!port) throw new Error("No available port");
  allocatingPorts.add(port);
  try {
    const available = await probePort(port);
    if (!available) throw new Error(`Port ${port} is in use`);

    // 3. Create SpawnedInstance record
    const id = `inst_${randomBytes(8).toString("hex")}`;
    const baseUrl = getBaseUrl();
    const command = `ACP_RCS_URL=${baseUrl} ACP_RCS_TOKEN=${apiKey} acp-link --group "${apiKey}" --port ${port} opencode -- acp`;
    const instance: SpawnedInstance = {
      id, userId, port, pid: null,
      status: "starting", command, error: null, apiKey,
      createdAt: new Date(),
    };
    instances.set(id, instance);

    // 4. Spawn child process
    const proc = spawn("acp-link", [
      "--group", apiKey,
      "--port", String(port),
      "opencode", "--", "acp",
    ], {
      env: { ...process.env, ACP_RCS_URL: baseUrl, ACP_RCS_TOKEN: apiKey },
      stdio: ["pipe", "ignore", "ignore"],
    });
    instance.pid = proc.pid ?? null;
    instance.status = "running";

    // 5. Listen to events
    proc.on("close", (code) => {
      instance.status = "stopped";
      if (code !== 0 && code !== null) {
        instance.error = `Process exited with code ${code}`;
      }
      allocatingPorts.delete(port);
    });
    proc.on("error", (err) => {
      instance.status = "error";
      instance.error = err.message;
      allocatingPorts.delete(port);
    });

    return instance;
  } catch (err) {
    allocatingPorts.delete(port);
    throw err;
  }
}

export function listInstances(userId: string): SpawnedInstance[] {
  return Array.from(instances.values()).filter(i => i.userId === userId);
}

export function getInstance(id: string): SpawnedInstance | undefined {
  return instances.get(id);
}

export function stopInstance(id: string, userId: string): { ok: boolean; error?: string } {
  const inst = instances.get(id);
  if (!inst) return { ok: false, error: "Instance not found" };
  if (inst.userId !== userId) return { ok: false, error: "Not your instance" };
  if (inst.status === "stopped") return { ok: false, error: "Already stopped" };
  if (!inst.pid) { inst.status = "stopped"; return { ok: true }; }
  try {
    process.kill(inst.pid, "SIGTERM");
    setTimeout(() => {
      try { process.kill(inst.pid!, "SIGKILL"); } catch {}
    }, 5000);
    return { ok: true };
  } catch {
    inst.status = "stopped";
    return { ok: true };
  }
}

export function stopAllInstances(): void {
  for (const inst of instances.values()) {
    if (inst.pid && inst.status !== "stopped") {
      try { process.kill(inst.pid, "SIGTERM"); } catch {}
    }
  }
}
