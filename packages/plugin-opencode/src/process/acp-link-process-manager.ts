import { spawn, type ChildProcess } from "node:child_process";
import { PortAllocator } from "./port-allocator";

const ACP_LINK_BIND_HOST = "0.0.0.0";
const LOCAL_TOKEN_PATTERN = /Token:\s*([a-f0-9]{64})/;

interface AcpLinkProcessRecord {
  process: ChildProcess;
  killTimer?: ReturnType<typeof setTimeout>;
}

export interface AcpLinkProcessState {
  environmentId: string;
  instanceId: string;
  workspacePath: string;
  port: number;
  pid: number | null;
  status: "starting" | "running" | "stopped" | "error";
  token?: string;
  error?: string;
}

export interface StartAcpLinkInput {
  environmentId: string;
  instanceId: string;
  workspacePath: string;
  groupToken?: string;
}

/**
 * 进程管理器可替换的系统依赖。
 *
 * 这些端口主要服务于测试，让测试不必真的占端口或启动子进程。
 */
interface ProcessManagerOptions {
  portAllocator?: PortAllocator;
  spawnProcess?: typeof spawn;
  resolveBinary?: (name: string) => string;
  setTimeoutFn?: typeof setTimeout;
  killProcess?: (pid: number, signal: NodeJS.Signals) => void;
}

/**
 * 管理 acp-link 本地代理进程、端口分配和 token 捕获。
 *
 * 对 opencode engine 来说，本地 acp-link 进程就是“实例 runtime”的核心载体，
 * 因此这里同时维护它的生命周期状态和 relay 连接所需的端口/token 信息。
 */
export class AcpLinkProcessManager {
  private readonly states = new Map<string, AcpLinkProcessState>();
  private readonly processes = new Map<string, AcpLinkProcessRecord>();
  private readonly portAllocator: PortAllocator;
  private readonly spawnProcess: typeof spawn;
  private readonly resolveBinary: (name: string) => string;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly killProcess: (pid: number, signal: NodeJS.Signals) => void;

  /** 使用可替换的系统依赖初始化进程管理器。 */
  constructor(options: ProcessManagerOptions = {}) {
    this.portAllocator = options.portAllocator ?? new PortAllocator();
    this.spawnProcess = options.spawnProcess ?? spawn;
    this.resolveBinary = options.resolveBinary ?? ((name) => name);
    this.setTimeoutFn = options.setTimeoutFn ?? setTimeout;
    this.killProcess = options.killProcess ?? ((pid, signal) => process.kill(pid, signal));
  }

  /**
   * 启动一个新的 acp-link 本地代理进程。
   *
   * acp-link 以"本地代理模式"运行：不连接上游 RCS，只在本地暴露 WebSocket，
   * 由 relay handle 直连。opencode 子进程则在收到 relay 连接后按需启动。
   *
   * 关键参数：
   * - `--group` 设置了 group token，acp-link 会用此 token 生成本地 WS 的认证凭证
   * - `--port` 由 PortAllocator 动态分配，避免多实例端口冲突
   * - stdout 被 pipe 以捕获 acp-link 打印的真实 WS token（见 LOCAL_TOKEN_PATTERN）
   */
  async start(input: StartAcpLinkInput): Promise<AcpLinkProcessState> {
    const port = await this.portAllocator.allocate();
    const acpLinkPath = this.resolveBinary("acp-link");
    const authToken = input.groupToken ?? input.instanceId;
    const child = this.spawnProcess(
      acpLinkPath,
      [
        "--host",
        ACP_LINK_BIND_HOST,
        "--group",
        authToken,
        "--port",
        String(port),
        "opencode",
        "--",
        "acp",
      ],
      {
        cwd: input.workspacePath,
        env: {
          ...process.env,
          ACP_RCS_TOKEN: authToken,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const state: AcpLinkProcessState = {
      environmentId: input.environmentId,
      instanceId: input.instanceId,
      workspacePath: input.workspacePath,
      port,
      pid: child.pid ?? null,
      status: "starting",
    };
    this.states.set(input.instanceId, state);
    this.processes.set(input.instanceId, { process: child });

    child.stdout?.on("data", (chunk: Buffer | string) => {
      const text = chunk.toString();
      const match = text.match(LOCAL_TOKEN_PATTERN);
      if (match) {
        // acp-link 启动后会打印实际启用的本地 WS token（64 位 hex）。
        // 后续 relay 建连必须用这个真实 token，不能直接复用 group token。
        state.token = match[1];
      }
      // stdout 有输出意味着进程已准备好接受连接。
      state.status = "running";
    });

    child.stderr?.on("data", (chunk: Buffer | string) => {
      // stderr 收到内容通常意味着进程启动失败或运行时错误，
      // 此时标记 error 状态以便上层感知。
      state.status = "error";
      state.error = chunk.toString().trim();
    });

    child.on("close", (code) => {
      state.status = "stopped";
      if (code !== 0 && code !== null) {
        state.error = `Process exited with code ${code}`;
      }
      // 进程退出时释放端口，允许后续实例复用。
      this.portAllocator.release(port);
      this.processes.delete(input.instanceId);
    });

    child.on("error", (error) => {
      state.status = "error";
      state.error = error.message;
      // spawn 失败时同样释放端口。
      this.portAllocator.release(port);
      this.processes.delete(input.instanceId);
    });

    return state;
  }

  /** 停止一个已存在的 acp-link 进程，包含 SIGTERM 与超时 SIGKILL。 */
  stop(instanceId: string): void {
    const state = this.states.get(instanceId);
    if (!state?.pid) {
      return;
    }

    this.killProcess(state.pid, "SIGTERM");
    const record = this.processes.get(instanceId);
    record?.killTimer && clearTimeout(record.killTimer);
    const killTimer = this.setTimeoutFn(() => {
      // 若子进程没有自行退出，再用 SIGKILL 兜底，避免僵尸代理残留。
      this.killProcess(state.pid!, "SIGKILL");
    }, 5000);
    if (record) {
      record.killTimer = killTimer;
    }
  }

  /** 按 instanceId 读取当前进程状态。 */
  getProcessState(instanceId: string): AcpLinkProcessState | undefined {
    return this.states.get(instanceId);
  }
}
