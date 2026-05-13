/** acp-link 进程管理器的端口、状态与停止逻辑测试。 */
import { describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { AcpLinkProcessManager } from "../process/acp-link-process-manager";
import { PortAllocator } from "../process/port-allocator";

class FakeChildProcess extends EventEmitter {
  pid = 4321;
  stdout = new PassThrough();
  stderr = new PassThrough();
}

describe("AcpLinkProcessManager", () => {
  // 验证 start() 能从 stdout 中捕获 64 位 hex token 并写入进程状态。
  test("start captures local websocket token from stdout", async () => {
    const child = new FakeChildProcess();
    const manager = new AcpLinkProcessManager({
      portAllocator: new PortAllocator(async () => true, 9001, 9001),
      resolveBinary: () => "acp-link",
      spawnProcess: mock(() => child as never),
    });

    const state = await manager.start({
      environmentId: "env-1",
      instanceId: "ins-1",
      workspacePath: "/tmp/workspace",
    });

    child.stdout.write("Token: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n");

    expect(state.port).toBe(9001);
    expect(manager.getProcessState("ins-1")?.token).toBe(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(manager.getProcessState("ins-1")?.status).toBe("running");
  });

  // 验证 stop() 会先发 SIGTERM，再注册 5 秒后的 SIGKILL。
  test("stop sends SIGTERM and schedules SIGKILL fallback", async () => {
    const child = new FakeChildProcess();
    const killProcess = mock(() => {});
    const setTimeoutFn = mock((callback: () => void) => {
      callback();
      return 1 as never;
    });
    const manager = new AcpLinkProcessManager({
      portAllocator: new PortAllocator(async () => true, 9002, 9002),
      resolveBinary: () => "acp-link",
      spawnProcess: mock(() => child as never),
      killProcess,
      setTimeoutFn: setTimeoutFn as never,
    });

    await manager.start({
      environmentId: "env-2",
      instanceId: "ins-2",
      workspacePath: "/tmp/workspace",
    });

    manager.stop("ins-2");

    expect(killProcess).toHaveBeenNthCalledWith(1, 4321, "SIGTERM");
    expect(setTimeoutFn).toHaveBeenCalledTimes(1);
    expect(killProcess).toHaveBeenNthCalledWith(2, 4321, "SIGKILL");
  });
});
