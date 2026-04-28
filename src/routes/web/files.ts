import { Hono } from "hono";
import { sessionAuth } from "../../auth/middleware";
import { storeGetSession, storeGetEnvironment, storeListEnvironmentsByUserId } from "../../store";
import { resolve, join, relative } from "node:path";
import { stat, readdir, readFile, writeFile, unlink, mkdir, open } from "node:fs/promises";
import { createReadStream } from "node:fs";

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".yaml", ".yml", ".ts", ".js", ".tsx", ".jsx",
  ".py", ".go", ".rs", ".css", ".html", ".xml", ".toml", ".ini", ".cfg",
  ".sh", ".bash", ".zsh", ".sql", ".env",
]);

/** Map file extension to MIME type for preview mode */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".jsx": "text/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".md": "text/plain",
  ".yaml": "text/plain",
  ".yml": "text/plain",
  ".py": "text/plain",
  ".go": "text/plain",
  ".rs": "text/plain",
  ".sh": "text/plain",
  ".bash": "text/plain",
  ".zsh": "text/plain",
  ".sql": "text/plain",
  ".csv": "text/csv",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};

/**
 * Resolve file path within the workspace.
 * First tries session-based lookup; if session lost (e.g. server restart),
 * falls back to the user's first environment from the database.
 */
async function resolveUserPath(sessionId: string, relativePath: string, userId?: string): Promise<{ userDir: string; resolved: string } | null> {
  const session = storeGetSession(sessionId);
  let envId = session?.environmentId;

  // Fallback: session lost after restart — find environment from DB by userId
  if (!envId && userId) {
    const envs = storeListEnvironmentsByUserId(userId);
    if (envs.length > 0) {
      envId = envs[0].id;
    }
  }

  if (!envId) return null;
  const env = storeGetEnvironment(envId);
  if (!env) return null;
  const userDir = join(env.workspacePath, "user");
  await mkdir(userDir, { recursive: true });

  const resolved = resolve(userDir, relativePath);
  if (!resolved.startsWith(userDir + "/") && resolved !== userDir) return null;
  return { userDir, resolved };
}

async function isTextFile(filePath: string): Promise<boolean> {
  try {
    const buf = Buffer.alloc(8192);
    const fd = await open(filePath, "r");
    const { bytesRead } = await fd.read(buf, 0, 8192, 0);
    await fd.close();
    const slice = buf.subarray(0, bytesRead);
    return !slice.includes(0);
  } catch {
    return false;
  }
}

const app = new Hono();

// GET /:sessionId/user — list directory
app.get("/:sessionId/user", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const sessionId = c.req.param("sessionId")!;
  const queryPath = c.req.query("path") || "";
  const result = await resolveUserPath(sessionId, queryPath, user.id);
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
      path: entry.isDirectory() ? `${relPath}/` : relPath,
      type: entry.isDirectory() ? "dir" : "file",
      size: entry.isFile() ? statInfo.size : 0,
      modifiedAt: statInfo.mtimeMs,
    };
  }));
  return c.json({ entries: items });
});

// GET /:sessionId/user/* — read file (?preview=true returns raw content for iframe)
app.get("/:sessionId/user/:filePath{.+}", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const sessionId = c.req.param("sessionId")!;
  const filePath = c.req.param("filePath")!;
  const preview = c.req.query("preview") === "true";

  const result = await resolveUserPath(sessionId, filePath, user.id);
  if (!result) return c.json({ error: { type: "not_found", message: "Session or environment not found" } }, 404);

  const { resolved } = result;
  let info;
  try { info = await stat(resolved); } catch { return c.json({ error: { type: "not_found", message: "File not found" } }, 404); }
  if (info.isDirectory()) return c.json({ error: { type: "validation_error", message: "Path is a directory, use list endpoint" } }, 400);

  const lastDot = filePath.lastIndexOf(".");
  const lastSlash = filePath.lastIndexOf("/");
  const ext = lastDot > lastSlash ? filePath.substring(lastDot) : "";

  // Preview mode: return raw file content with correct MIME type for iframe embedding
  if (preview) {
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";
    c.header("Content-Type", mimeType);
    c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
    return c.body(createReadStream(resolved) as any);
  }

  const isText = TEXT_EXTENSIONS.has(ext) || (!ext && await isTextFile(resolved));

  if (isText) {
    const content = await readFile(resolved, "utf-8");
    const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
    const relPath = filePath;
    return c.json({ name: fileName, path: relPath, content, size: info.size, encoding: "utf-8" });
  } else {
    const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
    c.header("Content-Disposition", `attachment; filename="${fileName}"`);
    c.header("Content-Type", "application/octet-stream");
    return c.body(createReadStream(resolved) as any);
  }
});

// POST /:sessionId/user/* — upload files
app.post("/:sessionId/user/:dirPath{.*}", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const sessionId = c.req.param("sessionId")!;
  const dirPath = c.req.param("dirPath") || "";

  const result = await resolveUserPath(sessionId, dirPath, user.id);
  if (!result) return c.json({ error: { type: "not_found", message: "Session or environment not found" } }, 404);

  const { resolved } = result;
  await mkdir(resolved, { recursive: true });

  const formData = await c.req.formData();
  const files = formData.getAll("files") as File[];
  if (!files || files.length === 0) return c.json({ error: { type: "validation_error", message: "No files provided" } }, 400);

  const uploaded: Array<{ name: string; path: string; size: number }> = [];
  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > 50 * 1024 * 1024) {
      return c.json({ error: { type: "validation_error", message: `File ${file.name} exceeds 50MB limit` } }, 413);
    }
    const destPath = join(resolved, file.name);
    await writeFile(destPath, buffer);
    uploaded.push({ name: file.name, path: `${dirPath ? dirPath + "/" : ""}${file.name}`, size: buffer.length });
  }
  return c.json({ files: uploaded });
});

// PUT /:sessionId/user/* — write file content
app.put("/:sessionId/user/:filePath{.+}", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const sessionId = c.req.param("sessionId")!;
  const filePath = c.req.param("filePath")!;

  const body = await c.req.json();
  if (typeof body.content !== "string") return c.json({ error: { type: "validation_error", message: "content field required" } }, 400);

  if (body.content.length > 100 * 1024 * 1024) {
    return c.json({ error: { type: "validation_error", message: "Content exceeds 100MB limit" } }, 413);
  }

  const result = await resolveUserPath(sessionId, filePath, user.id);
  if (!result) return c.json({ error: { type: "not_found", message: "Session or environment not found" } }, 404);

  const { resolved } = result;
  await mkdir(resolve(resolved, ".."), { recursive: true });
  const content = body.content;
  await writeFile(resolved, content, "utf-8");
  const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
  return c.json({ name: fileName, path: filePath, size: Buffer.byteLength(content) });
});

// DELETE /:sessionId/user/* — delete file
app.delete("/:sessionId/user/:filePath{.+}", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const sessionId = c.req.param("sessionId")!;
  const filePath = c.req.param("filePath")!;

  const result = await resolveUserPath(sessionId, filePath, user.id);
  if (!result) return c.json({ error: { type: "not_found", message: "Session or environment not found" } }, 404);

  const { resolved } = result;
  let info;
  try { info = await stat(resolved); } catch { return c.json({ error: { type: "not_found", message: "File not found" } }, 404); }
  if (info.isDirectory()) return c.json({ error: { type: "validation_error", message: "Cannot delete directories" } }, 400);

  await unlink(resolved);
  return c.json({ ok: true });
});

export default app;
