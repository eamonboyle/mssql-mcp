import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { parseEnvironmentConfig, type EnvironmentConfig } from "../config.js";
import {
  assertHttpExposureAllowed,
  createHttpRequestListener,
  isAuthorized,
  isLoopbackHost,
  resolveAllowedHostnames,
} from "../httpServer.js";
import { ServerState } from "../serverState.js";

function environment(
  overrides: Record<string, string> = {}
): EnvironmentConfig {
  return parseEnvironmentConfig({
    DATABASE_NAME: "AppDB",
    DB_USER: "sa",
    DB_PASSWORD: "pw",
    MCP_TRANSPORT: "http",
    ...overrides,
  });
}

describe("HTTP security helpers", () => {
  it.each(["127.0.0.1", "127.1.2.3", "localhost", "::1", "[::1]"])(
    "treats %s as loopback",
    (host) => expect(isLoopbackHost(host)).toBe(true)
  );

  it.each(["0.0.0.0", "10.0.0.5", "mcp.example.com"])(
    "treats %s as non-loopback",
    (host) => expect(isLoopbackHost(host)).toBe(false)
  );

  it("allows only loopback hostnames by default", () => {
    expect(resolveAllowedHostnames(environment())).toEqual([
      "localhost",
      "127.0.0.1",
      "[::1]",
    ]);
  });

  it("adds the bind host and public base URL host", () => {
    expect(
      resolveAllowedHostnames(
        environment({
          MCP_HTTP_HOST: "10.0.0.5",
          MCP_BASE_URL: "https://mcp.example.com",
        })
      )
    ).toEqual([
      "localhost",
      "127.0.0.1",
      "[::1]",
      "10.0.0.5",
      "mcp.example.com",
    ]);
  });

  it("uses MCP_HTTP_ALLOWED_HOSTS verbatim when set", () => {
    expect(
      resolveAllowedHostnames(
        environment({ MCP_HTTP_ALLOWED_HOSTS: "MCP.internal, proxy.local" })
      )
    ).toEqual(["mcp.internal", "proxy.local"]);
  });

  it("refuses an unauthenticated non-loopback bind", () => {
    expect(() =>
      assertHttpExposureAllowed(environment({ MCP_HTTP_HOST: "0.0.0.0" }))
    ).toThrow("MCP_HTTP_AUTH_TOKEN");
    expect(() =>
      assertHttpExposureAllowed(
        environment({ MCP_HTTP_HOST: "0.0.0.0", MCP_HTTP_AUTH_TOKEN: "t" })
      )
    ).not.toThrow();
    expect(() =>
      assertHttpExposureAllowed(
        environment({
          MCP_HTTP_HOST: "0.0.0.0",
          MCP_HTTP_ALLOW_UNAUTHENTICATED: "true",
        })
      )
    ).not.toThrow();
  });

  it("checks bearer tokens exactly", () => {
    expect(isAuthorized("Bearer secret", "secret")).toBe(true);
    expect(isAuthorized("bearer secret", "secret")).toBe(true);
    expect(isAuthorized("Bearer secret2", "secret")).toBe(false);
    expect(isAuthorized("Basic secret", "secret")).toBe(false);
    expect(isAuthorized(undefined, "secret")).toBe(false);
  });
});

describe("HTTP request listener", () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve()
    );
    server = undefined;
  });

  async function listen(env: EnvironmentConfig) {
    server = createServer(createHttpRequestListener(new ServerState(), env));
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve)
    );
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }

  const listTools = {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    }),
  };

  it("returns 404 outside /mcp", async () => {
    const base = await listen(environment());
    expect((await fetch(`${base}/other`, listTools)).status).toBe(404);
  });

  it("rejects cross-site Origin headers (DNS rebinding)", async () => {
    const base = await listen(environment());
    const response = await fetch(`${base}/mcp`, {
      ...listTools,
      headers: { ...listTools.headers, origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
  });

  it("requires the bearer token when configured", async () => {
    const base = await listen(environment({ MCP_HTTP_AUTH_TOKEN: "s3cret" }));
    const denied = await fetch(`${base}/mcp`, listTools);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toMatch(/^Bearer/);

    const allowed = await fetch(`${base}/mcp`, {
      ...listTools,
      headers: { ...listTools.headers, authorization: "Bearer s3cret" },
    });
    expect(allowed.status).toBe(200);
  });
});
