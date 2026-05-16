// importSkillDirectories PG deletes 并行化测试
import { describe, test, expect, mock, beforeEach } from "bun:test";

// mock config-pg
const deleteSkillMock = mock(async (_userId: string, _name: string) => true);
const upsertSkillMock = mock(async () => "skill_1");
const getSkillMock = mock<(_userId: string, _name: string) => Promise<unknown>>(async () => null);

mock.module("../services/config-pg", () => ({
  deleteSkill: deleteSkillMock,
  upsertSkill: upsertSkillMock,
  getSkill: getSkillMock,
  listSkills: mock(async () => []),
}));

// mock skill-fs
mock.module("../services/skill-fs", () => ({
  createSkillValidationError: (msg: string) => new Error(msg),
  groupUploadFiles: (files: { skillName: string; relativePath: string; content: string }[]) => {
    const map = new Map<string, { skillName: string; relativePath: string; content: string }[]>();
    for (const f of files) {
      const arr = map.get(f.skillName) ?? [];
      arr.push(f);
      map.set(f.skillName, arr);
    }
    return map;
  },
  listSkillsFromDir: mock(async () => []),
  readSkillDetailFromMd: mock(async () => null),
  writeSkillMd: mock(async (_dir: string, _name: string) => "/path/SKILL.md"),
  deleteSkillDir: mock(async () => {}),
  resolveImportPlan: (grouped: Map<string, unknown>, _conflicts: unknown[], strategy: string | undefined) => ({
    pendingEntries: strategy === "overwrite" ? Array.from(grouped.entries()) : Array.from(grouped.entries()),
    skipped: [],
  }),
  writeImportFiles: mock(async (_dir: string, entries: [string, unknown][]) => {
    return entries.map(([name]) => name);
  }),
  buildImportedSkillInfos: mock(async (_dir: string, names: string[]) => {
    return names.map((n) => ({ name: n, description: "", path: `/path/${n}/SKILL.md` }));
  }),
  backupSkillDirs: mock(async () => new Map()),
  cleanupWrittenSkills: mock(async () => {}),
  restoreFromBackup: mock(async () => {}),
  createBackupDir: mock(async () => "/tmp/backup"),
  cleanupBackupDir: mock(async () => {}),
}));

import { importSkillDirectories } from "../services/skill";
import type { UploadSkillFile } from "../services/skill-fs";

describe("importSkillDirectories PG deletes 并行化", () => {
  beforeEach(() => {
    deleteSkillMock.mockClear();
    upsertSkillMock.mockClear();
    getSkillMock.mockClear();
  });

  // helper: 构造 UploadSkillFile
  function makeFile(skillName: string): UploadSkillFile {
    return { skillName, relativePath: "SKILL.md", content: `---\nname: ${skillName}\n---\nContent` };
  }

  test("overwrite 策略下冲突 skill 的 PG delete 应并行执行", async () => {
    // 模拟 3 个已存在的 skill
    getSkillMock.mockImplementation(async (_userId: string, name: string) => ({
      name,
      enabled: true,
      contentPath: `/path/${name}/SKILL.md`,
    }));

    await importSkillDirectories("user_1", [makeFile("skill-a"), makeFile("skill-b"), makeFile("skill-c")], "overwrite");

    // deleteSkill 应被调用 3 次（skill-a, skill-b, skill-c）
    expect(deleteSkillMock).toHaveBeenCalledTimes(3);
    const deletedNames = deleteSkillMock.mock.calls.map((c: unknown[]) => c[1] as string).sort();
    expect(deletedNames).toEqual(["skill-a", "skill-b", "skill-c"]);
  });

  test("无冲突时不应调用 deleteSkill", async () => {
    getSkillMock.mockImplementation(async () => null);

    await importSkillDirectories("user_1", [makeFile("new-skill")], "overwrite");

    expect(deleteSkillMock).not.toHaveBeenCalled();
    expect(upsertSkillMock).toHaveBeenCalledTimes(1);
  });

  test("rollback 路径下 PG delete 应并行执行（不掩盖原始错误）", async () => {
    const { buildImportedSkillInfos } = await import("../services/skill-fs");
    (buildImportedSkillInfos as ReturnType<typeof mock>).mockImplementationOnce(async () => {
      throw new Error("disk full");
    });

    getSkillMock.mockImplementation(async () => null);
    deleteSkillMock.mockImplementation(async () => true);

    await expect(
      importSkillDirectories("user_1", [makeFile("fail-skill")]),
    ).rejects.toThrow("disk full");

    expect(deleteSkillMock).toHaveBeenCalledTimes(1);
    expect(deleteSkillMock.mock.calls[0][1]).toBe("fail-skill");
  });

  test("rollback 路径中 deleteSkill 失败不掩盖原始错误", async () => {
    const { buildImportedSkillInfos } = await import("../services/skill-fs");
    (buildImportedSkillInfos as ReturnType<typeof mock>).mockImplementationOnce(async () => {
      throw new Error("original error");
    });

    getSkillMock.mockImplementation(async () => null);
    deleteSkillMock.mockImplementation(async () => { throw new Error("db down"); });

    await expect(
      importSkillDirectories("user_1", [makeFile("fail2")]),
    ).rejects.toThrow("original error");
  });
});
