import { Hono } from "hono";
import { sessionAuth } from "../../auth/middleware";
import {
  createApiKey,
  listApiKeysByUser,
  deleteApiKey,
  updateApiKeyLabel,
} from "../../auth/api-key-service";

const app = new Hono();

/** GET /web/api-keys — List current user's API keys */
app.get("/api-keys", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const keys = await listApiKeysByUser(user.id);
  return c.json(keys);
});

/** POST /web/api-keys — Create a new API key */
app.post("/api-keys", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const body = await c.req.json<{ label?: string }>().catch(() => ({ label: "" }));
  const { record, fullKey } = await createApiKey(user.id, body.label || "");
  return c.json({ ...record, full_key: fullKey }, 201);
});

/** DELETE /web/api-keys/:id — Delete an API key */
app.delete("/api-keys/:id", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const keyId = c.req.param("id")!;
  const deleted = await deleteApiKey(user.id, keyId);
  if (!deleted) {
    return c.json({ error: { type: "not_found", message: "API key not found" } }, 404);
  }
  return c.json({ ok: true });
});

/** PATCH /web/api-keys/:id — Update API key label */
app.patch("/api-keys/:id", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const keyId = c.req.param("id")!;
  const body = await c.req.json<{ label: string }>().catch(() => ({ label: "" }));
  if (!body.label) {
    return c.json({ error: { type: "bad_request", message: "Label is required" } }, 400);
  }
  const updated = await updateApiKeyLabel(user.id, keyId, body.label);
  if (!updated) {
    return c.json({ error: { type: "not_found", message: "API key not found" } }, 404);
  }
  return c.json({ ok: true });
});

export default app;
