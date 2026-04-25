import type { Context, Next } from "hono";
import { config } from "../config";
import { verifyWorkerJwt } from "./jwt";
import { validateApiKey } from "./api-key";

/** Extract token from Authorization header or ?token= query param */
function extractToken(c: Context): string | undefined {
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");
  return authHeader?.replace("Bearer ", "") || queryToken;
}

/**
 * Session-based auth for Web UI routes.
 * Reads better-auth session from cookies/headers and injects user into context.
 */
export async function sessionAuth(c: Context, next: Next) {
  const { auth } = await import("./better-auth");
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    return c.json({ error: { type: "unauthorized", message: "Not authenticated" } }, 401);
  }

  c.set("user", {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  });
  c.set("session", {
    id: session.session.id,
    userId: session.session.userId,
    token: session.session.token,
  });

  await next();
}

/**
 * Find or create the system user for legacy global API key fallback.
 */
async function ensureSystemUser(): Promise<{ id: string; email: string; name: string } | null> {
  const { db } = await import("../db");
  const { user } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const { auth } = await import("./better-auth");

  // Look for existing system user
  const rows = await db.select().from(user).where(eq(user.email, "system@rcs.local")).limit(1);
  if (rows.length > 0) {
    return { id: rows[0].id, email: rows[0].email, name: rows[0].name };
  }

  // Try to find any user
  const anyUser = await db.select().from(user).limit(1);
  if (anyUser.length > 0) {
    return { id: anyUser[0].id, email: anyUser[0].email, name: anyUser[0].name };
  }

  // No users at all — auto-create system user
  try {
    const result = await (auth.api.signUpEmail as any)({
      email: "system@rcs.local",
      password: "system",
      name: "System",
    });
    if (result.user) {
      // Auto-generate a per-user API key for future use
      const { createApiKey } = await import("./api-key-service");
      await createApiKey(result.user.id, "legacy-auto");
      return { id: result.user.id, email: result.user.email, name: result.user.name };
    }
  } catch {
    // signUpEmail may fail if user was created concurrently
  }

  return null;
}

/**
 * API Key auth for ACP agent routes.
 * Two-level validation:
 * 1. Per-user API Key (SQLite) → resolves to a specific user
 * 2. Legacy global API Key (RCS_API_KEYS env) → resolves to a system user
 */
export async function apiKeyAuth(c: Context, next: Next) {
  const token = extractToken(c);
  if (!token) {
    return c.json({ error: { type: "unauthorized", message: "Missing API key" } }, 401);
  }

  // 1. Try per-user API Key (SQLite)
  const { validateApiKeyAndGetUser } = await import("./api-key-service");
  const result = await validateApiKeyAndGetUser(token);
  if (result) {
    const { db } = await import("../db");
    const { user } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    const [userRow] = await db.select().from(user).where(eq(user.id, result.userId)).limit(1);
    if (userRow) {
      c.set("user", {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
      });
      await next();
      return;
    }
  }

  // 2. Fallback: legacy global API Key (RCS_API_KEYS env var)
  if (config.apiKeys.length > 0 && config.apiKeys.includes(token)) {
    const systemUser = await ensureSystemUser();
    if (systemUser) {
      c.set("user", systemUser);
      await next();
      return;
    }
  }

  return c.json({ error: { type: "unauthorized", message: "Invalid API key" } }, 401);
}

/** Extract UUID from ?uuid= query param */
export function getUuidFromRequest(c: Context): string | undefined {
  return c.req.query("uuid");
}

/**
 * UUID-based auth for Web UI control routes.
 * Extracts ?uuid= query param and sets it in context for ownership checks.
 */
export async function uuidAuth(c: Context, next: Next) {
  const uuid = getUuidFromRequest(c);
  if (!uuid) {
    return c.json({ error: { type: "unauthorized", message: "Missing uuid" } }, 401);
  }
  c.set("uuid", uuid);
  await next();
}

/**
 * Passthrough middleware that accepts CLI headers (e.g. x-cli-version).
 * Currently a no-op — just forwards to next handler.
 */
export async function acceptCliHeaders(c: Context, next: Next) {
  await next();
}

/**
 * Session ingress auth — validates API key or worker JWT for session data routes.
 */
export async function sessionIngressAuth(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");
  const token = authHeader?.replace("Bearer ", "") || queryToken;

  // Try legacy API key
  if (validateApiKey(token)) {
    const systemUser = await ensureSystemUser();
    if (systemUser) {
      c.set("user", systemUser);
      await next();
      return;
    }
  }

  // Try worker JWT
  if (token) {
    const payload = verifyWorkerJwt(token);
    if (payload) {
      await next();
      return;
    }
  }

  return c.json({ error: { type: "unauthorized", message: "Invalid auth" } }, 401);
}
