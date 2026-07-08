import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../schema.js", () => ({
  describeObjectDependencies: vi.fn(),
}));

import { describeObjectDependencies } from "../schema.js";
import { DescribeDependenciesTool } from "../tools/DescribeDependenciesTool.js";

const describeObjectDependenciesMock = vi.mocked(describeObjectDependencies);

describe("DescribeDependenciesTool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns dependent objects on success", async () => {
    describeObjectDependenciesMock.mockResolvedValue([
      {
        referencingSchemaName: "dbo",
        referencingObjectName: "vw_Users",
        referencingType: "VIEW",
        referencedSchemaName: "dbo",
        referencedEntityName: "Users",
      },
    ]);

    const tool = new DescribeDependenciesTool();
    const result = await tool.run({
      objectName: "Users",
      schemaName: "dbo",
    });

    expect(result.success).toBe(true);
    expect(result.message).toContain("Found 1 dependent object(s) for 'dbo.Users'");
    expect(describeObjectDependenciesMock).toHaveBeenCalledWith(
      "Users",
      undefined,
      "dbo"
    );
  });

  it("reports when no dependencies are found", async () => {
    describeObjectDependenciesMock.mockResolvedValue([]);

    const tool = new DescribeDependenciesTool();
    const result = await tool.run({
      objectName: "Orphan",
      schemaName: "dbo",
    });

    expect(result.success).toBe(true);
    expect(result.message).toMatch(/No dependencies found for 'dbo.Orphan'/);
  });

  it("rejects empty objectName", async () => {
    const tool = new DescribeDependenciesTool();
    const result = await tool.run({ objectName: "  " });

    expect(result.success).toBe(false);
    expect(result.message).toContain("objectName");
    expect(describeObjectDependenciesMock).not.toHaveBeenCalled();
  });
});
