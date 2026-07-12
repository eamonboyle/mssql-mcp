import { describe, expect, it } from "vitest";
import { getPackageVersion } from "../packageInfo.js";
import { RELEASE_META } from "../releaseMeta.js";
import { MCP_SERVER_NAME } from "../serverConstants.js";
import { ServerAboutTool } from "../tools/ServerAboutTool.js";
import { toolDefinitions } from "../toolRegistry.js";

describe("server_about / release metadata", () => {
  it("keeps RELEASE_META.forVersion aligned with package.json", () => {
    expect(RELEASE_META.forVersion).toBe(getPackageVersion());
  });

  it("registers server_about as a read-only tool with no inputs", () => {
    const def = toolDefinitions.find((d) => d.tool.name === "server_about");
    expect(def).toBeDefined();
    expect(def?.readOnly).toBe(true);
    expect(def?.inputSchema.safeParse({}).success).toBe(true);
    expect(def?.inputSchema.safeParse({ extra: 1 }).success).toBe(false);
  });

  it("returns version, release date, and highlights", async () => {
    const result = await new ServerAboutTool().run();
    expect(result.success).toBe(true);
    expect(result.message).toContain(getPackageVersion());
    expect(result.message).toContain(RELEASE_META.releaseDate);
    expect(result.data).toMatchObject({
      mcpServerName: MCP_SERVER_NAME,
      version: getPackageVersion(),
      releaseDate: RELEASE_META.releaseDate,
    });
    expect(Array.isArray(result.data?.latestChanges)).toBe(true);
    expect(result.data?.latestChanges.length).toBeGreaterThan(0);
    expect(result.meta?.matchesPackageVersion).toBe(true);
  });
});
