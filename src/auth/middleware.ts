import type { Context, Next } from "hono";
import { auth } from "./better-auth";
import { validateApiKeyAndGetUser } from "./api-key-service";
import { config } from "../config";

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
  const result = await validateApiKeyAndGetUser(token);
  if (result) {
    const user = await auth.api.getUser({ userId: result.userId });
    if (user) {
      c.set("user", {
        id: user.user.id,
        email: user.user.email,
        name: user.user.name,
      });
      await next();
      return;
    }
  }

  // 2. Fallback: legacy global API Key (RCS_API_KEYS env var)
  if (config.apiKeys.length > 0 && config.apiKeys.includes(token)) {
    // Auto-create a system user for the legacy key if no users exist yet
    const userList = await auth.api.listUsers();
    let systemUser;
    if (userList.users.length === 0) {
      // No users yet — create a system user and generate an API key
      const signUpResult = await auth.api.signUpEmail({
        email: "system@rcs.local",
        password: "system",
        name: "System",
      });
      if (signUpResult.user) {
        systemUser = signUpResult.user;
        // Import dynamically to avoid circular deps
        const { createApiKey } = await import("./api-key-service");
        await createApiKey(systemUser.id, "legacy-auto");
      }
    }

    // Use the first user as the owner for legacy global keys
    const users = systemUser ? { users: [systemUser] } : await auth.api.listUsers();
    const fallbackUser = users.users[0];
    if (fallbackUser) {
      c.set("user", {
        id: fallbackUser.id,
        email: fallbackUser.email,
        name: fallbackUser.name,
      });
      await next();
      return;
    }
  }

  return c.json({ error: { type: "unauthorized", message: "Invalid API key" } }, 401);
}
