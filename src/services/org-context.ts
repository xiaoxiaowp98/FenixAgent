import type { AuthContext } from "../plugins/auth";

// ────────────────────────────────────────────
// 测试注入：路由级测试通过 setTestOrgContext 绕过 DB 查询
// ────────────────────────────────────────────

let _testOrgContext: AuthContext | null = null;

export function setTestOrgContext(ctx: AuthContext | null) {
  _testOrgContext = ctx;
}

// 简易 TTL 缓存：避免每个请求都查 DB 解析 org context
const orgCache = new Map<string, { ctx: AuthContext; expiresAt: number }>();
const ORG_CACHE_TTL_MS = 60_000; // 60 秒

function getCachedOrg(userId: string): AuthContext | null {
  const entry = orgCache.get(userId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    orgCache.delete(userId);
    return null;
  }
  return entry.ctx;
}

function setCachedOrg(userId: string, ctx: AuthContext): void {
  orgCache.set(userId, { ctx, expiresAt: Date.now() + ORG_CACHE_TTL_MS });
  if (orgCache.size > 1000) {
    const oldest = orgCache.keys().next().value;
    if (oldest) orgCache.delete(oldest);
  }
}

/** 测试用：清除缓存 */
export function clearOrgCache(): void {
  orgCache.clear();
}

/** 从请求中解析 activeOrganizationId（header > query param > cookie） */
function extractActiveOrgId(request: Request): string | null {
  const header = request.headers.get("x-active-org-id");
  if (header) return header;
  const url = new URL(request.url);
  const query = url.searchParams.get("activeOrganizationId");
  if (query) return query;
  const cookie = request.headers.get("cookie")?.match(/(?:^|;\s*)active_org_id=([^;]+)/)?.[1];
  if (cookie) return cookie;
  return null;
}

/**
 * 从 user + request 加载组织上下文。
 * 解析 activeOrganizationId，通过 better-auth organization API 查角色，构建 AuthContext。
 */
export async function loadOrgContext(user: { id: string }, request: Request): Promise<AuthContext | null> {
  if (_testOrgContext) return _testOrgContext;

  const cached = getCachedOrg(user.id);
  if (cached) return cached;

  try {
    const { auth } = await import("../auth/better-auth");
    const api = auth.api as any;

    const activeOrgId = extractActiveOrgId(request);
    if (activeOrgId) {
      const memberRes = await api.listMembers({
        query: { organizationId: activeOrgId },
        headers: request.headers,
      });
      const memberList: any[] = Array.isArray(memberRes) ? memberRes : (memberRes?.members ?? []);
      const me = memberList.find((m: any) => m.userId === user.id);
      if (me) {
        const result: AuthContext = {
          organizationId: activeOrgId,
          userId: user.id,
          role: me.role as "owner" | "admin" | "member",
        };
        setCachedOrg(user.id, result);
        return result;
      }
    }

    // fallback: 列出用户的组织，取第一个
    const orgs = await api.listOrganizations({ headers: request.headers });
    const orgList: any[] = Array.isArray(orgs) ? orgs : [];
    if (orgList.length > 0) {
      const org = orgList[0];
      const memberRes = await api.listMembers({
        query: { organizationId: org.id },
        headers: request.headers,
      });
      const memberList: any[] = Array.isArray(memberRes) ? memberRes : (memberRes?.members ?? []);
      const me = memberList.find((m: any) => m.userId === user.id);
      if (me) {
        const result: AuthContext = {
          organizationId: org.id,
          userId: user.id,
          role: me.role as "owner" | "admin" | "member",
        };
        setCachedOrg(user.id, result);
        return result;
      }
    }

    // 无组织 → 返回 null（由上层处理首次组织创建）
  } catch (e: any) {
    console.error("[org-context] Failed to load:", e.message);
  }
  return null;
}
