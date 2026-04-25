import { describe, test, expect } from "bun:test";
import * as fs from "node:fs";
import { join } from "node:path";

const srcDir = join(import.meta.dirname, "..");
const src = fs.readFileSync(join(srcDir, "pages/ApiKeyManager.tsx"), "utf-8");

describe("ApiKeyManager.tsx i18n Chinese translations", () => {
  // Negative checks - English text should be removed
  test('source does not contain "Failed to load API keys"', () => {
    expect(src).not.toContain('"Failed to load API keys"');
  });

  test('source does not contain "Failed to create key"', () => {
    expect(src).not.toContain('"Failed to create key"');
  });

  test('source does not contain "Failed to delete key"', () => {
    expect(src).not.toContain('"Failed to delete key"');
  });

  test('source does not contain "Failed to update label"', () => {
    expect(src).not.toContain('"Failed to update label"');
  });

  test('source does not contain "Loading..."', () => {
    expect(src).not.toContain("Loading...");
  });

  test('source does not contain >API Keys<', () => {
    expect(src).not.toContain(">API Keys<");
  });

  test('source does not contain >API Key Created<', () => {
    expect(src).not.toContain(">API Key Created<");
  });

  test('source does not contain "Copy this key now"', () => {
    expect(src).not.toContain("Copy this key now");
  });

  test('source does not contain "Copy" as button text', () => {
    expect(src).not.toContain(">Copy<");
  });

  test('source does not contain "Dismiss" as button text', () => {
    expect(src).not.toContain(">Dismiss<");
  });

  test('source does not contain >Create New Key<', () => {
    expect(src).not.toContain(">Create New Key<");
  });

  test('source does not contain placeholder="Label (optional)"', () => {
    expect(src).not.toContain('placeholder="Label (optional)"');
  });

  test('source does not contain "No API keys yet"', () => {
    expect(src).not.toContain("No API keys yet");
  });

  test('source does not contain "Unnamed"', () => {
    expect(src).not.toContain('"Unnamed"');
  });

  test('source does not contain "Save" as button text', () => {
    expect(src).not.toContain(">Save<");
  });

  test('source does not contain "Cancel" as button text', () => {
    expect(src).not.toContain(">Cancel<");
  });

  test('source does not contain "Edit" as button text', () => {
    expect(src).not.toContain(">Edit<");
  });

  test('source does not contain "Delete" as button text', () => {
    expect(src).not.toContain(">Delete<");
  });

  test('source does not contain "Create" as button text', () => {
    expect(src).not.toContain(">Create<");
  });

  // Positive checks - Chinese text should exist
  test('source contains "加载 API Key 失败"', () => {
    expect(src).toContain('"加载 API Key 失败"');
  });

  test('source contains "创建 Key 失败"', () => {
    expect(src).toContain('"创建 Key 失败"');
  });

  test('source contains "删除 Key 失败"', () => {
    expect(src).toContain('"删除 Key 失败"');
  });

  test('source contains "更新标签失败"', () => {
    expect(src).toContain('"更新标签失败"');
  });

  test('source contains "加载中..."', () => {
    expect(src).toContain("加载中...");
  });

  test('source contains "返回"', () => {
    expect(src).toContain("返回");
  });

  test('source contains >API Key< (h1 title)', () => {
    expect(src).toContain(">API Key<");
  });

  test('source contains "已创建"', () => {
    expect(src).toContain("已创建");
  });

  test('source contains "请立即复制此 Key"', () => {
    expect(src).toContain("请立即复制此 Key");
  });

  test('source contains "复制" (copy button)', () => {
    expect(src).toContain("复制");
  });

  test('source contains "关闭" (dismiss button)', () => {
    expect(src).toContain("关闭");
  });

  test('source contains >创建新 Key<', () => {
    expect(src).toContain(">创建新 Key<");
  });

  test('source contains "标签（可选）"', () => {
    expect(src).toContain("标签（可选）");
  });

  test('source contains "暂无 API Key"', () => {
    expect(src).toContain("暂无 API Key");
  });

  test('source contains "未命名"', () => {
    expect(src).toContain('"未命名"');
  });

  test('source contains "保存" (save button)', () => {
    expect(src).toContain("保存");
  });

  test('source contains "取消" (cancel button)', () => {
    expect(src).toContain("取消");
  });

  test('source contains "编辑" (edit button)', () => {
    expect(src).toContain("编辑");
  });

  test('source contains "删除" (delete button)', () => {
    expect(src).toContain("删除");
  });

  test('source contains "创建" (create button)', () => {
    expect(src).toContain("创建");
  });
});
