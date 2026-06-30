#!/usr/bin/env node
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { validateAuthConfig } from "./services/auth.js";

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

function isAuthorized(req: IncomingMessage): boolean {
  const token = process.env.MCP_AUTH_TOKEN?.trim();
  if (!token) {
    return true;
  }

  const auth = req.headers.authorization;
  return auth === `Bearer ${token}`;
}

async function handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!isAuthorized(req)) {
    sendJson(res, 401, {
      error: "Unauthorized",
      hint: "Set Authorization: Bearer <MCP_AUTH_TOKEN> when MCP_AUTH_TOKEN is configured",
    });
    return;
  }

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  const server = createMcpServer();

  res.on("close", () => {
    void transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (requestUrl.pathname === "/health") {
    sendJson(res, 200, { ok: true, mode: "mcp-streamable-http" });
    return;
  }

  if (requestUrl.pathname === "/mcp") {
    await handleMcpRequest(req, res);
    return;
  }

  sendJson(res, 404, {
    error: "Not found",
    hint: "MCP endpoint: POST/GET /mcp (Streamable HTTP)",
  });
}

function main(): void {
  validateAuthConfig();

  const port = getPort();
  const host = process.env.HOST?.trim() || "0.0.0.0";

  const httpServer = http.createServer((req, res) => {
    handleRequest(req, res).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "MCP server error", message });
        return;
      }
      res.end();
      console.error("MCP HTTP error after headers sent:", message);
    });
  });

  httpServer.listen(port, host, () => {
    console.error(`O!task MCP (Streamable HTTP) listening on http://${host}:${port}/mcp`);
  });
}

main();
