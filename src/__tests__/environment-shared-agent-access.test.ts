import { beforeEach, describe, expect, test } from "bun:test";
import { ValidationError } from "../errors";
import { createWebEnvironment, updateWebEnvironment } from "../services/environment-web";
import { resetAllStubs, stubConfigPg, stubDb } from "../test-utils/helpers";

const now = new Date("2026-06-04T00:00:00.000Z");

function environmentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "env_shared",
    name: "shared-env",
    description: "shared",
    workspacePath: "",
    agentConfigId: "agc_external",
    secret: "env_secret_x",
    machineName: "External Machine",
    branch: null,
    gitRepoUrl: null,
    maxSessions: 1,
    workerType: "acp",
    capabilities: null,
    status: "idle",
    userId: "user_current",
    organizationId: "org_current",
    autoStart: true,
    lastPollAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function queryResult<T>(rows: T[]) {
  return Object.assign(Promise.resolve(rows), {
    limit: async () => rows,
  });
}

describe("environment shared agent access", () => {
  beforeEach(() => {
    resetAllStubs();
  });

  // createWebEnvironment 允许绑定外部公开 Agent，并保留当前组织归属
  test("createWebEnvironment 允许绑定共享 Agent", async () => {
    let insertedValues: unknown;
    stubConfigPg({
      getReadableAgentConfigById: async () => ({
        id: "agc_external",
        userId: "user_source",
        organizationId: "org_source",
        name: "shared-agent",
        prompt: "prompt",
        model: "source/model",
        steps: 10,
        mode: "primary",
        permission: null,
        variant: null,
        temperature: null,
        topP: null,
        disable: false,
        hidden: false,
        color: null,
        description: null,
        knowledge: null,
        machineId: "machine-external",
        createdAt: now,
        updatedAt: now,
        resourceAccess: {
          ownership: "external",
          sourceOrganizationId: "org_source",
          sourceOrganizationName: "Source Team",
          resourceUid: "agc_external",
          resourceKey: "org_source/agc_external",
          manageable: false,
          writable: false,
        },
      }),
    });
    let selectCount = 0;
    stubDb({
      select: () => ({
        from: () => ({
          where: () => {
            selectCount += 1;
            return queryResult(selectCount === 1 ? [{ agentName: "External Machine" }] : []);
          },
        }),
      }),
      insert: () => ({
        values: (value: unknown) => {
          insertedValues = value;
          return Promise.resolve();
        },
      }),
    });

    const record = await createWebEnvironment({
      name: "shared-env",
      userId: "user_current",
      organizationId: "org_current",
      agentConfigId: "agc_external",
    });

    expect(record.organizationId).toBe("org_current");
    expect(record.agentConfigId).toBe("agc_external");
    expect(record.machineName).toBe("External Machine");
    expect(insertedValues).toMatchObject({ organizationId: "org_current", agentConfigId: "agc_external" });
  });

  // updateWebEnvironment 仅允许切换到当前调用方可读的共享 Agent，并刷新 machineName
  test("updateWebEnvironment 使用可读共享 Agent 并拒绝不可读 Agent", async () => {
    let updatePatch: unknown;
    let selectCount = 0;
    stubConfigPg({
      getReadableAgentConfigById: async (_ctx, id) => {
        if (id === "agc_blocked") return null;
        return {
          id,
          userId: "user_source",
          organizationId: "org_source",
          name: "shared-agent",
          prompt: "prompt",
          model: "source/model",
          steps: 10,
          mode: "primary",
          permission: null,
          variant: null,
          temperature: null,
          topP: null,
          disable: false,
          hidden: false,
          color: null,
          description: null,
          knowledge: null,
          machineId: "machine-next",
          createdAt: now,
          updatedAt: now,
          resourceAccess: {
            ownership: "external",
            sourceOrganizationId: "org_source",
            sourceOrganizationName: "Source Team",
            resourceUid: id,
            resourceKey: `org_source/${id}`,
            manageable: false,
            writable: false,
          },
        };
      },
    });
    stubDb({
      select: () => ({
        from: () => ({
          where: () => {
            selectCount += 1;
            if (selectCount === 1) return queryResult([environmentRow()]);
            if (selectCount === 2) return queryResult([{ agentName: "Next Machine" }]);
            if (selectCount === 3)
              return queryResult([environmentRow({ agentConfigId: "agc_readable", machineName: "Next Machine" })]);
            return queryResult([environmentRow()]);
          },
        }),
      }),
      update: () => ({
        set: (patch: unknown) => ({
          where: async () => {
            updatePatch = patch;
            return { count: 1 };
          },
        }),
      }),
    });

    const updated = await updateWebEnvironment("env_shared", "org_current", { agentConfigId: "agc_readable" });
    expect(updated.agentConfigId).toBe("agc_readable");
    expect(updated.machineName).toBe("Next Machine");
    expect(updatePatch).toMatchObject({ agentConfigId: "agc_readable", machineName: "Next Machine" });

    await expect(updateWebEnvironment("env_shared", "org_current", { agentConfigId: "agc_blocked" })).rejects.toThrow(
      ValidationError,
    );
  });
});
