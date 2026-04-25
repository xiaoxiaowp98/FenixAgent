import { describe, test, expect } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";

const srcDir = join(import.meta.dirname, "..");
const src = fs.readFileSync(join(srcDir, "pages/Dashboard.tsx"), "utf-8");

describe("Dashboard.tsx i18n Chinese translations", () => {
  test('source does not contain English title "Agents"', () => {
    expect(src).not.toContain(">Agents<");
  });

  test('source does not contain English title "Sessions"', () => {
    expect(src).not.toContain(">Sessions<");
  });

  test('source does not contain English title "Active"', () => {
    expect(src).not.toContain(">Active<");
  });

  test('source contains Chinese title "活跃"', () => {
    const matches = src.match(/>活跃</g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  test('source contains proper noun "Agent" twice', () => {
    const matches = src.match(/>Agent</g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(2);
  });

  test('sr-only title preserves English "Dashboard"', () => {
    expect(src).toContain('sr-only">Dashboard');
  });
});
