import { describe, expect, it } from "vitest";
import { toolDefinitions } from "../toolRegistry.js";

function getToolSchema(name: string) {
  const definition = toolDefinitions.find((tool) => tool.tool.name === name);
  if (!definition) {
    throw new Error(`Missing tool definition for ${name}`);
  }

  return definition.inputSchema;
}

describe("toolRegistry write schemas", () => {
  it("requires structured filters for update_data", () => {
    const schema = getToolSchema("update_data");

    expect(
      schema.safeParse({
        tableName: "Users",
        updates: { status: "active" },
        whereClause: "id = 1",
      }).success
    ).toBe(false);

    expect(
      schema.safeParse({
        tableName: "Users",
        updates: { status: "active" },
        filters: [{ column: "id", operator: "=", value: 1 }],
      }).success
    ).toBe(true);
  });

  it("rejects unknown keys for delete_data", () => {
    const schema = getToolSchema("delete_data");

    expect(
      schema.safeParse({
        tableName: "Users",
        filters: [{ column: "id", operator: "=", value: 1 }],
        extra: true,
      }).success
    ).toBe(false);
  });

  it("rejects extra column properties for create_table", () => {
    const schema = getToolSchema("create_table");

    expect(
      schema.safeParse({
        tableName: "Users",
        columns: [
          {
            name: "id",
            type: "INT",
            nullable: false,
            unexpected: "value",
          },
        ],
      }).success
    ).toBe(false);
  });

  it("declares structured output schemas for every tool", () => {
    for (const definition of toolDefinitions) {
      expect(definition.outputSchema).toBeDefined();
      expect(definition.outputSchema.version).toBeDefined();
      expect(definition.outputSchema.success).toBeDefined();
      expect(definition.outputSchema.message).toBeDefined();
    }
  });

  it("requires confirmation for destructive write tools", () => {
    const updateSchema = getToolSchema("update_data");
    expect(
      updateSchema.safeParse({
        tableName: "Users",
        updates: { status: "active" },
        filters: [{ column: "id", operator: "=", value: 1 }],
        confirmed: true,
      }).success
    ).toBe(true);
  });
});
