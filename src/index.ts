#!/usr/bin/env node

// Must stay the first import: fails fast with a clear message on old Node.js.
import "./checkNodeVersion.js";
import * as dotenv from "dotenv";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

// Keep dotenv silent: anything on stdout corrupts the stdio JSON-RPC stream.
dotenv.config({ quiet: true });

import {
  type EnvironmentConfig,
  configureRuntimeEnvironment,
  parseEnvironmentConfig,
} from "./config.js";
import { closeAllPools, configureDatabase } from "./db.js";
import { startHttpServer } from "./httpServer.js";
import { createServerInstance } from "./server.js";
import { ServerState } from "./serverState.js";

type CloseServer = () => Promise<void>;

const SHUTDOWN_TIMEOUT_MS = 5000;

function runStdioServer(
  state: ServerState,
  environment: EnvironmentConfig
): CloseServer {
  const handle = serveStdio(() => createServerInstance(state, environment), {
    onerror: (error) => console.error("stdio transport error:", error),
  });
  return () => handle.close();
}

async function runHttpServer(
  state: ServerState,
  environment: EnvironmentConfig
): Promise<CloseServer> {
  const httpServer = await startHttpServer(state, environment);
  return () =>
    new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      httpServer.closeAllConnections();
    });
}

function registerShutdown(closeServer: CloseServer) {
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    // Never let a stuck connection keep the process alive.
    setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref();
    await closeServer().catch(() => undefined);
    await closeAllPools();
    process.exit(0);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  return shutdown;
}

async function main() {
  const environment = parseEnvironmentConfig();
  configureRuntimeEnvironment(environment);
  configureDatabase(environment);

  // One state store per process so query-result and query-plan resource
  // links stay readable across stateless HTTP requests.
  const state = new ServerState();

  if (environment.mcpTransport === "http") {
    registerShutdown(await runHttpServer(state, environment));
    return;
  }

  const shutdown = registerShutdown(runStdioServer(state, environment));
  // The client closing stdin ends the session; release SQL pools so the
  // process can exit promptly.
  process.stdin.once("end", shutdown);
}

main().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
