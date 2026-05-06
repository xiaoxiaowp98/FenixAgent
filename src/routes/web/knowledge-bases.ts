import { Hono } from "hono";
import { sessionAuth } from "../../auth/middleware";
import {
  createKnowledgeBaseRecord,
  deleteKnowledgeBase,
  getKnowledgeBaseDetail,
  listKnowledgeBasesByUserId,
  updateKnowledgeBase,
} from "../../services/knowledge-base";
import {
  deleteKnowledgeResource,
  importKnowledgeResourceFromUrl,
  listKnowledgeResources,
  uploadKnowledgeResource,
} from "../../services/knowledge-upload";

const app = new Hono();

app.get("/knowledge-bases", sessionAuth, async (c) => {
  const user = c.get("user")!;
  return c.json(await listKnowledgeBasesByUserId(user.id));
});

app.post("/knowledge-bases", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const payload = await c.req.json().catch(() => ({}));
  const result = await createKnowledgeBaseRecord(user.id, {
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
  });
  if (!result.success) {
    return c.json({ error: { type: result.error.code, message: result.error.message } }, 400);
  }
  return c.json(result.data, 201);
});

app.get("/knowledge-bases/:id", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const detail = await getKnowledgeBaseDetail(user.id, id);
  if (!detail) {
    return c.json({ error: { type: "NOT_FOUND", message: "知识库不存在" } }, 404);
  }
  return c.json(detail);
});

app.patch("/knowledge-bases/:id", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const payload = await c.req.json().catch(() => ({}));
  const result = await updateKnowledgeBase(user.id, id, {
    name: payload.name,
    slug: payload.slug,
    description: payload.description,
  });
  if (!result.success) {
    const status = result.error.code === "NOT_FOUND" ? 404 : 400;
    return c.json({ error: { type: result.error.code, message: result.error.message } }, status);
  }
  return c.json(result.data);
});

app.delete("/knowledge-bases/:id", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  try {
    const result = await deleteKnowledgeBase(user.id, id);
    if (!result.success) {
      return c.json({ error: { type: "NOT_FOUND", message: result.error.message } }, 404);
    }
    return c.json({ ok: true });
  } catch (error) {
    return c.json({
      error: {
        type: "DELETE_FAILED",
        message: error instanceof Error ? error.message : "删除知识库失败",
      },
    }, 400);
  }
});

app.post("/knowledge-bases/:id/resources/upload", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  try {
    const form = await c.req.formData();
    const files = form.getAll("files").filter((entry): entry is File => entry instanceof File);
    const items = await Promise.all(files.map((file) => uploadKnowledgeResource(user.id, id, file)));

    for (let index = 0; index < items.length; index += 1) {
      if (items[index]?.status !== "error") {
        continue;
      }
      await deleteKnowledgeResource(user.id, id, items[index]!.id);
      items[index] = await uploadKnowledgeResource(user.id, id, files[index]!);
    }

    const failedItem = items.find((item) => item.status === "error");
    if (failedItem) {
      throw new Error(failedItem.lastError || `${failedItem.sourceName} 上传失败`);
    }
    return c.json({ items }, 201);
  } catch (error) {
    const message = (error as Error).message;
    const status = message.includes("不存在") ? 404 : 400;
    return c.json({ error: { type: status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message } }, status);
  }
});

app.post("/knowledge-bases/:id/resources/url", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const payload = await c.req.json().catch(() => ({}));
  if (!payload.url || typeof payload.url !== "string") {
    return c.json({ error: { type: "VALIDATION_ERROR", message: "url 为必填字段" } }, 400);
  }
  try {
    const item = await importKnowledgeResourceFromUrl(user.id, id, {
      url: payload.url,
      sourceName: payload.sourceName,
    });
    const status = item.status === "error" ? 502 : 201;
    return c.json(item, status);
  } catch (error) {
    const message = (error as Error).message;
    const status = message.includes("不存在") ? 404 : 400;
    return c.json({ error: { type: status === 404 ? "NOT_FOUND" : "VALIDATION_ERROR", message } }, status);
  }
});

app.get("/knowledge-bases/:id/resources", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const items = await listKnowledgeResources(user.id, id);
  if (!items) {
    return c.json({ error: { type: "NOT_FOUND", message: "知识库不存在" } }, 404);
  }
  return c.json(items);
});

app.delete("/knowledge-bases/:id/resources/:resourceId", sessionAuth, async (c) => {
  const user = c.get("user")!;
  const id = c.req.param("id")!;
  const resourceId = c.req.param("resourceId")!;
  try {
    const result = await deleteKnowledgeResource(user.id, id, resourceId);
    if (!result.success) {
      return c.json({ error: { type: result.error.code, message: result.error.message } }, 404);
    }
    return c.json(result.data);
  } catch (error) {
    return c.json({
      error: {
        type: "DELETE_FAILED",
        message: error instanceof Error ? error.message : "删除资源失败",
      },
    }, 400);
  }
});

export default app;
