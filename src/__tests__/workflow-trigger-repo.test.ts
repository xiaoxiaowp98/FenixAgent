import { describe, expect, mock, test } from "bun:test";

// mock db
mock.module("../db", () => {
  const chain: Record<string, any> = {};
  chain.where = () => chain;
  chain.orderBy = () => chain;
  chain.limit = () => chain;
  chain.from = () => chain;
  const selectReturn = {
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => Promise.resolve([]),
  };
  const insertReturn = { values: () => ({ returning: () => Promise.resolve([]) }) };
  const updateReturn = { set: () => ({ where: () => Promise.resolve([]) }) };
  const deleteReturn = { where: () => ({ returning: () => Promise.resolve([]) }) };

  return {
    db: {
      select: () => selectReturn,
      insert: () => insertReturn,
      update: () => updateReturn,
      delete: () => deleteReturn,
    },
  };
});

// mock schema
mock.module("../db/schema", () => ({
  workflowTrigger: {
    id: "id",
    organizationId: "organization_id",
    workflowId: "workflow_id",
    type: "type",
    publicHash: "public_hash",
    secret: "secret",
    config: "config",
    enabled: "enabled",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

describe("workflow-trigger-repo", () => {
  // repo 导出函数完整
  test("repo exports are defined", async () => {
    const mod = await import("../repositories/workflow-trigger");
    expect(typeof mod.workflowTriggerRepo).toBe("object");
    expect(typeof mod.workflowTriggerRepo.getByHash).toBe("function");
    expect(typeof mod.workflowTriggerRepo.create).toBe("function");
    expect(typeof mod.workflowTriggerRepo.delete).toBe("function");
    expect(typeof mod.workflowTriggerRepo.update).toBe("function");
    expect(typeof mod.workflowTriggerRepo.listByWorkflow).toBe("function");
    expect(typeof mod.workflowTriggerRepo.listByOrg).toBe("function");
  });
});
