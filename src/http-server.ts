#!/usr/bin/env node
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { API_BASE_URL } from "./constants.js";
import { pickForwardRequestHeaders, pickForwardResponseHeaders } from "./proxy/headers.js";
import { readBody } from "./proxy/read-body.js";

function getAuthToken(): string {
  const token = process.env.AUTH_TOKEN?.trim();
  if (!token) {
    throw new Error("AUTH_TOKEN environment variable is required for HTTP proxy mode");
  }
  return token;
}

function getPort(): number {
  const raw = process.env.PORT?.trim() || "3847";
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: ${raw}`);
  }
  return port;
}

function extractBearerToken(req: IncomingMessage): string | undefined {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return undefined;
  }
  return auth.slice("Bearer ".length).trim();
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  authToken: string,
): Promise<void> {
  const method = req.method ?? "GET";
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (requestUrl.pathname === "/health") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (!requestUrl.pathname.startsWith("/api/")) {
    sendJson(res, 404, {
      error: "Not found",
      hint: "Proxy only forwards /api/* to O!task API",
    });
    return;
  }

  const clientToken = extractBearerToken(req);
  if (!clientToken || clientToken !== authToken) {
    sendJson(res, 401, {
      error: "Unauthorized",
      hint: "Send Authorization: Bearer <AUTH_TOKEN>",
    });
    return;
  }

  const upstreamUrl = `${API_BASE_URL}${requestUrl.pathname}${requestUrl.search}`;
  const forwardHeaders = pickForwardRequestHeaders(req.headers);
  forwardHeaders.Authorization = `Bearer ${authToken}`;

  const body = await readBody(req);

  const upstream = await fetch(upstreamUrl, {
    method,
    headers: forwardHeaders,
    body,
  });

  const responseHeaders = pickForwardResponseHeaders(upstream.headers);
  res.writeHead(upstream.status, responseHeaders);

  if (method === "HEAD") {
    res.end();
    return;
  }

  const responseBody = Buffer.from(await upstream.arrayBuffer());
  res.end(responseBody);
}

function main(): void {
  const authToken = getAuthToken();
  const port = getPort();

  const server = http.createServer((req, res) => {
    handleRequest(req, res, authToken).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (!res.headersSent) {
        sendJson(res, 502, { error: "Upstream proxy error", message });
        return;
      }
      res.end();
      console.error("Proxy error after headers sent:", message);
    });
  });

  server.listen(port, () => {
    console.error(`O!task HTTP proxy listening on http://localhost:${port}`);
    console.error(`Forwarding /api/* -> ${API_BASE_URL}/api/*`);
  });
}

main();
