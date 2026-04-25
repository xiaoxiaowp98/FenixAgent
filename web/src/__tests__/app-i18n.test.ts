import { describe, test, expect } from "bun:test";
import * as fs from "node:fs";

const appSrc = fs.readFileSync("src/App.tsx", "utf-8");

describe("App.tsx i18n Chinese translations", () => {
  test('navItems contains Chinese label "仪表盘"', () => {
    expect(appSrc).toContain('label: "仪表盘"');
  });

  test('session navItem contains Chinese label "会话"', () => {
    expect(appSrc).toContain('label: "会话"');
  });

  test('footerItems API Key item label is "API Key"', () => {
    expect(appSrc).toContain('label: "API Key"');
  });

  test('source does not contain English label "Dashboard"', () => {
    expect(appSrc).not.toContain('label: "Dashboard"');
  });

  test('source does not contain English label "Session" or return "Session"', () => {
    expect(appSrc).not.toContain('label: "Session"');
    expect(appSrc).not.toContain('return "Session"');
  });

  test('source does not contain "Loading..."', () => {
    expect(appSrc).not.toContain('"Loading..."');
  });

  test('source contains "加载中..."', () => {
    expect(appSrc).toContain("加载中...");
  });

  test('source contains "仪表盘" and "会话"', () => {
    const matches1 = appSrc.match(/仪表盘/g);
    expect(matches1).not.toBeNull();
    expect(matches1!.length).toBeGreaterThanOrEqual(2);

    const matches2 = appSrc.match(/会话/g);
    expect(matches2).not.toBeNull();
    expect(matches2!.length).toBeGreaterThanOrEqual(2);
  });
});
