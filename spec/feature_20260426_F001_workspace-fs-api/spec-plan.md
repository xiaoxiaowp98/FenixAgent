# 工作空间文件系统 API 执行计划

**目标:** 提供会话级文件系统 REST API（限定 workspace/user/ 目录），前端提供 FilePickerDialog 弹窗和 @ 引用集成

**技术栈:** Hono (后端路由), Node fs/promises (文件操作), React + shadcn Dialog (前端组件), Tailwind CSS v4

**设计文档:** spec-design.md

## 改动总览

本次改动涉及后端文件系统 REST API（新建路由文件 + 挂载注册）和前端文件操作层（类型定义 + API 函数 + FilePickerDialog 组件 + ChatInput @ 触发集成）。Task 1 提供后端 CRUD API，Task 2 建立前端调用层，Task 3 创建文件选择弹窗组件，Task 4 将弹窗集成到 ChatInput 输入框。四个 Task 严格顺序依赖：1→2→3→4。关键设计决策：路径操作限定在 `{workspace}/user/` 目录下并通过 `resolveUserPath` 校验防止路径穿越；上传使用 `multipart/form-data` 直接 `fetch` 而非 `api<T>()` 辅助函数（避免 Content-Type 冲突）；ChatInput 通过可选 `sessionId` prop 控制是否启用 @ 文件引用功能。

---

### Task 0: 环境准备

**背景:**
确保构建和测试工具链在当前开发环境中可用，避免后续 Task 因环境问题阻塞。

**执行步骤:**

- [ ] 验证后端构建和测试工具可用
  - 运行 `bun run typecheck` 确认 TypeScript 编译正常
  - 运行 `bun test src/__tests__/ --dry-run 2>&1 || true` 确认测试框架可用

- [ ] 验证前端构建工具可用
  - 运行 `bun run build:web` 确认 Vite 构建正常

**检查步骤:**

- [ ] 后端类型检查通过
  - `bun run typecheck`
  - 预期: 无类型错误

- [ ] 前端构建成功
  - `bun run build:web`
  - 预期: 输出包含 "built in" 且无 error

- [ ] 测试框架可用
  - `bun test src/__tests__/store.test.ts`
  - 预期: 测试运行完成（通过或失败均可，框架不报错即验证通过）

---

### Task 1: 后端文件系统 REST API 路由

**背景:**
环境注册已为每个 environment 绑定 `workspacePath`，但当前无 API 让前端访问工作空间文件。本 Task 创建文件系统 REST API，限定操作范围在 `{workspace}/user/` 目录下，支持列表、读取、上传、写入、删除五项操作。后续 Task 2-4 的前端功能均依赖此 API。

**涉及文件:**
- 新建: `src/routes/web/files.ts`
- 修改: `src/index.ts`

**执行步骤:**

- [ ] 创建 `src/routes/web/files.ts` 文件，包含完整路由实现
  - 位置: 新文件 `src/routes/web/files.ts`
  - 顶部导入:
    ```typescript
    import { Hono } from "hono";
    import { sessionAuth } from "../../auth/middleware";
    import { storeGetSession, storeGetEnvironment } from "../../store";
    import { resolve, join, relative } from "node:path";
    import { stat, readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
    import { createReadStream } from "node:fs";
    ```
  - 定义文本文件扩展名白名单常量:
    ```typescript
    const TEXT_EXTENSIONS = new Set([
      ".txt", ".md", ".json", ".yaml", ".yml", ".ts", ".js", ".tsx", ".jsx",
      ".py", ".go", ".rs", ".css", ".html", ".xml", ".toml", ".ini", ".cfg",
      ".sh", ".bash", ".zsh", ".sql", ".env",
    ]);
    ```

- [ ] 实现 `resolveUserPath` 核心校验函数
  - 位置: `src/routes/web/files.ts`，在常量定义之后、路由定义之前
  - 签名: `async function resolveUserPath(sessionId: string, relativePath: string): Promise<{ userDir: string; resolved: string } | null>`
  - 逻辑:
    ```typescript
    const session = storeGetSession(sessionId);
    if (!session?.environmentId) return null;
    const env = storeGetEnvironment(session.environmentId);
    if (!env) return null;
    const userDir = join(env.workspacePath, "user");
    await mkdir(userDir, { recursive: true });
    const resolved = resolve(userDir, relativePath);
    // 校验路径仍在 user/ 下（防止 ../ 穿越）
    if (!resolved.startsWith(userDir + "/") && resolved !== userDir) return null;
    return { userDir, resolved };
    ```
  - 原因: 所有路由共用此函数完成 session → environment → workspacePath 链路和路径安全校验

- [ ] 实现 GET `/:sessionId/files` 列表路由
  - 位置: `src/routes/web/files.ts`，`const app = new Hono()` 之后
  - 逻辑:
    ```typescript
    app.get("/:sessionId/files", sessionAuth, async (c) => {
      const sessionId = c.req.param("sessionId");
      const queryPath = c.req.query("path") || "";
      const result = await resolveUserPath(sessionId, queryPath);
      if (!result) return c.json({ error: { type: "not_found", message: "Session or environment not found" } }, 404);

      const { userDir, resolved } = result;
      const info = await stat(resolved);
      if (!info.isDirectory()) return c.json({ error: { type: "validation_error", message: "Not a directory" } }, 400);

      const entries = await readdir(resolved, { withFileTypes: true });
      const items = await Promise.all(entries.map(async (entry) => {
        const entryPath = join(resolved, entry.name);
        const statInfo = await stat(entryPath);
        const relPath = relative(userDir, entryPath);
        return {
          name: entry.name,
          path: entry.isDirectory() ? `user/${relPath}/` : `user/${relPath}`,
          type: entry.isDirectory() ? "dir" : "file",
          size: entry.isFile() ? statInfo.size : 0,
          modifiedAt: statInfo.mtimeMs,
        };
      }));
      return c.json({ entries: items });
    });
    ```

- [ ] 实现 GET `/:sessionId/files/*` 读取路由
  - 位置: 列表路由之后
  - 逻辑:
    ```typescript
    app.get("/:sessionId/files/*", sessionAuth, async (c) => {
      const sessionId = c.req.param("sessionId");
      const filePath = c.req.param("*"); // 通配符捕获文件路径
      if (!filePath) return c.json({ error: { type: "validation_error", message: "File path required" } }, 400);

      const result = await resolveUserPath(sessionId, filePath);
      if (!result) return c.json({ error: { type: "not_found", message: "Session or environment not found" } }, 404);

      const { userDir, resolved } = result;
      let info;
      try { info = await stat(resolved); } catch { return c.json({ error: { type: "not_found", message: "File not found" } }, 404); }
      if (info.isDirectory()) return c.json({ error: { type: "validation_error", message: "Path is a directory, use list endpoint" } }, 400);

      const lastDot = filePath.lastIndexOf(".");
      const lastSlash = filePath.lastIndexOf("/");
      const ext = lastDot > lastSlash ? filePath.substring(lastDot) : "";
      const isText = TEXT_EXTENSIONS.has(ext) || (!ext && await isTextFile(resolved));

      if (isText) {
        const content = await readFile(resolved, "utf-8");
        const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
        const relPath = `user/${filePath}`;
        return c.json({ name: fileName, path: relPath, content, size: info.size, encoding: "utf-8" });
      } else {
        const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
        c.header("Content-Disposition", `attachment; filename="${fileName}"`);
        c.header("Content-Type", "application/octet-stream");
        return c.body(createReadStream(resolved));
      }
    });
    ```
  - 辅助函数 `isTextFile`:
    ```typescript
    async function isTextFile(filePath: string): Promise<boolean> {
      try {
        const buf = Buffer.alloc(8192);
        const fd = await import("node:fs/promises").then(m => m.open(filePath, "r"));
        const { bytesRead } = await fd.read(buf, 0, 8192, 0);
        await fd.close();
        const slice = buf.subarray(0, bytesRead);
        return !slice.includes(0); // 无 null 字节则视为文本
      } catch { return false; }
    }
    ```
  - 原因: 需要区分文本和二进制文件，文本返回 JSON 内容，二进制返回下载流

- [ ] 实现 POST `/:sessionId/files/*` 上传路由
  - 位置: 读取路由之后
  - 逻辑:
    ```typescript
    app.post("/:sessionId/files/*", sessionAuth, async (c) => {
      const sessionId = c.req.param("sessionId");
      const dirPath = c.req.param("*") || "";

      const result = await resolveUserPath(sessionId, dirPath);
      if (!result) return c.json({ error: { type: "not_found", message: "Session or environment not found" } }, 404);

      const { userDir, resolved } = result;
      // 确保目标目录存在
      await mkdir(resolved, { recursive: true });

      const formData = await c.req.formData();
      const files = formData.getAll("files") as File[];
      if (!files || files.length === 0) return c.json({ error: { type: "validation_error", message: "No files provided" } }, 400);

      const uploaded: Array<{ name: string; path: string; size: number }> = [];
      for (const file of files) {
        const buffer = Buffer.from(await file.arrayBuffer());
        // 大小限制 50MB
        if (buffer.length > 50 * 1024 * 1024) {
          return c.json({ error: { type: "validation_error", message: `File ${file.name} exceeds 50MB limit` } }, 413);
        }
        const destPath = join(resolved, file.name);
        await writeFile(destPath, buffer);
        uploaded.push({ name: file.name, path: `user/${dirPath ? dirPath + "/" : ""}${file.name}`, size: buffer.length });
      }
      return c.json({ files: uploaded });
    });
    ```

- [ ] 实现 PUT `/:sessionId/files/*` 写入路由
  - 位置: 上传路由之后
  - 逻辑:
    ```typescript
    app.put("/:sessionId/files/*", sessionAuth, async (c) => {
      const sessionId = c.req.param("sessionId");
      const filePath = c.req.param("*");
      if (!filePath) return c.json({ error: { type: "validation_error", message: "File path required" } }, 400);

      const body = await c.req.json();
      if (typeof body.content !== "string") return c.json({ error: { type: "validation_error", message: "content field required" } }, 400);

      // 大小限制 100MB
      if (body.content.length > 100 * 1024 * 1024) {
        return c.json({ error: { type: "validation_error", message: "Content exceeds 100MB limit" } }, 413);
      }

      const result = await resolveUserPath(sessionId, filePath);
      if (!result) return c.json({ error: { type: "not_found", message: "Session or environment not found" } }, 404);

      const { resolved } = result;
      // 自动创建中间目录
      await mkdir(resolve(resolved, ".."), { recursive: true });
      const content = body.content;
      await writeFile(resolved, content, "utf-8");
      const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
      return c.json({ name: fileName, path: `user/${filePath}`, size: Buffer.byteLength(content) });
    });
    ```

- [ ] 实现 DELETE `/:sessionId/files/*` 删除路由
  - 位置: 写入路由之后
  - 逻辑:
    ```typescript
    app.delete("/:sessionId/files/*", sessionAuth, async (c) => {
      const sessionId = c.req.param("sessionId");
      const filePath = c.req.param("*");
      if (!filePath) return c.json({ error: { type: "validation_error", message: "File path required" } }, 400);

      const result = await resolveUserPath(sessionId, filePath);
      if (!result) return c.json({ error: { type: "not_found", message: "Session or environment not found" } }, 404);

      const { resolved } = result;
      let info;
      try { info = await stat(resolved); } catch { return c.json({ error: { type: "not_found", message: "File not found" } }, 404); }
      if (info.isDirectory()) return c.json({ error: { type: "validation_error", message: "Cannot delete directories" } }, 400);

      await unlink(resolved);
      return c.json({ ok: true });
    });
    ```
  - 原因: 只允许删除文件，不允许删除目录，防止误删整个 workspace

- [ ] 导出路由并添加文件末尾
  - 位置: `src/routes/web/files.ts` 末尾
  - 内容: `export default app;`

- [ ] 在 `src/index.ts` 中注册文件路由
  - 位置: `src/index.ts` 行 19（`import webTasks from "./routes/web/tasks";` 之后）添加导入:
    ```typescript
    import fileRoutes from "./routes/web/files";
    ```
  - 位置: 行 74（`app.route("/web", webSessions);` 之前）添加路由挂载:
    ```typescript
    app.route("/web/sessions", fileRoutes);
    ```
  - 原因: `/web/sessions` 前缀比 `/web` 更具体，必须放在 `app.route("/web", webSessions)` 之前，确保 `/web/sessions/:sessionId/files/*` 优先匹配

- [ ] 为文件系统 API 编写单元测试
  - 测试文件: `src/__tests__/files-route.test.ts`
  - 测试场景:
    - **路径穿越防护**: 构造 `../` 路径的 GET/PUT/DELETE 请求 → 预期返回 404（resolveUserPath 返回 null）
    - **Session 不存在**: 使用无效 sessionId 调用 GET list → 预期返回 404
    - **GET 列表正常**: 创建临时 workspace/user/ 目录并放入测试文件 → 调用 GET list → 预期返回 entries 数组包含测试文件
    - **PUT 写入 + GET 读取**: PUT 写入文本文件 → GET 读取同一文件 → 预期内容一致
    - **DELETE 删除**: PUT 写入文件 → DELETE 删除 → GET 读取 → 预期返回 404
    - **DELETE 拒绝删除目录**: 对目录路径调用 DELETE → 预期返回 400
    - **上传文件**: 构造 multipart/form-data POST 请求 → 预期文件被创建且返回 path/size
  - Mock 策略: 使用 `mock.module()` mock `../store` 中的 `storeGetSession` 和 `storeGetEnvironment`，mock `../auth/middleware` 中的 `sessionAuth` 为透传中间件。创建临时目录作为 workspacePath
  - 运行命令: `bun test src/__tests__/files-route.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [ ] 验证新路由文件语法正确
  - `npx tsc --noEmit src/routes/web/files.ts 2>&1 | head -20`
  - 预期: 无类型错误（注意：由于项目使用 bun 类型，可能需要在项目上下文中检查）

- [ ] 验证路由已注册（index.ts 包含 import 和 route 调用）
  - `grep -n 'fileRoutes\|files' src/index.ts`
  - 预期: 输出包含 import 行和 `app.route("/web/sessions", fileRoutes)` 行

- [ ] 验证 resolveUserPath 函数存在且包含安全校验逻辑
  - `grep -n 'startsWith\|resolveUserPath' src/routes/web/files.ts`
  - 预期: 包含 `resolveUserPath` 定义和 `startsWith(userDir` 校验

- [ ] 运行单元测试
  - `bun test src/__tests__/files-route.test.ts`
  - 预期: 所有测试通过

- [ ] 类型检查通过
  - `bun run typecheck`
  - 预期: 无新增类型错误


---

### Task 2: 前端类型定义和 API 函数

**背景:**
Task 1 已创建后端文件系统 REST API，本 Task 在前端建立对应的类型定义和 API 调用层。前端类型定义确保编译期类型安全，API 函数封装 HTTP 调用细节，供 Task 3（FilePickerDialog）和 Task 4（ChatInput @ 触发）直接使用。本 Task 是前端功能的基础层。

**涉及文件:**
- 修改: `web/src/types/index.ts`
- 修改: `web/src/api/client.ts`

**执行步骤:**

- [ ] 在 `web/src/types/index.ts` 末尾追加文件相关类型定义
  - 位置: 文件末尾（`AutomationActivity` 接口之后）
  - 新增内容:
    ```typescript
    // --- File System Types ---

    export interface FileInfo {
      name: string;
      path: string;
      type: "file" | "dir";
      size: number;
      modifiedAt: number;
    }

    export interface FileListResponse {
      entries: FileInfo[];
    }

    export interface FileContent {
      name: string;
      path: string;
      content: string;
      size: number;
      encoding: string;
    }

    export interface FileUploadResult {
      files: Array<{ name: string; path: string; size: number }>;
    }

    export interface FileWriteResult {
      name: string;
      path: string;
      size: number;
    }
    ```
  - 原因: 后端 API 返回的 JSON 结构需对应的前端类型，Task 3 和 Task 4 的组件 Props 依赖这些类型

- [ ] 在 `web/src/api/client.ts` 文件中追加文件操作 API 函数
  - 位置: 文件末尾（`apiClearTaskLogs` 函数之后），添加 `// --- Files ---` 分组注释
  - 新增 5 个函数:
    ```typescript
    // --- Files ---

    export function apiListFiles(sessionId: string, dirPath?: string) {
      const query = dirPath ? `?path=${encodeURIComponent(dirPath)}` : "";
      return api<FileListResponse>("GET", `/web/sessions/${sessionId}/files${query}`);
    }

    export function apiReadFile(sessionId: string, filePath: string) {
      const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
      return api<FileContent>("GET", `/web/sessions/${sessionId}/files/${encodedPath}`);
    }

    export async function apiUploadFile(sessionId: string, dirPath: string, files: File[]) {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));
      const encodedDir = dirPath.split("/").map(encodeURIComponent).join("/");
      const res = await fetch(`/web/sessions/${sessionId}/files/${encodedDir}`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        const err = data.error || { type: "unknown", message: res.statusText };
        throw new Error(err.message || err.type);
      }
      return data as FileUploadResult;
    }

    export function apiWriteFile(sessionId: string, filePath: string, content: string) {
      const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
      return api<FileWriteResult>("PUT", `/web/sessions/${sessionId}/files/${encodedPath}`, { content });
    }

    export function apiDeleteFile(sessionId: string, filePath: string) {
      const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
      return api<{ ok: boolean }>("DELETE", `/web/sessions/${sessionId}/files/${encodedPath}`);
    }
    ```
  - 注意: `apiUploadFile` 不使用 `api<T>()` 辅助函数，因为 multipart/form-data 不可设置 `Content-Type: application/json` header，直接使用 `fetch` + `FormData`，但仍需 `credentials: "include"` 携带 cookie
  - 原因: 5 个函数分别对应 Task 1 后端的 5 个路由端点

- [ ] 在 `web/src/api/client.ts` 顶部导入区域追加类型导入
  - 位置: 文件第 2 行（`import type { ... } from "../types/config";` 之后）
  - 新增导入:
    ```typescript
    import type { FileListResponse, FileContent, FileUploadResult, FileWriteResult } from "../types";
    ```
  - 原因: API 函数的泛型参数需要引用前端类型定义

- [ ] 为文件 API 函数编写单元测试
  - 测试文件: `web/src/__tests__/file-api.test.ts`
  - 测试场景:
    - **apiListFiles 无参数**: 构造 `sessionId="s1"` 调用 `apiListFiles("s1")`，mock fetch 验证请求 URL 为 `/web/sessions/s1/files`，方法为 GET
    - **apiListFiles 带目录参数**: `apiListFiles("s1", "docs/")` → 验证 URL 为 `/web/sessions/s1/files?path=docs%2F`
    - **apiReadFile**: `apiReadFile("s1", "readme.md")` → 验证 URL 包含编码路径 `/web/sessions/s1/files/readme.md`
    - **apiUploadFile**: `apiUploadFile("s1", "docs/", [new File([""], "a.txt")])` → 验证请求方法为 POST，body 为 FormData 实例，包含 credentials: "include"
    - **apiWriteFile**: `apiWriteFile("s1", "notes.txt", "hello")` → 验证方法为 PUT，body JSON 含 `{ content: "hello" }`
    - **apiDeleteFile**: `apiDeleteFile("s1", "old.txt")` → 验证方法为 DELETE
  - Mock 方式: 使用 `mock.module()` mock 全局 `fetch`，返回预设 JSON 响应
  - 运行命令: `bun test web/src/__tests__/file-api.test.ts`
  - 预期: 所有测试通过

**检查步骤:**

- [ ] 验证类型定义存在且导出正确
  - `grep -c "export interface FileInfo\|export interface FileContent\|export interface FileListResponse\|export interface FileUploadResult\|export interface FileWriteResult" /Users/konghayao/code/pazhou/remote-control-server/web/src/types/index.ts`
  - 预期: 输出 5（5 个接口均已导出）

- [ ] 验证 API 函数存在且导出正确
  - `grep -c "export function apiListFiles\|export function apiReadFile\|export async function apiUploadFile\|export function apiWriteFile\|export function apiDeleteFile" /Users/konghayao/code/pazhou/remote-control-server/web/src/api/client.ts`
  - 预期: 输出 5（5 个函数均已导出）

- [ ] 验证类型导入存在
  - `grep "FileListResponse\|FileContent\|FileUploadResult\|FileWriteResult" /Users/konghayao/code/pazhou/remote-control-server/web/src/api/client.ts | head -3`
  - 预期: 第一行 import 语句包含这 4 个类型

- [ ] 运行单元测试通过
  - `bun test web/src/__tests__/file-api.test.ts`
  - 预期: 所有测试通过

- [ ] 类型检查通过
  - `cd /Users/konghayao/code/pazhou/remote-control-server && bun run typecheck`
  - 预期: 无新增类型错误

---

### Task 3: FilePickerDialog 文件选择弹窗

**背景:**
Task 1 和 Task 2 已提供完整的后端 API 和前端调用层。本 Task 创建 FilePickerDialog 组件，作为用户浏览工作空间文件的交互入口。用户在输入框键入 `@` 时（由 Task 4 的 ChatInput 触发），弹出此对话框，展示 `user/` 目录下的文件列表，支持逐层展开子目录、上传新文件、搜索过滤。选中文件后通过 `onSelect` 回调将文件信息返回给 ChatInput，最终以 `@filename` 标记插入输入框。

**涉及文件:**
- 新建: `web/src/components/FilePickerDialog.tsx`

**执行步骤:**

- [ ] 创建 `web/src/components/FilePickerDialog.tsx` 文件骨架
  - 位置: 新文件 `web/src/components/FilePickerDialog.tsx`
  - 顶部导入:
    ```typescript
    import { useState, useEffect, useCallback, useRef } from "react";
    import { apiListFiles, apiUploadFile } from "../api/client";
    import type { FileInfo } from "../types";
    import {
      Dialog,
      DialogContent,
      DialogHeader,
      DialogTitle,
    } from "../../components/ui/dialog";
    import { Button } from "../../components/ui/button";
    import { Input } from "../../components/ui/input";
    import { Folder, File, Upload, ChevronRight, ArrowLeft, Loader2, X } from "lucide-react";
    ```
  - Props 接口定义:
    ```typescript
    interface FilePickerDialogProps {
      open: boolean;
      sessionId: string;
      onClose: () => void;
      onSelect: (file: FileInfo) => void;
    }
    ```

- [ ] 实现文件列表状态管理和数据加载逻辑
  - 位置: `FilePickerDialog` 函数组件内部，return 语句之前
  - 状态变量:
    ```typescript
    const [entries, setEntries] = useState<FileInfo[]>([]);
    const [currentDir, setCurrentDir] = useState<string>("");  // 相对于 user/ 的路径
    const [dirStack, setDirStack] = useState<string[]>([]);    // 导航栈，用于返回上级
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searchFilter, setSearchFilter] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);
    ```
  - 加载函数 `loadDirectory`:
    ```typescript
    const loadDirectory = useCallback(async (dirPath: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiListFiles(sessionId, dirPath || undefined);
        setEntries(result.entries);
        setCurrentDir(dirPath);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load files");
      } finally {
        setLoading(false);
      }
    }, [sessionId]);
    ```
  - `open` 变化时加载根目录:
    ```typescript
    useEffect(() => {
      if (open) {
        setDirStack([]);
        setSearchFilter("");
        loadDirectory("");
      }
    }, [open, loadDirectory]);
    ```

- [ ] 实现目录导航交互逻辑
  - 位置: 紧接加载逻辑之后
  - 进入子目录:
    ```typescript
    const handleEnterDir = useCallback((dir: FileInfo) => {
      // dir.path 格式为 "user/docs/"，提取相对于 user/ 的部分
      const relativePath = dir.path.startsWith("user/") ? dir.path.slice(5) : dir.path;
      setDirStack((prev) => [...prev, currentDir]);
      loadDirectory(relativePath);
    }, [currentDir, loadDirectory]);
    ```
  - 返回上级目录:
    ```typescript
    const handleGoBack = useCallback(() => {
      const prevDir = dirStack[dirStack.length - 1];
      setDirStack((stack) => stack.slice(0, -1));
      loadDirectory(prevDir || "");
    }, [dirStack, loadDirectory]);
    ```

- [ ] 实现文件上传逻辑
  - 位置: 导航逻辑之后
  - 上传处理:
    ```typescript
    const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;
      setLoading(true);
      setError(null);
      try {
        await apiUploadFile(sessionId, currentDir, Array.from(files));
        await loadDirectory(currentDir);  // 刷新列表
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setLoading(false);
        // 清空 input 以便重复选择
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }, [sessionId, currentDir, loadDirectory]);
    ```

- [ ] 实现文件选择和列表项点击逻辑
  - 位置: 上传逻辑之后
  - 列表项点击:
    ```typescript
    const handleItemClick = useCallback((entry: FileInfo) => {
      if (entry.type === "dir") {
        handleEnterDir(entry);
      } else {
        onSelect(entry);
        onClose();
      }
    }, [handleEnterDir, onSelect, onClose]);
    ```

- [ ] 实现 JSX 渲染部分
  - 位置: 所有逻辑之后，return 语句
  - 关键结构:
    ```tsx
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-lg rounded-2xl border-border bg-surface-1 p-0 shadow-2xl overflow-hidden">
          {/* 头部：标题 + 搜索 + 上传按钮 */}
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle className="font-display text-lg font-semibold text-text-primary">选择文件</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-2 px-4 pb-2">
            <Input
              type="text"
              placeholder="搜索文件..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              className="h-8 w-8 text-text-muted hover:text-brand hover:bg-brand/10"
              title="上传文件"
            >
              <Upload className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
          </div>

          {/* 面包屑导航：返回按钮 + 当前路径 */}
          {dirStack.length > 0 && (
            <div className="flex items-center gap-1 px-4 pb-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={handleGoBack}
                className="h-6 w-6 text-text-muted hover:text-text-primary"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-text-muted font-display">
                user/{currentDir}
              </span>
            </div>
          )}

          {/* 文件列表 */}
          <div className="max-h-80 overflow-y-auto px-2 pb-2">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
              </div>
            )}
            {error && (
              <div className="px-2 py-4 text-center text-sm text-status-error">{error}</div>
            )}
            {!loading && !error && filteredEntries.length === 0 && (
              <div className="px-2 py-4 text-center text-sm text-text-muted">暂无文件</div>
            )}
            {!loading && !error && filteredEntries.map((entry) => (
              <button
                key={entry.path}
                type="button"
                onClick={() => handleItemClick(entry)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left hover:bg-surface-2 transition-colors group"
              >
                {entry.type === "dir" ? (
                  <Folder className="h-4 w-4 text-brand flex-shrink-0" />
                ) : (
                  <File className="h-4 w-4 text-text-muted flex-shrink-0" />
                )}
                <span className="flex-1 text-sm text-text-primary truncate font-display">{entry.name}</span>
                {entry.type === "file" && (
                  <span className="text-xs text-text-muted">{formatFileSize(entry.size)}</span>
                )}
                {entry.type === "dir" && (
                  <ChevronRight className="h-3.5 w-3.5 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    );
    ```
  - 搜索过滤逻辑（在 return 之前计算）:
    ```typescript
    const filteredEntries = searchFilter
      ? entries.filter((e) => e.name.toLowerCase().includes(searchFilter.toLowerCase()))
      : entries;
    ```
  - 文件大小格式化辅助函数:
    ```typescript
    function formatFileSize(bytes: number): string {
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    ```

- [ ] 为 FilePickerDialog 编写单元测试
  - 测试文件: `web/src/__tests__/file-picker-dialog.test.tsx`
  - 测试场景:
    - **渲染弹窗**: 传入 `open={true}`, `sessionId="s1"` → 验证 Dialog 标题 "选择文件" 渲染正确
    - **目录导航**: mock `apiListFiles` 返回含目录的 `entries`，点击目录项 → 验证再次调用 `apiListFiles` 并传入子目录路径
    - **文件选中**: mock `apiListFiles` 返回含文件的 `entries`，点击文件项 → 验证 `onSelect` 被调用且参数为对应 `FileInfo`
    - **上传文件**: 触发隐藏 `<input>` 的 change 事件 → 验证 `apiUploadFile` 被调用，参数包含正确的 sessionId 和文件数组
    - **搜索过滤**: 输入搜索关键词 → 验证列表仅显示匹配项
    - **返回上级**: 进入子目录后点击返回按钮 → 验证 `apiListFiles` 使用上级目录路径
  - Mock 方式: 使用 `mock.module()` mock `../api/client`，返回预设的文件列表
  - 渲染方式: 使用 React Testing Library 的 `render` + `screen`
  - 运行命令: `bun test web/src/__tests__/file-picker-dialog.test.tsx`
  - 预期: 所有测试通过

**检查步骤:**

- [ ] 验证组件文件存在且导出正确
  - `grep -c "export function FilePickerDialog" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/FilePickerDialog.tsx`
  - 预期: 输出 1

- [ ] 验证组件导入了必要的依赖
  - `grep "import.*Dialog\|import.*apiListFiles\|import.*apiUploadFile\|import.*FileInfo" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/FilePickerDialog.tsx`
  - 预期: 包含 Dialog 组件、API 函数、FileInfo 类型的导入语句

- [ ] 验证 Props 接口定义正确
  - `grep "open.*boolean\|sessionId.*string\|onClose\|onSelect.*FileInfo" /Users/konghayao/code/pazhou/remote-control-server/web/src/components/FilePickerDialog.tsx`
  - 预期: 包含 open、sessionId、onClose、onSelect 四个 Props

- [ ] 运行单元测试通过
  - `bun test web/src/__tests__/file-picker-dialog.test.tsx`
  - 预期: 所有测试通过

- [ ] 类型检查通过
  - `bun run typecheck`
  - 预期: 无新增类型错误

---

### Task 4: ChatInput @ 触发与附件传递

**背景:**
Task 1-3 已完成文件 API、类型定义和 FilePickerDialog 组件。本 Task 将 @ 文件引用机制集成到 ChatInput 组件中：用户输入 `@` 时弹出 FilePickerDialog，选择文件后在输入框插入 `@filename` 标记，发送消息时将文件引用作为 `attachments` 传递给上层。ChatInput 被 SessionDetail.tsx（非 ACP 会话）和 ChatInterface.tsx（ACP 会话）两处使用，两处均需传递 `sessionId` prop。

**涉及文件:**
- 修改: `web/components/chat/ChatInput.tsx`
- 修改: `web/src/lib/types.ts`

**执行步骤:**

- [ ] 在 `web/src/lib/types.ts` 中扩展 `ChatInputMessage` 类型
  - 位置: `ChatInputMessage` 接口定义处（~L84-87）
  - 新增 `attachments` 字段:
    ```typescript
    export interface ChatInputMessage {
      text: string;
      images?: UserMessageImage[];
      attachments?: FileAttachment[];
    }

    export interface FileAttachment {
      name: string;
      path: string;
    }
    ```
  - 原因: 消息发送时需携带文件引用信息，`FileAttachment` 包含文件名和相对路径（如 `user/docs/report.pdf`），与 spec-design.md 中的消息 payload 格式一致

- [ ] 在 `web/components/chat/ChatInput.tsx` 中新增 `sessionId` 和 `onFileSelect` Props
  - 位置: `ChatInputProps` 接口（~L22-33）
  - 在现有 Props 末尾新增:
    ```typescript
    /** 当前会话 ID，用于触发 @ 文件选择 */
    sessionId?: string;
    ```
  - 在解构 Props 处（~L35-44）新增 `sessionId` 解构
  - 原因: FilePickerDialog 需要 `sessionId` 调用文件 API，不传则不启用 @ 触发

- [ ] 在 `web/components/chat/ChatInput.tsx` 中新增文件选择相关状态
  - 位置: `showCommandMenu` 状态声明之后（~L48）
  - 新增状态:
    ```typescript
    const [showFilePicker, setShowFilePicker] = useState(false);
    const [attachments, setAttachments] = useState<FileAttachment[]>([]);
    ```
  - 在文件顶部导入区新增:
    ```typescript
    import { FilePickerDialog } from "../../src/components/FilePickerDialog";
    import type { FileInfo } from "../../src/types";
    import type { FileAttachment } from "../../src/lib/types";
    ```
  - 原因: `showFilePicker` 控制 FilePickerDialog 显隐，`attachments` 存储已选中的文件引用列表

- [ ] 在 `handleInput` 回调中添加 `@` 检测逻辑
  - 位置: `web/components/chat/ChatInput.tsx` 的 `handleInput` 函数（~L99-116），在 slash 命令检测逻辑之后
  - 在 `} else if (showCommandMenu) {` 代码块之后追加:
    ```typescript
    // 检测 @ 文件引用触发：文本以 @ 开头或光标前字符为空格+@
    if (sessionId && value.endsWith("@")) {
      const prevChar = value.length > 1 ? value[value.length - 2] : " ";
      if (prevChar === " " || value.length === 1) {
        setShowFilePicker(true);
      }
    }
    ```
  - 原因: 仅当文本以 `@` 开头或空格后紧跟 `@` 时触发，避免邮箱地址等场景误触发

- [ ] 实现 `handleFileSelect` 回调
  - 位置: `web/components/chat/ChatInput.tsx`，在 `handleCommandSelect` 回调之后（~L145）
  - 新增:
    ```typescript
    const handleFileSelect = useCallback((file: FileInfo) => {
      // 移除末尾的 @ 触发字符
      setText((prev) => prev.replace(/@$/, ""));
      // 插入 @filename 标记
      setText((prev) => prev + `@${file.name} `);
      // 追加到附件列表（去重）
      setAttachments((prev) => {
        if (prev.some((a) => a.path === file.path)) return prev;
        return [...prev, { name: file.name, path: file.path }];
      });
      setShowFilePicker(false);
      textareaRef.current?.focus();
    }, []);
    ```
  - 原因: 选择文件后移除 `@` 触发字符，插入 `@filename` 标记，记录附件引用

- [ ] 修改 `handleSubmit` 回调以包含 attachments
  - 位置: `web/components/chat/ChatInput.tsx` 的 `handleSubmit` 函数（~L52-65）
  - 将 `onSubmit` 调用修改为:
    ```typescript
    onSubmit({
      text: trimmed,
      images: images.length > 0 ? images : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    });
    ```
  - 在 `setText("")` 和 `setImages([])` 之后追加:
    ```typescript
    setAttachments([]);
    ```
  - 原因: 发送消息时传递附件信息，发送后清空附件列表

- [ ] 在 JSX 中添加 FilePickerDialog 渲染和 @ 按钮
  - 位置: `web/components/chat/ChatInput.tsx` 的 JSX 部分
  - 在 `<div className="relative">` 内部、CommandMenu 之后追加 FilePickerDialog:
    ```tsx
    {/* File Picker Dialog */}
    {showFilePicker && sessionId && (
      <FilePickerDialog
        open={showFilePicker}
        sessionId={sessionId}
        onClose={() => setShowFilePicker(false)}
        onSelect={handleFileSelect}
      />
    )}
    ```
  - 在 slash 命令按钮区域（~L241-258）之后，添加 @ 文件引用按钮（当 sessionId 存在时显示）:
    ```tsx
    {sessionId && (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setShowFilePicker(true)}
        className="flex-shrink-0 h-8 w-8 text-text-muted hover:text-text-secondary hover:bg-surface-1/50"
        disabled={disabled}
        title="引用文件"
      >
        <AtSign className="h-4 w-4" />
      </Button>
    )}
    ```
  - 在 lucide-react 导入中追加 `AtSign`:
    ```typescript
    import { Send, Square, Paperclip, Slash, AtSign } from "lucide-react";
    ```
  - 原因: 提供按钮触发方式和弹出 FilePickerDialog

- [ ] 在附件预览区域（images 预览之后）显示已选中的文件附件
  - 位置: images 预览区域之后、输入区域之前
  - 新增:
    ```tsx
    {attachments.length > 0 && (
      <div className="flex flex-wrap gap-2 px-3 pt-2">
        {attachments.map((att, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-md bg-brand/10 px-2.5 py-1 text-xs text-brand">
            <span className="truncate max-w-[120px]">{att.name}</span>
            <button
              type="button"
              onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
              className="text-text-muted hover:text-text-primary"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    )}
    ```
  - 原因: 用户需可视化已选中的文件附件，支持单独移除

- [ ] 为 ChatInput @ 触发与附件传递编写单元测试
  - 测试文件: `web/src/__tests__/chat-input-attachment.test.tsx`
  - 测试场景:
    - **@ 输入触发**: 渲染 ChatInput 传入 `sessionId="s1"`，模拟 textarea 输入 `"hello @"` → 验证 `showFilePicker` 被设为 true（通过 FilePickerDialog 出现判断）
    - **文件选择后插入标记**: 模拟 `handleFileSelect({ name: "report.pdf", path: "user/report.pdf", type: "file", size: 1024, modifiedAt: 0 })` → 验证 text 状态变为包含 `@report.pdf`
    - **附件追加**: 选择文件后验证 attachments 列表包含 `{ name: "report.pdf", path: "user/report.pdf" }`
    - **发送消息包含附件**: 选择文件后提交 → 验证 onSubmit 回调参数中 `attachments` 数组包含选中文件
    - **发送后清空**: 提交后验证 text、attachments 均被清空
    - **无 sessionId 时不触发**: 渲染 ChatInput 不传 `sessionId`，验证不渲染 @ 按钮
  - 运行命令: `bun test web/src/__tests__/chat-input-attachment.test.tsx`
  - 预期: 所有测试通过

**检查步骤:**

- [ ] 验证 ChatInputMessage 类型扩展
  - `grep "attachments" /Users/konghayao/code/pazhou/remote-control-server/web/src/lib/types.ts`
  - 预期: 输出包含 `attachments?: FileAttachment[]` 和 `FileAttachment` 接口定义

- [ ] 验证 ChatInput Props 新增 sessionId
  - `grep "sessionId" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/ChatInput.tsx`
  - 预期: 输出包含 `sessionId?: string` prop 和 FilePickerDialog 中的 `sessionId={sessionId}`

- [ ] 验证 FilePickerDialog 导入和使用
  - `grep "FilePickerDialog" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/ChatInput.tsx`
  - 预期: 输出包含 import 语句和 JSX 渲染

- [ ] 验证 @ 按钮（AtSign 图标）存在
  - `grep "AtSign" /Users/konghayao/code/pazhou/remote-control-server/web/components/chat/ChatInput.tsx`
  - 预期: 输出包含 import 和 JSX 中的使用

- [ ] 运行单元测试通过
  - `bun test web/src/__tests__/chat-input-attachment.test.tsx`
  - 预期: 所有测试通过

- [ ] 类型检查通过
  - `bun run typecheck`
  - 预期: 无新增类型错误

---

### Task 5: 工作空间文件系统 API 验收

**前置条件:**
- 启动命令: `bun run dev`（后端开发模式）
- 测试数据准备: 需要一个已注册的 environment（含 workspacePath）和一个关联的 session
- 前端已构建: `bun run build:web`

**端到端验证:**

1. 运行完整测试套件确保无回归
   - `bun test src/__tests__/`
   - 预期: 全部测试通过
   - 失败排查: 检查各 Task 的测试步骤（Task 1 files-route.test.ts、Task 2 file-api.test.ts、Task 3 file-picker-dialog.test.tsx、Task 4 chat-input-attachment.test.tsx）

2. 类型检查通过
   - `bun run typecheck`
   - 预期: 无类型错误
   - 失败排查: 检查 Task 2 类型定义和 Task 4 类型扩展是否完整

3. 前端构建成功
   - `bun run build:web`
   - 预期: Vite 构建成功，无编译错误
   - 失败排查: 检查 Task 3 FilePickerDialog 组件和 Task 4 ChatInput 修改是否有导入或语法错误

4. 后端 API 路径穿越防护验证
   - 构造 curl 请求测试 `../` 路径:
     ```bash
     # 需要先创建测试 session（通过测试脚本或手动）
     curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/web/sessions/test-session/files?path=../../../etc/passwd"
     ```
   - 预期: 返回 403 或 404（路径穿越被拦截）
   - 失败排查: 检查 Task 1 resolveUserPath 函数的 startsWith 校验

5. 后端 API Session 校验验证
   - 使用无效 sessionId 调用 API:
     ```bash
     curl -s -o /dev/null -w "%{http_code}" "http://localhost:3001/web/sessions/nonexistent-session/files"
     ```
   - 预期: 返回 404
   - 失败排查: 检查 Task 1 resolveUserPath 函数的 session/environment 查找逻辑

6. 前端 ChatInput 集成验证
   - 打开会话页面，在 ChatInput 中输入 `@`
   - 预期: FilePickerDialog 弹窗出现（需 session 关联了 environment 且 sessionId 已传递给 ChatInput）
   - 失败排查: 检查 Task 4 的 @ 检测逻辑和 SessionDetail.tsx / ChatInterface.tsx 是否传递了 sessionId prop
