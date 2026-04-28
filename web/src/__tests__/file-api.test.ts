import { describe, test, expect, beforeEach, mock, afterAll } from "bun:test";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const webSrcDir = resolve(__dirname, "..");

// Mock fetch globally
let mockFetchCalls: Array<{ url: string; method: string; headers?: Record<string, string>; body?: any }> = [];

function mockGlobalFetch(responses: Record<string, { status: number; body: any }>) {
  mockFetchCalls = [];
  mock.module("node:fetch", () => ({
    default: async (url: string, opts?: any) => {
      mockFetchCalls.push({
        url: typeof url === "string" ? url : url.toString(),
        method: opts?.method || "GET",
        headers: opts?.headers,
        body: opts?.body,
      });
      const key = new URL(typeof url === "string" ? url : url.toString(), "http://localhost").pathname;
      const response = responses[key] || responses[Object.keys(responses)[0]];
      return {
        ok: response?.status < 400,
        status: response?.status || 200,
        statusText: response?.status === 200 ? "OK" : "Error",
        json: async () => response?.body || {},
        text: async () => JSON.stringify(response?.body || {}),
      };
    },
  }));
}

// We need to mock the fetch used in browser context
const originalFetch = globalThis.fetch;

describe("File API Functions", () => {
  beforeEach(() => {
    mockFetchCalls = [];
    globalThis.fetch = async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : input.toString();
      mockFetchCalls.push({
        url,
        method: init?.method || "GET",
        headers: init?.headers,
        body: init?.body,
      });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({ success: true }),
        text: async () => JSON.stringify({ success: true }),
      } as any;
    };
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test("apiListFiles — no dir param", async () => {
    const { apiListFiles } = await import("../api/client");
    await apiListFiles("s1");
    expect(mockFetchCalls.length).toBe(1);
    expect(mockFetchCalls[0].url).toBe("/web/sessions/s1/user");
    expect(mockFetchCalls[0].method).toBe("GET");
  });

  test("apiListFiles — with dir param", async () => {
    const { apiListFiles } = await import("../api/client");
    await apiListFiles("s1", "docs/");
    expect(mockFetchCalls.length).toBe(1);
    expect(mockFetchCalls[0].url).toContain("/web/sessions/s1/user?path=");
    expect(mockFetchCalls[0].url).toContain(encodeURIComponent("docs/"));
  });

  test("apiReadFile", async () => {
    const { apiReadFile } = await import("../api/client");
    await apiReadFile("s1", "readme.md");
    expect(mockFetchCalls.length).toBe(1);
    expect(mockFetchCalls[0].url).toContain("/web/sessions/s1/user/readme.md");
    expect(mockFetchCalls[0].method).toBe("GET");
  });

  test("apiUploadFile — uses FormData and POST", async () => {
    const { apiUploadFile } = await import("../api/client");
    const file = new File(["content"], "test.txt");
    await apiUploadFile("s1", "docs/", [file]);
    expect(mockFetchCalls.length).toBe(1);
    expect(mockFetchCalls[0].method).toBe("POST");
    expect(mockFetchCalls[0].body).toBeInstanceOf(FormData);
    expect(mockFetchCalls[0].url).toContain("/web/sessions/s1/user/");
  });

  test("apiWriteFile", async () => {
    const { apiWriteFile } = await import("../api/client");
    await apiWriteFile("s1", "notes.txt", "hello");
    expect(mockFetchCalls.length).toBe(1);
    expect(mockFetchCalls[0].method).toBe("PUT");
    expect(mockFetchCalls[0].url).toContain("/web/sessions/s1/user/notes.txt");
  });

  test("apiDeleteFile", async () => {
    const { apiDeleteFile } = await import("../api/client");
    await apiDeleteFile("s1", "old.txt");
    expect(mockFetchCalls.length).toBe(1);
    expect(mockFetchCalls[0].method).toBe("DELETE");
    expect(mockFetchCalls[0].url).toContain("/web/sessions/s1/user/old.txt");
  });
});
