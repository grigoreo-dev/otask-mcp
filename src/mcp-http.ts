#!/usr/bin/env node
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import {
  authorizeHttpMcpRequest,
  createEnvAuthResolver,
  createPassthroughAuthResolver,
  extractBearerToken,
  getHttpAuthMode,
  validateHttpAuthConfig,
} from "./services/auth.js";

function getPort(): number {
  const raw = process.env.PORT?.trim() || "3847";
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }
  return port;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const clientBearer = extractBearerToken(req.headers.authorization);
  const authResult = authorizeHttpMcpRequest(clientBearer);

  if (!authResult.ok) {
    sendJson(res, authResult.status, {
      error: authResult.error,
      hint: authResult.hint,
    });
    return;
  }

  const auth = authResult.otaskBearer
    ? createPassthroughAuthResolver(authResult.otaskBearer)
    : createEnvAuthResolver();

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer(auth);

  res.on("close", () => {
    void transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (requestUrl.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      mode: "mcp-streamable-http",
      authMode: getHttpAuthMode(),
    });
    return;
  }

  if (requestUrl.pathname === "/mcp") {
    await handleMcpRequest(req, res);
    return;
  }

  sendJson(res, 404, {
    error: "Not found",
    hint: "MCP endpoint: POST/GET /mcp",
  });
}

function main(): void {
  validateHttpAuthConfig();

  const port = getPort();
  const host = process.env.HOST?.trim() || "0.0.0.0";

  http
    .createServer((req, res) => {
      handleRequest(req, res).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        if (!res.headersSent) {
          sendJson(res, 500, { error: "MCP server error", message });
          return;
        }
        res.end();
        console.error("MCP HTTP error:", message);
      });
    })
    .listen(port, host, () => {
      console.error(
        `O!task MCP HTTP http://${host}:${port}/mcp [${getHttpAuthMode()}]`,
      );
    });
}

main();
