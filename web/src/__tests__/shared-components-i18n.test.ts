import { describe, test, expect } from "bun:test";
import * as fs from "node:fs";

const sidebar = fs.readFileSync("src/components/shell/Sidebar.tsx", "utf-8");
const envList = fs.readFileSync("src/components/EnvironmentList.tsx", "utf-8");
const sessionList = fs.readFileSync("src/components/SessionList.tsx", "utf-8");

describe("Sidebar.tsx i18n", () => {
  test('does not contain "Expand sidebar"', () => {
    expect(sidebar).not.toContain('"Expand sidebar"');
  });

  test('does not contain "Collapse sidebar"', () => {
    expect(sidebar).not.toContain('"Collapse sidebar"');
  });

  test('does not contain >Collapse<', () => {
    expect(sidebar).not.toContain(">Collapse<");
  });

  test('contains "展开侧栏"', () => {
    expect(sidebar).toContain('"展开侧栏"');
  });

  test('contains "收起侧栏"', () => {
    expect(sidebar).toContain('"收起侧栏"');
  });

  test('contains >收起<', () => {
    expect(sidebar).toContain(">收起<");
  });
});

describe("EnvironmentList.tsx i18n", () => {
  test('does not contain "No active environments"', () => {
    expect(envList).not.toContain("No active environments");
  });

  test('contains "暂无活跃环境"', () => {
    expect(envList).toContain("暂无活跃环境");
  });

  test('preserves proper noun "ACP Agent"', () => {
    expect(envList).toContain('"ACP Agent"');
  });

  test('preserves proper noun "Claude Code"', () => {
    expect(envList).toContain('"Claude Code"');
  });
});

describe("SessionList.tsx i18n", () => {
  test('does not contain "No sessions yet"', () => {
    expect(sessionList).not.toContain("No sessions yet");
  });

  test('contains "暂无会话"', () => {
    expect(sessionList).toContain("暂无会话");
  });
});
