import { describe, test, expect } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";

const webRoot = join(import.meta.dirname, "..");
const appSrc = fs.readFileSync(join(webRoot, "App.tsx"), "utf-8");

describe("App.tsx i18n Chinese translations", () => {
    test('navItems contains Chinese label "智能体"', () => {
        expect(appSrc).toContain('label: "智能体"');
    });

    test('navItems contains Chinese label "模型"', () => {
        expect(appSrc).toContain('label: "模型"');
    });

    test('navItems contains Chinese label "Agent"', () => {
        expect(appSrc).toContain('label: "Agent"');
    });

    test('navItems contains Chinese label "技能"', () => {
        expect(appSrc).toContain('label: "技能"');
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

    test('source contains "智能体" at least once', () => {
        const matches = appSrc.match(/智能体/g);
        expect(matches).not.toBeNull();
        expect(matches!.length).toBeGreaterThanOrEqual(1);
    });
});
