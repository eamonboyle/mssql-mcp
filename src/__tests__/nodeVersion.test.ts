import { describe, expect, it } from "vitest";
import {
  LAST_NODE_20_RELEASE,
  MIN_NODE_MAJOR,
  nodeVersionError,
} from "../nodeVersion.js";

describe("nodeVersionError", () => {
  it.each(["22.0.0", "22.23.3", "24.18.0", "26.11.1"])(
    "accepts Node %s",
    (version) => {
      expect(nodeVersionError(version)).toBeUndefined();
    }
  );

  it.each(["20.20.2", "18.19.0", "21.7.3"])("rejects Node %s", (version) => {
    const message = nodeVersionError(version);
    expect(message).toContain(`requires Node.js ${MIN_NODE_MAJOR} or newer`);
    expect(message).toContain(`found v${version}`);
    expect(message).toContain(`@eamonboyle/mssql-mcp@${LAST_NODE_20_RELEASE}`);
  });

  it("rejects an unparseable version", () => {
    expect(nodeVersionError("unknown")).toBeDefined();
  });

  it("passes on the Node.js running the tests", () => {
    expect(nodeVersionError()).toBeUndefined();
  });
});
