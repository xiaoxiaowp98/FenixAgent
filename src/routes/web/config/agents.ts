import Elysia from "elysia";
import { authGuardPlugin } from "../../../plugins/auth";
import * as configPg from "../../../services/config-pg";
import {
  InvalidKnowledgeBindingError,
  listAgentKnowledgeBindings,
  syncAgentKnowledgeBindings,
  type AgentKnowledgeConfig,
} from "../../../services/agent-knowledge";
import {
  validateAgentData,
  normalizeKnowledgeConfig,
  toolsToPermission,
  isBuiltInAgent,
  AGENT_SETTABLE_FIELDS,
} from "../../../services/config/agent-config";
import { configSuccess, configError, configValidationError, configNotFound, isValidResourceName } from "../../../services/config-utils";

/** 将 PG 行数据映射为前端兼容的 agent 字段 */
function pgRowToAgentFields(row: typeof configPg extends { listAgentConfigs: (userId: string) => Promise<(infer T)[]> } ? T : never) {
  // tools → permission 兼容转换：PG 中不再有 tools，但保留接口
  let permission = (row as any).permission ?? null;
  return {
    name: (row as any).name,
    model: (row as any).model ?? null,
    mode: (row as any).mode ?? null,
    description: (row as any).description ?? null,
    color: (row as any).color ?? null,
    disable: (row as any).disable ?? false,
    hidden: (row as any).hidden ?? false,
    steps: (row as any).steps ?? null,
    variant: (row as any).variant ?? null,
    temperature: (row as any).temperature ?? null,
    top_p: (row as any).topP ?? null,
    prompt: (row as any).prompt ?? null,
    permission,
    knowledge: (row as any).knowledge ?? null,
  };
}

async function handleList(userId: string) {
  const agents = await configPg.listAgentConfigs(userId);
  const uc = await configPg.getUserConfig(userId);
  const defaultAgent = uc.defaultAgent ?? null;
  const list = await Promise.all(agents.map(async (a) => ({
    name: a.name,
    builtIn: isBuiltInAgent(a.name),
    model: a.model ?? null,
    mode: a.mode ?? null,
    description: a.description ?? null,
    color: a.color ?? null,
    knowledgeBaseCount: (await listAgentKnowledgeBindings(a.name)).length,
  })));
  return configSuccess({ default_agent: defaultAgent, agents: list });
}

async function handleGet(userId: string, name: string) {
  const agent = await configPg.getAgentConfig(userId, name);
  if (!agent) return configNotFound(`Agent '${name}' not found`);

  let permission = agent.permission ?? null;
  // tools→permission 兼容：旧数据可能只有 tools 没有 permission
  const tools = (agent as Record<string, unknown>).tools;
  if (permission == null && tools && typeof tools === "object" && !Array.isArray(tools)) {
    permission = toolsToPermission(tools as Record<string, boolean>);
  }

  return configSuccess({
    name,
    builtIn: isBuiltInAgent(name),
    model: agent.model ?? null,
    prompt: agent.prompt ?? null,
    steps: agent.steps ?? null,
    mode: agent.mode ?? null,
    permission,
    variant: agent.variant ?? null,
    temperature: agent.temperature ?? null,
    top_p: agent.topP ?? null,
    disable: agent.disable ?? false,
    hidden: agent.hidden ?? false,
    color: agent.color ?? null,
    description: agent.description ?? null,
    knowledge: normalizeKnowledgeConfig(agent.knowledge ?? null),
  });
}

async function handleSet(userId: string, name: string, data: Record<string, unknown>) {
  const validation = validateAgentData(data);
  if (validation) return configValidationError(validation);

  // 白名单过滤
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (AGENT_SETTABLE_FIELDS.includes(key as typeof AGENT_SETTABLE_FIELDS[number])) {
      filtered[key] = key === "knowledge" ? normalizeKnowledgeConfig(value) : value;
    }
  }

  // 检查 agent 是否存在
  const existing = await configPg.getAgentConfig(userId, name);
  if (!existing) return configNotFound(`Agent '${name}' not found`);

  // 清除 null 值字段，映射 snake_case → camelCase
  const updateData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filtered)) {
    if (key === "permission" && value == null) {
      updateData[key] = null;
    } else if (key === "knowledge" && value == null) {
      updateData[key] = null;
    } else if (key === "top_p") {
      updateData["topP"] = value;
    } else {
      updateData[key] = value;
    }
  }

  await configPg.updateAgentConfig(userId, name, updateData);
  await syncAgentKnowledgeBindings(userId, name, filtered.knowledge as AgentKnowledgeConfig | null | undefined);
  return configSuccess({ name, ...filtered });
}

async function handleCreate(userId: string, name: string, data: Record<string, unknown>) {
  if (!isValidResourceName(name)) {
    return configValidationError("Invalid agent name: must be 1-64 lowercase alphanumeric chars with single hyphens");
  }
  const validation = validateAgentData(data);
  if (validation) return configValidationError(validation);

  // 白名单过滤
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (AGENT_SETTABLE_FIELDS.includes(key as typeof AGENT_SETTABLE_FIELDS[number])) {
      filtered[key] = key === "knowledge" ? normalizeKnowledgeConfig(value) : value;
    }
  }
  if (filtered.permission == null) delete filtered.permission;

  // 映射 snake_case → camelCase for PG storage
  const pgData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filtered)) {
    if (key === "top_p") {
      pgData["topP"] = value;
    } else {
      pgData[key] = value;
    }
  }

  // 检查是否已存在
  const existing = await configPg.getAgentConfig(userId, name);
  if (existing) return configError("ALREADY_EXISTS", `Agent '${name}' already exists`);

  await configPg.createAgentConfig(userId, name, pgData);
  await syncAgentKnowledgeBindings(userId, name, filtered.knowledge as AgentKnowledgeConfig | null | undefined);
  return configSuccess({ name });
}

async function handleDelete(userId: string, name: string) {
  if (isBuiltInAgent(name)) {
    return configError("FORBIDDEN", `Cannot delete built-in agent '${name}'`);
  }
  const deleted = await configPg.deleteAgentConfig(userId, name);
  if (!deleted) return configNotFound(`Agent '${name}' not found`);
  return configSuccess(null);
}

async function handleSetDefault(userId: string, name: string) {
  const agent = await configPg.getAgentConfig(userId, name);
  if (!agent) return configNotFound(`Agent '${name}' not found`);
  await configPg.setUserConfig(userId, { defaultAgent: name });
  return configSuccess({ default_agent: name });
}

import { ConfigBodySchema } from "../../../schemas/config.schema";

const app = new Elysia({ name: "web-config-agents", prefix: "/web" })
  .use(authGuardPlugin)
  .model({
    "config-body": ConfigBodySchema,
  });

app.post("/config/agents", async ({ store, body, error }) => {
  const user = store.user!;
  const b = (body as any) ?? {};
  const { action, name, data } = { action: b.action ?? "", name: b.name, data: b.data as Record<string, unknown> | undefined };
  try {
    switch (action) {
      case "list": return await handleList(user.id);
      case "get": return await handleGet(user.id, name!);
      case "set": return await handleSet(user.id, name!, data!);
      case "create": return await handleCreate(user.id, name!, data!);
      case "delete": return await handleDelete(user.id, name!);
      case "set_default": return await handleSetDefault(user.id, name!);
      default: return error(400, configValidationError(`Unknown action '${action}'`));
    }
  } catch (error_) {
    if (
      error_ instanceof InvalidKnowledgeBindingError
      || (typeof error_ === "object" && error_ !== null && "code" in error_ && (error_ as { code?: string }).code === "INVALID_KNOWLEDGE_BINDINGS")
    ) {
      const message = error_ instanceof Error ? error_.message : "知识库绑定无效";
      return error(400, configError("INVALID_KNOWLEDGE_BINDINGS", message));
    }
    throw error_;
  }
}, { sessionAuth: true, body: "config-body" });

export default app;
