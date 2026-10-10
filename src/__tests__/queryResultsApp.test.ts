import { describe, expect, it } from "vitest";
import {
  QUERY_RESULTS_APP_URI,
  buildQueryResultsHtml,
  queryResultsToolMeta,
} from "../apps/queryResultsApp.js";

describe("query results MCP App", () => {
  const html = buildQueryResultsHtml();

  it("inlines the ext-apps runtime as a local binding", () => {
    const script = html.slice(html.indexOf('<script type="module">'));
    expect(script).toContain("const ExtApps={");
    expect(script).toContain('"App":');
    expect(script).not.toMatch(/export\s*\{/);
  });

  it("keeps exactly one closing script tag", () => {
    expect(html.match(/<\/script/g)).toHaveLength(1);
  });

  it("links tools to the view with both metadata key styles", () => {
    expect(queryResultsToolMeta).toEqual({
      ui: { resourceUri: QUERY_RESULTS_APP_URI },
      "ui/resourceUri": QUERY_RESULTS_APP_URI,
    });
    expect(QUERY_RESULTS_APP_URI.startsWith("ui://")).toBe(true);
  });
});
