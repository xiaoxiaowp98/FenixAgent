/**
 * Meta Agent API Client。
 *
 * 对接后端 POST /web/meta-agent/ensure。
 */

export interface EnsureMetaResult {
  environmentId: string;
  instanceId?: string;
  status: "created" | "reused";
}

export async function ensureMetaAgent(): Promise<EnsureMetaResult> {
  const res = await fetch("/web/meta-agent/ensure", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  const json = await res.json();

  if (!res.ok) {
    const errInfo = json.error ?? { message: res.statusText };
    throw new Error(errInfo.message ?? errInfo.type ?? `Request failed (${res.status})`);
  }

  return json.data as EnsureMetaResult;
}
