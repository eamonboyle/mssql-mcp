import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  hostHeaderValidation,
  originValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { type EnvironmentConfig, getMcpEndpointUrl } from "./config.js";
import { createServerInstance } from "./server.js";
import type { ServerState } from "./serverState.js";

const LOOPBACK_HOSTNAMES = ["localhost", "127.0.0.1", "[::1]"];
const MCP_PATH = "/mcp";

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(\.\d{1,3}){3}$/.test(normalized)
  );
}

/**
 * Hostnames accepted in the Host and Origin headers. Guards against DNS
 * rebinding: a browser page on another site cannot reach the server through a
 * hostname it controls.
 */
export function resolveAllowedHostnames(
  environment: Pick<
    EnvironmentConfig,
    "mcpHttpAllowedHosts" | "mcpHttpHost" | "mcpBaseUrl"
  >
): string[] {
  if (environment.mcpHttpAllowedHosts.length > 0) {
    return [...environment.mcpHttpAllowedHosts];
  }

  const hostnames = new Set(LOOPBACK_HOSTNAMES);
  const bindHost = environment.mcpHttpHost.trim().toLowerCase();
  if (
    bindHost !== "0.0.0.0" &&
    bindHost !== "::" &&
    !isLoopbackHost(bindHost)
  ) {
    hostnames.add(bindHost.includes(":") ? `[${bindHost}]` : bindHost);
  }
  if (environment.mcpBaseUrl) {
    hostnames.add(new URL(environment.mcpBaseUrl).hostname.toLowerCase());
  }
  return [...hostnames];
}

/**
 * Refuses to expose an unauthenticated server beyond loopback unless the
 * operator explicitly opts in.
 */
export function assertHttpExposureAllowed(
  environment: Pick<
    EnvironmentConfig,
    "mcpHttpHost" | "mcpHttpAuthToken" | "mcpHttpAllowUnauthenticated"
  >
): void {
  if (
    isLoopbackHost(environment.mcpHttpHost) ||
    environment.mcpHttpAuthToken ||
    environment.mcpHttpAllowUnauthenticated
  ) {
    return;
  }

  throw new Error(
    `MCP_HTTP_HOST=${environment.mcpHttpHost} exposes the server beyond loopback. Set MCP_HTTP_AUTH_TOKEN, or set MCP_HTTP_ALLOW_UNAUTHENTICATED=true if another layer (reverse proxy, network policy) protects it.`
  );
}

export function isAuthorized(
  authorizationHeader: string | undefined,
  expectedToken: string
): boolean {
  const match = /^Bearer\s+(.+)$/i.exec(authorizationHeader?.trim() ?? "");
  if (!match) {
    return false;
  }
  const provided = Buffer.from(match[1].trim());
  const expected = Buffer.from(expectedToken);
  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

function writeJsonError(
  res: ServerResponse,
  status: number,
  message: string,
  headers: Record<string, string> = {}
) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message },
      id: null,
    })
  );
}

export function createHttpRequestListener(
  state: ServerState,
  environment: EnvironmentConfig
): (req: IncomingMessage, res: ServerResponse) => void {
  const allowedHostnames = resolveAllowedHostnames(environment);
  const validateHost = hostHeaderValidation(allowedHostnames);
  const validateOrigin = originValidation(allowedHostnames);
  const onerror = (error: Error) =>
    console.error("HTTP transport error:", error);
  const handler = createMcpHandler(
    () => createServerInstance(state, environment),
    { onerror }
  );
  const nodeHandler = toNodeHandler(handler, { onerror });

  return (req, res) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;
    if (path !== MCP_PATH) {
      writeJsonError(res, 404, `Not found. The MCP endpoint is ${MCP_PATH}.`);
      return;
    }

    if (!validateHost(req, res) || !validateOrigin(req, res)) {
      return;
    }

    if (
      environment.mcpHttpAuthToken &&
      !isAuthorized(req.headers.authorization, environment.mcpHttpAuthToken)
    ) {
      writeJsonError(res, 401, "Unauthorized.", {
        "www-authenticate": 'Bearer realm="mssql-mcp"',
      });
      return;
    }

    void nodeHandler(req, res);
  };
}

export async function startHttpServer(
  state: ServerState,
  environment: EnvironmentConfig
): Promise<Server> {
  assertHttpExposureAllowed(environment);

  const host = environment.mcpHttpHost;
  const port = environment.mcpHttpPort;
  const localEndpoint = `http://${host}:${port}${MCP_PATH}`;
  const publicEndpoint = getMcpEndpointUrl(environment);
  const httpServer = createServer(
    createHttpRequestListener(state, environment)
  );

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => resolve());
  });

  console.error(`MCP Streamable HTTP server listening on ${localEndpoint}`);
  if (publicEndpoint !== localEndpoint) {
    console.error(`Public MCP endpoint: ${publicEndpoint}`);
  }
  if (environment.mcpHttpAuthToken) {
    console.error("Bearer token authentication is enabled.");
  }

  return httpServer;
}
