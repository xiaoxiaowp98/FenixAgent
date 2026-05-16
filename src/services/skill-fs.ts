/**
 * skill-fs.ts — 纯文件系统操作与工具函数，不依赖 PG。
 *
 * 提供 Skill frontmatter 解析、目录扫描、文件上传校验、
 * 导入/导出备份恢复等基础设施，供 skill.ts 编排层调用。
 */
import { readdir, readFile, writeFile, mkdir, rm, cp, mkdtemp } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

// ────────────────────────────────────────────
// 类型
// ────────────────────────────────────────────

export interface SkillInfo {
  name: string;
  enabled: boolean;
  description: string;
  path: string;
}

export interface SkillDetail {
  name: string;
  description: string;
  content: string;
  enabled: boolean;
  path: string;
  metadata: Record<string, string>;
}

export interface UploadSkillFile {
  skillName: string;
  relativePath: string;
  content: string;
}

export type ImportConflictStrategy = "ignore" | "overwrite";

export interface ImportSkillsConflict {
  name: string;
  enabled: boolean;
  path: string;
}

export interface ImportSkillsResult {
  imported: SkillInfo[];
  skipped: string[];
  conflicts: ImportSkillsConflict[];
}

// resolveImportPlan 的返回结构
export interface ConflictCheckResult {
  pendingEntries: [string, UploadSkillFile[]][];
  skipped: string[];
}

// ────────────────────────────────────────────
// 基础工具函数
// ────────────────────────────────────────────

/** 构造带 VALIDATION_ERROR code 的错误对象 */
export function createSkillValidationError(message: string): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.code = "VALIDATION_ERROR";
  return error;
}

/** 从原始 Markdown 文本中解析 YAML frontmatter */
export function parseFrontmatter(raw: string): { metadata: Record<string, string>; content: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { metadata: {}, content: raw };
  const metadata: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx > 0) metadata[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^"(.*)"$/, "$1");
  }
  return { metadata, content: match[2] };
}

/** 构建 SKILL.md 文件内容（含 frontmatter） */
export function buildSkillMd(name: string, description: string, content: string, metadata?: Record<string, string>): string {
  const meta: Record<string, string> = { name, description, ...(metadata ?? {}) };
  const frontmatter = Object.entries(meta).map(([k, v]) => `${k}: "${v}"`).join("\n");
  return `---\n${frontmatter}\n---\n${content}`;
}

/** 校验并规范化上传文件的相对路径 */
export function normalizeUploadPath(relativePath: string): string {
  const normalized = relativePath.replaceAll("\\", "/").trim();
  if (!normalized || normalized === "." || normalized.startsWith("/")) {
    throw createSkillValidationError("上传文件路径无效");
  }

  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw createSkillValidationError("上传文件路径无效");
  }

  return segments.join("/");
}

/** 按 skillName 分组上传文件，同时校验名称与路径 */
export function groupUploadFiles(files: UploadSkillFile[]): Map<string, UploadSkillFile[]> {
  const grouped = new Map<string, UploadSkillFile[]>();

  for (const file of files) {
    const skillName = file.skillName.trim();
    if (!skillName) {
      throw createSkillValidationError("上传文件缺少 skill 名称");
    }
    if (skillName.includes("/") || skillName.includes("\\")) {
      throw createSkillValidationError(`Skill 名称不合法: ${skillName}`);
    }

    const normalizedPath = normalizeUploadPath(file.relativePath);
    const items = grouped.get(skillName) ?? [];
    if (items.some((item) => item.relativePath === normalizedPath)) {
      throw createSkillValidationError(`Skill "${skillName}" 包含重复文件: ${normalizedPath}`);
    }
    items.push({ ...file, skillName, relativePath: normalizedPath });
    grouped.set(skillName, items);
  }

  return grouped;
}

// ────────────────────────────────────────────
// 目录扫描
// ────────────────────────────────────────────

/** 扫描 baseDir 下所有子目录，解析每个 SKILL.md 的元数据 */
export async function listSkillsFromDir(baseDir: string, enabled = true): Promise<SkillInfo[]> {
  const skills: SkillInfo[] = [];
  if (!existsSync(baseDir)) return skills;
  for (const entry of await readdir(baseDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const mdPath = join(baseDir, entry.name, "SKILL.md");
    if (!existsSync(mdPath)) continue;
    const raw = await readFile(mdPath, "utf-8");
    const { metadata } = parseFrontmatter(raw);
    skills.push({ name: entry.name, enabled, description: metadata.description ?? "", path: mdPath });
  }
  return skills;
}

// ────────────────────────────────────────────
// 导入编排辅助函数
// ────────────────────────────────────────────

/** 读取并解析 SKILL.md，文件不存在返回 null */
export async function readSkillDetailFromMd(mdPath: string): Promise<{ metadata: Record<string, string>; content: string } | null> {
  if (!existsSync(mdPath)) return null;
  const raw = await readFile(mdPath, "utf-8");
  return parseFrontmatter(raw);
}

/** 创建 skillDir，写入 SKILL.md（含 frontmatter），返回 mdPath */
export async function writeSkillMd(
  skillDir: string,
  name: string,
  description: string,
  content: string,
  metadata?: Record<string, string>,
): Promise<string> {
  await mkdir(skillDir, { recursive: true });
  const mdPath = join(skillDir, "SKILL.md");
  const mdContent = buildSkillMd(name, description, content, metadata);
  await writeFile(mdPath, mdContent, "utf-8");
  return mdPath;
}

/** 删除 skill 目录（如果存在） */
export async function deleteSkillDir(skillDir: string): Promise<void> {
  if (existsSync(skillDir)) {
    await rm(skillDir, { recursive: true, force: true });
  }
}

/** 根据冲突列表和策略，决定哪些 entries 需要写入、哪些跳过 */
export function resolveImportPlan(
  grouped: Map<string, UploadSkillFile[]>,
  conflicts: ImportSkillsConflict[],
  strategy?: ImportConflictStrategy,
): ConflictCheckResult {
  const conflictNames = new Set(conflicts.map((item) => item.name));
  const skipped = strategy === "ignore" ? [...conflictNames] : [];
  const pendingEntries = [...grouped.entries()].filter(
    ([name]) => strategy !== "ignore" || !conflictNames.has(name),
  );
  return { pendingEntries, skipped };
}

/** 将 entries 中的文件写入 targetDir 下对应 skill 子目录，返回已写入名称列表 */
export async function writeImportFiles(
  targetDir: string,
  entries: [string, UploadSkillFile[]][],
): Promise<string[]> {
  const writtenNames: string[] = [];
  for (const [name, skillFiles] of entries) {
    const skillDir = join(targetDir, name);
    await mkdir(skillDir, { recursive: true });
    for (const file of skillFiles) {
      const targetPath = join(skillDir, normalizeUploadPath(file.relativePath));
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, file.content, "utf-8");
    }
    writtenNames.push(name);
  }
  return writtenNames;
}

/** 从已写入的 skill 目录读取元数据，构建 SkillInfo 列表 */
export async function buildImportedSkillInfos(
  targetDir: string,
  names: string[],
  enabled = true,
): Promise<SkillInfo[]> {
  const imported: SkillInfo[] = [];
  for (const name of names) {
    const mdPath = join(targetDir, name, "SKILL.md");
    const raw = await readFile(mdPath, "utf-8");
    const { metadata } = parseFrontmatter(raw);
    imported.push({ name, enabled, description: metadata.description ?? "", path: mdPath });
  }
  return imported;
}

/** 创建临时备份目录 */
export async function createBackupDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/** 备份指定名称的 skill 目录到 backupRoot，返回 name→backupPath 映射（null 表示原目录不存在） */
export async function backupSkillDirs(
  backupRoot: string,
  targetDir: string,
  names: string[],
): Promise<Map<string, string | null>> {
  const snapshots = new Map<string, string | null>();
  for (const name of names) {
    const skillDir = join(targetDir, name);
    if (existsSync(skillDir)) {
      const backupPath = join(backupRoot, name);
      await mkdir(backupRoot, { recursive: true });
      await cp(skillDir, backupPath, { recursive: true });
      snapshots.set(name, backupPath);
    } else {
      snapshots.set(name, null);
    }
  }
  return snapshots;
}

/** 删除指定名称的 skill 目录（清理已写入的部分） */
export async function cleanupWrittenSkills(targetDir: string, names: string[]): Promise<void> {
  for (const name of names) {
    const skillDir = join(targetDir, name);
    if (existsSync(skillDir)) {
      await rm(skillDir, { recursive: true, force: true });
    }
  }
}

/** 从备份恢复 skill 目录 */
export async function restoreFromBackup(
  snapshots: Map<string, string | null>,
  targetDir: string,
): Promise<void> {
  for (const [name, backupPath] of snapshots) {
    if (backupPath && existsSync(backupPath)) {
      await cp(backupPath, join(targetDir, name), { recursive: true });
    }
  }
}

/** 删除备份根目录 */
export async function cleanupBackupDir(backupRoot: string): Promise<void> {
  await rm(backupRoot, { recursive: true, force: true });
}
