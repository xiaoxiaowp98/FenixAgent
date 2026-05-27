# Workspace Environment 隔离改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 workspace 路径从 `{orgId}/{userId}` 改为 `{orgId}/{userId}/{envId}`，实现每个 environment 独立的文件隔离。

**Architecture:** 修改路径公式为三层结构（orgId/userId/envId），workspace 路径由 opencode plugin 在 agent 启动时实时计算，通过 `AgentLaunchSpec.environmentId` 传递。RCS 服务端的 `workspace-fs.ts` 文件 API 同样实时计算，不再依赖 DB 的 `workspacePath` 字段。新 environment 的 DB `workspacePath` 写入空字符串。

**Tech Stack:** TypeScript, Bun test, Drizzle ORM

---

## File Structure

| 文件 | 操作 | 职责 |
|------|------|------|
| `packages/plugin-sdk/src/agent-launch-spec.ts` | 修改 | 加 `environmentId` 字段到 `AgentLaunchSpec` |
| `src/services/workspace-resolver.ts` | 修改 | 路径公式加 envId 参数 |
| `src/__tests__/workspace-resolver.test.ts` | 修改 | 更新测试覆盖 envId |
| `packages/plugin-opencode/src/runtime/opencode-runtime.ts` | 修改 | `resolveWorkspace` 使用 `environmentId` |
| `packages/plugin-opencode/src/__tests__/opencode-runtime.test.ts` | 修改 | 更新测试验证 envId 隔离 |
| `src/services/launch-spec-builder.ts` | 修改 | `BuildLaunchSpecInput` 加 `environmentId`，传递到输出 |
| `src/services/instance.ts` | 修改 | 调用 `buildLaunchSpec` 时传入 `envId` |
| `src/repositories/environment.ts` | 修改 | `EnvironmentCreateParams` 加可选 `id` 字段 |
| `src/services/environment-web.ts` | 修改 | 预生成 envId，workspacePath 写 `""` |
| `src/services/workspace-fs.ts` | 修改 | 用新公式计算路径，不再读 DB 的 `workspacePath` |

---

### Task 1: 更新 `AgentLaunchSpec` 类型 + `workspace-resolver.ts`

**Files:**
- Modify: `packages/plugin-sdk/src/agent-launch-spec.ts:84-92`
- Modify: `src/services/workspace-resolver.ts`
- Modify: `src/__tests__/workspace-resolver.test.ts`

- [ ] **Step 1: 给 `AgentLaunchSpec` 加 `environmentId` 字段**

`packages/plugin-sdk/src/agent-launch-spec.ts` — 在 `userId` 后面加一行：

```typescript
export interface AgentLaunchSpec {
  organizationId: string;
  userId: string;
  environmentId?: string;
  env?: Record<string, string>;
  agent: AgentConfig;
  model: ModelConfig;
  skills: SkillConfig[];
  mcpServers: McpServerConfig[];
}
```

- [ ] **Step 2: 更新 `workspace-resolver.ts` 签名**

`src/services/workspace-resolver.ts` — 改为接收三个参数：

```typescript
import { join } from "node:path";

/**
 * 根据 organizationId + userId + environmentId 计算隔离的 workspace 路径。
 *
 * 路径公式: {WORKSPACE_ROOT ?? cwd/workspaces}/{organizationId}/{userId}/{environmentId}
 */
export function resolveWorkspacePath(organizationId: string, userId: string, environmentId: string): string {
  const root = process.env.WORKSPACE_ROOT ?? join(process.cwd(), "workspaces");
  return join(root, organizationId, userId, environmentId);
}
```

- [ ] **Step 3: 更新 workspace-resolver 测试**

`src/__tests__/workspace-resolver.test.ts` — 全部测试加 envId 参数，新增 envId 隔离测试：

```typescript
import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { resolveWorkspacePath } from "../services/workspace-resolver";

describe("resolveWorkspacePath", () => {
  // WORKSPACE_ROOT 未设置时使用 cwd/workspaces
  test("默认使用 cwd/workspaces 作为根目录", () => {
    const original = process.env.WORKSPACE_ROOT;
    delete process.env.WORKSPACE_ROOT;

    const result = resolveWorkspacePath("org-1", "user-1", "env-1");
    expect(result).toBe(join(process.cwd(), "workspaces", "org-1", "user-1", "env-1"));

    if (original !== undefined) process.env.WORKSPACE_ROOT = original;
  });

  // WORKSPACE_ROOT 已设置时使用配置值
  test("WORKSPACE_ROOT 已设置时使用配置值", () => {
    const original = process.env.WORKSPACE_ROOT;
    process.env.WORKSPACE_ROOT = "/data/rcs";

    const result = resolveWorkspacePath("org-1", "user-1", "env-1");
    expect(result).toBe("/data/rcs/org-1/user-1/env-1");

    if (original !== undefined) process.env.WORKSPACE_ROOT = original;
    else delete process.env.WORKSPACE_ROOT;
  });

  // 不同 orgId + userId + envId 组合产生不同路径
  test("不同 orgId + userId + envId 产生不同路径", () => {
    const original = process.env.WORKSPACE_ROOT;
    delete process.env.WORKSPACE_ROOT;

    const path1 = resolveWorkspacePath("org-a", "user-1", "env-1");
    const path2 = resolveWorkspacePath("org-a", "user-1", "env-2");
    const path3 = resolveWorkspacePath("org-a", "user-2", "env-1");
    const path4 = resolveWorkspacePath("org-b", "user-1", "env-1");

    expect(path1).not.toBe(path2);
    expect(path1).not.toBe(path3);
    expect(path1).not.toBe(path4);
    expect(path2).not.toBe(path3);
    expect(path2).not.toBe(path4);
    expect(path3).not.toBe(path4);

    if (original !== undefined) process.env.WORKSPACE_ROOT = original;
  });

  // envId 不同时路径不同
  test("相同 org/user 下不同 envId 产生不同路径", () => {
    const original = process.env.WORKSPACE_ROOT;
    process.env.WORKSPACE_ROOT = "/data";

    const pathA = resolveWorkspacePath("org-1", "user-1", "env-aaa");
    const pathB = resolveWorkspacePath("org-1", "user-1", "env-bbb");

    expect(pathA).toBe("/data/org-1/user-1/env-aaa");
    expect(pathB).toBe("/data/org-1/user-1/env-bbb");
    expect(pathA).not.toBe(pathB);

    if (original !== undefined) process.env.WORKSPACE_ROOT = original;
    else delete process.env.WORKSPACE_ROOT;
  });
});
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test src/__tests__/workspace-resolver.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/plugin-sdk/src/agent-launch-spec.ts src/services/workspace-resolver.ts src/__tests__/workspace-resolver.test.ts
git commit -m "feat: workspace 隔离路径加 envId 层，AgentLaunchSpec 加 environmentId 字段"
```

---

### Task 2: 更新 opencode-runtime.ts 的 `resolveWorkspace`

**Files:**
- Modify: `packages/plugin-opencode/src/runtime/opencode-runtime.ts:106-109`
- Modify: `packages/plugin-opencode/src/__tests__/opencode-runtime.test.ts`

- [ ] **Step 1: 修改 `resolveWorkspace` 函数**

`packages/plugin-opencode/src/runtime/opencode-runtime.ts` — 在 `resolveWorkspace` 函数中加入 `environmentId` 层：

```typescript
function resolveWorkspace(launchSpec: AgentLaunchSpec): string {
  const root = process.env.WORKSPACE_ROOT ?? join(process.cwd(), "workspaces");
  if (launchSpec.environmentId) {
    return join(root, launchSpec.organizationId, launchSpec.userId, launchSpec.environmentId);
  }
  return join(root, launchSpec.organizationId, launchSpec.userId);
}
```

注意：保留无 `environmentId` 时的 fallback（两段路径），确保 v1 / ACP 注册等不走 `createWebEnvironment` 的路径仍然能工作。

- [ ] **Step 2: 更新 opencode-runtime 测试**

`packages/plugin-opencode/src/__tests__/opencode-runtime.test.ts` — 更新 `createLaunchSpec` 工厂函数和受影响的断言。

首先，在 `createLaunchSpec` 中加入 `environmentId`：

```typescript
function createLaunchSpec(overrides: Partial<AgentLaunchSpec> = {}): AgentLaunchSpec {
  return {
    organizationId: "org-test",
    userId: "user-test",
    environmentId: "env-test",
    env: { ACP_RCS_TOKEN: "rcs-secret", OPENAI_API_KEY: "sk-test" },
    agent: { name: "writer", prompt: "Be precise" },
    model: {
      provider: "openai",
      protocol: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test",
      model: "gpt-4.1",
      modelName: "gpt-4.1",
    },
    skills: [{ name: "writer-skill", url: "https://example.com/writer.zip" }],
    mcpServers: [],
    ...overrides,
  };
}
```

更新断言（把 `/org-test[/\\]user-test$/` 改为包含 envId）：

```typescript
// "caches workspace, launchSpec and prepared state" 测试中：
expect(state?.workspace).toMatch(/org-test[/\\]user-test[/\\]env-test$/);
```

```typescript
// "respects WORKSPACE_ROOT environment variable" 测试中：
expect(state?.workspace).toBe(join(tmpRoot, "org-test", "user-test", "env-test"));
```

```typescript
// "different orgId/userId produce different workspaces" 测试中：
// 需要确保两个 launchSpec 使用不同的 environmentId：
await runtime.prepareEnvironment({
  instanceId: "inst_org_a",
  launchSpec: createLaunchSpec({ organizationId: "org-a", userId: "user-1", environmentId: "env-a" }),
});
await runtime.prepareEnvironment({
  instanceId: "inst_org_b",
  launchSpec: createLaunchSpec({ organizationId: "org-b", userId: "user-1", environmentId: "env-b" }),
});
```

新增测试——无 environmentId 时 fallback 到两段路径：

```typescript
// environmentId 缺失时 fallback 到 org/user 两段路径
test("falls back to org/user path when environmentId is not provided", async () => {
  const runtime = createOpencodeRuntime({
    skillInstallerDependencies: {
      fetch: mockFetch,
      extractArchive: async (_archivePath, targetDir) => {
        await writeFile(join(targetDir, "SKILL.md"), "# installed\n", "utf8");
      },
    },
  });

  await runtime.prepareEnvironment({
    instanceId: "inst_no_envid",
    launchSpec: createLaunchSpec({ environmentId: undefined }),
  });

  const state = runtime.getInstanceState("inst_no_envid");
  expect(state?.workspace).toMatch(/org-test[/\\]user-test$/);
  expect(state?.workspace).not.toMatch(/env-test/);

  if (state?.workspace) {
    await rm(state.workspace, { recursive: true, force: true });
  }
});
```

新增测试——相同 org/user 但不同 envId 产生不同 workspace：

```typescript
// 相同 org/user 下不同 envId 产生不同 workspace
test("different envId under same org/user produces different workspaces", async () => {
  const runtime = createOpencodeRuntime({
    skillInstallerDependencies: {
      fetch: mockFetch,
      extractArchive: async (_archivePath, targetDir) => {
        await writeFile(join(targetDir, "SKILL.md"), "# installed\n", "utf8");
      },
    },
  });

  await runtime.prepareEnvironment({
    instanceId: "inst_env_a",
    launchSpec: createLaunchSpec({ environmentId: "env-alpha" }),
  });
  await runtime.prepareEnvironment({
    instanceId: "inst_env_b",
    launchSpec: createLaunchSpec({ environmentId: "env-beta" }),
  });

  const stateA = runtime.getInstanceState("inst_env_a");
  const stateB = runtime.getInstanceState("inst_env_b");
  expect(stateA?.workspace).not.toBe(stateB?.workspace);
  expect(stateA?.workspace).toMatch(/env-alpha$/);
  expect(stateB?.workspace).toMatch(/env-beta$/);

  for (const state of [stateA, stateB]) {
    if (state?.workspace) {
      await rm(state.workspace, { recursive: true, force: true });
    }
  }
});
```

- [ ] **Step 3: 运行测试确认通过**

Run: `bun test packages/plugin-opencode/src/__tests__/opencode-runtime.test.ts`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/plugin-opencode/src/runtime/opencode-runtime.ts packages/plugin-opencode/src/__tests__/opencode-runtime.test.ts
git commit -m "feat: opencode runtime resolveWorkspace 加入 environmentId 层"
```

---

### Task 3: 更新 launch-spec-builder + instance 传递 environmentId

**Files:**
- Modify: `src/services/launch-spec-builder.ts:99-183`
- Modify: `src/services/instance.ts:150-160`

- [ ] **Step 1: 给 `BuildLaunchSpecInput` 加 `environmentId`，传到输出**

`src/services/launch-spec-builder.ts` — 修改 interface 和 buildLaunchSpec 函数：

在 `BuildLaunchSpecInput` interface 中加一行：

```typescript
export interface BuildLaunchSpecInput {
  organizationId: string;
  userId: string;
  environmentId?: string;
  agentName: string;
  agentConfigId?: string | null;
  agentPrompt?: string | null;
  modelRef?: string | null;
  fullConfig: AgentFullConfig;
  environmentSecret: string;
  extraEnv?: Record<string, string>;
}
```

在 `buildLaunchSpec` 函数体中，解构加入 `environmentId`，并在返回值中传递：

```typescript
export async function buildLaunchSpec(input: BuildLaunchSpecInput): Promise<AgentLaunchSpec> {
  if (_buildLaunchSpec) return _buildLaunchSpec(input);
  const { organizationId, userId, environmentId, agentName, agentConfigId, agentPrompt, modelRef, fullConfig, environmentSecret } =
    input;

  // ... (中间代码不变) ...

  return {
    organizationId,
    userId,
    ...(environmentId ? { environmentId } : {}),
    ...(input.extraEnv ? { env: input.extraEnv } : {}),
    agent,
    model,
    skills,
    mcpServers,
  };
}
```

- [ ] **Step 2: instance.ts 调用时传入 environmentId**

`src/services/instance.ts` — 在 `spawnInstanceFromEnvironment` 的 `buildLaunchSpec` 调用中加入 `environmentId`：

```typescript
  const launchSpec = await buildLaunchSpec({
    organizationId: env.organizationId ?? userId,
    userId: env.userId ?? userId,
    environmentId: environmentId,
    agentName,
    agentConfigId: env.agentConfigId ?? null,
    agentPrompt,
    modelRef,
    fullConfig,
    environmentSecret: env.secret,
    extraEnv: mergedExtraEnv,
  });
```

注意：这里 `environmentId` 就是函数参数 `environmentId: string`（`spawnInstanceFromEnvironment` 的第二个参数），不需要额外获取。

- [ ] **Step 3: 运行现有相关测试确认不破坏**

Run: `bun test src/__tests__/`
Expected: All tests PASS（注意可能有 stub 需要更新，如果有 launch-spec-builder 相关测试的话）

- [ ] **Step 4: Commit**

```bash
git add src/services/launch-spec-builder.ts src/services/instance.ts
git commit -m "feat: launch-spec-builder 传递 environmentId 到 AgentLaunchSpec"
```

---

### Task 4: 更新 environment repo + environment-web.ts

**Files:**
- Modify: `src/repositories/environment.ts:31-49,113-139`
- Modify: `src/services/environment-web.ts:30-31`

- [ ] **Step 1: `EnvironmentCreateParams` 加可选 `id` 字段**

`src/repositories/environment.ts` — 在 `EnvironmentCreateParams` interface 中加入 `id`：

```typescript
export interface EnvironmentCreateParams {
  id?: string;
  name?: string;
  description?: string;
  workspacePath?: string;
  agentConfigId?: string | null;
  secret?: string;
  userId: string;
  organizationId?: string | null;
  status?: string;
  machineName?: string;
  directory?: string;
  branch?: string;
  gitRepoUrl?: string;
  maxSessions?: number;
  workerType?: string;
  username?: string;
  capabilities?: Record<string, unknown>;
  autoStart?: boolean;
}
```

修改 `create` 方法，优先使用传入的 id：

```typescript
async create(params: EnvironmentCreateParams): Promise<EnvironmentRecord> {
  const id = params.id ?? `env_${uuid().replace(/-/g, "")}`;
  const now = new Date();
  const name = params.name || `env-${id.slice(4, 12)}`;
  // ... 其余不变
}
```

- [ ] **Step 2: 更新 `createWebEnvironment` 预生成 envId + workspacePath 写空字符串**

`src/services/environment-web.ts` — 修改 `createWebEnvironment` 函数：

删除旧的 workspace 路径计算和 `resolveWorkspacePath` import，改为：

```typescript
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { agentConfig, environment } from "../db/schema";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import type { EnvironmentUpdateParams } from "../repositories";
import { environmentRepo } from "../repositories";
import * as configPg from "./config-pg";
import type { CreateWebEnvironmentParams, UpdateWebEnvironmentParams } from "./environment-core";
import { generateEnvSecret, getOwnedEnvironment, KEBAB_CASE_RE } from "./environment-core";
import { groupActiveInstancesByEnvironment } from "./instance";
```

在 `createWebEnvironment` 函数体中：

```typescript
export async function createWebEnvironment(params: CreateWebEnvironmentParams) {
  const { name, description, autoStart, userId, organizationId } = params;

  // 名称校验
  if (!name || !KEBAB_CASE_RE.test(name)) {
    throw new ValidationError("name 必须为 kebab-case 格式（小写字母、数字、连字符）");
  }

  // Agent 配置校验：可选，提供时需验证存在性
  if (params.agentConfigId) {
    const agent = await configPg.getAgentConfigById(params.agentConfigId, organizationId);
    if (!agent) throw new ValidationError(`AgentConfig '${params.agentConfigId}' 不存在`);
  }

  // 预生成 environment ID
  const envId = `env_${randomBytes(12).toString("hex")}`;

  // 创建记录，workspacePath 写空字符串（运行时实时计算）
  const secret = generateEnvSecret();
  let record: Awaited<ReturnType<typeof environmentRepo.create>>;
  try {
    record = await environmentRepo.create({
      id: envId,
      name,
      description,
      workspacePath: "",
      status: "idle",
      secret,
      userId,
      organizationId: organizationId ?? userId,
      autoStart: autoStart !== false,
      agentConfigId: params.agentConfigId ?? null,
    });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.message?.includes("unique") || err.message?.includes("duplicate") || err.message?.includes("UNIQUE"))
    ) {
      throw new ConflictError(`环境名称 '${name}' 已存在`);
    }
    throw err;
  }

  return record;
}
```

- [ ] **Step 3: 运行相关测试**

Run: `bun test src/__tests__/`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/repositories/environment.ts src/services/environment-web.ts
git commit -m "feat: environment 创建预生成 ID，workspacePath 写空字符串"
```

---

### Task 5: 更新 workspace-fs.ts 使用新公式

**Files:**
- Modify: `src/services/workspace-fs.ts:109-137`

- [ ] **Step 1: 修改 `resolveWorkspacePath` 使用新路径公式**

`src/services/workspace-fs.ts` — 修改文件内的 `resolveWorkspacePath` 函数，不再读 `env.workspacePath`，改用 `resolveWorkspacePath` from `workspace-resolver`：

在文件顶部加入 import：

```typescript
import { resolveWorkspacePath as computeWorkspacePath } from "./workspace-resolver";
```

修改 `resolveWorkspacePath` 函数（`workspace-fs.ts` 内部的那个同名函数）：

```typescript
export async function resolveWorkspacePath(
  environmentId: string,
  relativePath: string,
): Promise<ResolvedWorkspacePath | null> {
  const env = await environmentRepo.getById(environmentId);
  if (!env) return null;

  const workspaceDir = computeWorkspacePath(
    env.organizationId ?? env.userId ?? "",
    env.userId ?? "",
    env.id,
  );
  const userDir = join(workspaceDir, "user");
  await mkdir(userDir, { recursive: true });

  const normalizedInput = relativePath.trim();
  const userScoped = isUserPath(normalizedInput);
  const baseDir = userScoped ? userDir : workspaceDir;

  let cleanPath = normalizedInput;
  if (userScoped) {
    if (cleanPath.startsWith("user/")) cleanPath = cleanPath.slice(5);
    else if (cleanPath === "user") cleanPath = "";
  }

  const resolvedPath = resolve(baseDir, cleanPath);
  if (!resolvedPath.startsWith(`${baseDir}/`) && resolvedPath !== baseDir) return null;

  const relativeToBase = relative(baseDir, resolvedPath);
  const displayPath = userScoped ? (relativeToBase ? `user/${relativeToBase}` : "user") : relativeToBase || ".";

  return { workspaceDir, userDir, resolved: resolvedPath, displayPath };
}
```

- [ ] **Step 2: 运行相关测试**

Run: `bun test src/__tests__/`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/services/workspace-fs.ts
git commit -m "feat: workspace-fs 使用新公式实时计算路径，不再依赖 DB workspacePath"
```

---

### Task 6: 更新 CLAUDE.md 文档

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: 更新 CLAUDE.md 中的 workspace 相关描述**

在 CLAUDE.md 中搜索并更新以下内容：

1. **Workspace 自动计算** 部分，路径改为：
   `路径：{WORKSPACE_ROOT ?? cwd/workspaces}/{organizationId}/{userId}/{environmentId}`

2. **resolver 引用** 改为：
   `src/services/workspace-resolver.ts：resolveWorkspacePath(orgId, userId, envId)`

3. **常见陷阱** 部分，添加说明：
   `workspace 路径实时计算，不依赖 DB workspacePath 字段。旧 environment 的 workspacePath 为历史值，新 environment 写空字符串。`

4. **架构关键点** 的 Workspace 自动计算描述同步更新

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md 更新 workspace 隔离路径说明"
```

---

### Task 7: 全量测试 + precheck

- [ ] **Step 1: 运行全部后端测试**

Run: `bun test src/__tests__/`
Expected: All tests PASS

- [ ] **Step 2: 运行 plugin 包测试**

Run: `bun test packages/plugin-opencode/src/__tests__/`
Expected: All tests PASS

- [ ] **Step 3: 运行 precheck**

Run: `bun run precheck`
Expected: PASS（格式化 + import 排序 + tsc + biome check）

- [ ] **Step 4: 修复 precheck 发现的问题（如有）**

如果 tsc 或 biome 报错，根据报错修复。

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: workspace env 隔离改造 - precheck 修复"
```
