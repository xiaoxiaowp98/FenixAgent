import * as net from "node:net";

export const PORT_MIN = 18800;
export const PORT_MAX = 18900;

/**
 * 探测端口是否可用。
 */
export function probePort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

/**
 * 为 opencode/acp-link 实例分配本地端口。
 *
 * 分配器既检查当前进程内是否已经占用，也探测操作系统层面的可监听状态，
 * 避免多个实例误用同一端口。
 */
export class PortAllocator {
  private readonly allocatedPorts = new Set<number>();

  /** 使用自定义端口探测实现初始化分配器。 */
  constructor(
    private readonly probe: (port: number) => Promise<boolean> = probePort,
    private readonly minPort: number = PORT_MIN,
    private readonly maxPort: number = PORT_MAX,
  ) {}

  /** 分配一个可用端口，并保留到 release 之前。 */
  async allocate(): Promise<number> {
    for (let port = this.minPort; port <= this.maxPort; port += 1) {
      if (this.allocatedPorts.has(port)) {
        continue;
      }

      const available = await this.probe(port);
      if (!available) {
        continue;
      }

      this.allocatedPorts.add(port);
      return port;
    }

    throw new Error("No available port");
  }

  /** 释放一个先前分配过的端口。 */
  release(port: number): void {
    this.allocatedPorts.delete(port);
  }
}
