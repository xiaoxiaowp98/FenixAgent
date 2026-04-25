import { describe, test, expect } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";

const srcDir = join(import.meta.dirname, "..");
const src = fs.readFileSync(join(srcDir, "pages/LoginPage.tsx"), "utf-8");

describe("LoginPage.tsx i18n Chinese translations", () => {
  // Negative checks - English text should be removed
  test('source does not contain "Registration failed"', () => {
    expect(src).not.toContain('"Registration failed"');
  });

  test('source does not contain "Login failed"', () => {
    expect(src).not.toContain('"Login failed"');
  });

  test('source does not contain "Unknown error"', () => {
    expect(src).not.toContain('"Unknown error"');
  });

  test('source does not contain "Create Account"', () => {
    expect(src).not.toContain('"Create Account"');
  });

  test('source does not contain "Sign In"', () => {
    expect(src).not.toContain('"Sign In"');
  });

  test('source does not contain "manage your agents"', () => {
    expect(src).not.toContain('"manage your agents"');
  });

  test('source does not contain "Please wait..."', () => {
    expect(src).not.toContain('"Please wait..."');
  });

  test('source does not contain >Name< label', () => {
    expect(src).not.toContain(">Name<");
  });

  test('source does not contain >Email< label', () => {
    expect(src).not.toContain(">Email<");
  });

  test('source does not contain >Password< label', () => {
    expect(src).not.toContain(">Password<");
  });

  test('source does not contain placeholder "Your name"', () => {
    expect(src).not.toContain('placeholder="Your name"');
  });

  test('source does not contain "Already have an account"', () => {
    expect(src).not.toContain("Already have an account");
  });

  test("source does not contain \"Don't have an account\"", () => {
    expect(src).not.toContain("Don't have an account");
  });

  // Positive checks - Chinese text should exist
  test('source contains "注册失败"', () => {
    expect(src).toContain('"注册失败"');
  });

  test('source contains "登录失败"', () => {
    expect(src).toContain('"登录失败"');
  });

  test('source contains "未知错误"', () => {
    expect(src).toContain('"未知错误"');
  });

  test('source contains "创建账户" at least 3 times (quoted + JSX text)', () => {
    const matches = src.match(/创建账户/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  test('source contains "登录" at least 3 times (quoted + JSX text)', () => {
    const matches = src.match(/登录/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  test('source contains label text "名称"', () => {
    expect(src).toContain("名称");
  });

  test('source contains placeholder "你的名称"', () => {
    expect(src).toContain('placeholder="你的名称"');
  });

  test('source contains label text "邮箱"', () => {
    expect(src).toContain("邮箱");
  });

  test('source contains label text "密码"', () => {
    expect(src).toContain("密码");
  });

  test('source contains "请稍候..."', () => {
    expect(src).toContain('"请稍候..."');
  });

  test('source contains "已有账户？"', () => {
    expect(src).toContain("已有账户？");
  });

  test('source contains "没有账户？"', () => {
    expect(src).toContain("没有账户？");
  });
});
