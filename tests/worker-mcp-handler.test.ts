import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { apiHandler } from "../packages/worker/src/mcp-api.ts";
import type { OtaskSessionProps } from "../packages/worker/src/session-props.ts";

// Full Streamable-HTTP round trip through the worker apiHandler:
// initialize -> tools/call otask_me. This is the exact sequence the MCP
// client (opencode) runs, and the one that hangs when the transport is
// stateful across separate Worker requests. A stateless handler must return
// the tool result without needing session state to survive between requests.

const MCP_URL = "https://otask-mcp.grigoreo.dev/mcp";

const SESSION: OtaskSessionProps = {
  otaskToken: "test-token",
  defaultWs: "ws-1",
};

function ctxWithProps(props: OtaskSessionProps): ExecutionContext {
  const ctx = {
    props,
    waitUntil() {},
    passThroughOnException() {},
  };
  return ctx as unknown as ExecutionContext;
}

function mcpRequest(body: unknown, extraHeaders: Record<string, string> = {}): Request {
  return new Request(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

// Parse either a JSON body or an SSE "data:" framed body into the JSON-RPC message.
async function readRpc(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    return JSON.parse(trimmed);
  }
  const line = trimmed
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.startsWith("data:"));
  if (!line) {
    throw new Error(`no JSON-RPC payload in response: ${text.slice(0, 200)}`);
  }
  return JSON.parse(line.slice("data:".length).trim());
}

let realFetch: typeof fetch;

beforeEach(() => {
  realFetch = globalThis.fetch;
  // Stub only O!task API calls; leave everything else alone.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("api.otask.ru")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            id: 11458,
            full_name: "Test User",
            email: "t@e.st",
            timezone: "Europe/Moscow",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    }
    return realFetch(input, init);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("worker apiHandler streamable-http", () => {
  test("initialize then tools/call otask_me returns the user without hanging", async () => {
    const env = {};
    const ctx = ctxWithProps(SESSION);

    const initRes = await apiHandler.fetch(
      mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "0" },
        },
      }),
      env,
      ctx
    );
    expect(initRes.status).toBe(200);
    // Stateless request/response mode must return plain JSON, not an SSE stream
    // that depends on session state surviving across separate Worker requests.
    expect(initRes.headers.get("content-type")).toContain("application/json");
    const sessionId = initRes.headers.get("mcp-session-id") ?? undefined;
    const initRpc = await readRpc(initRes);
    expect((initRpc.result as Record<string, unknown>).serverInfo).toMatchObject({
      name: "otask-mcp-server",
    });

    const sessionHeaders = sessionId ? { "mcp-session-id": sessionId } : {};

    // The initialized notification (client -> server), part of the handshake.
    await apiHandler.fetch(
      mcpRequest({ jsonrpc: "2.0", method: "notifications/initialized" }, sessionHeaders),
      env,
      ctxWithProps(SESSION)
    );

    const callRes = await apiHandler.fetch(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: { name: "otask_me", arguments: {} },
        },
        sessionHeaders
      ),
      env,
      ctxWithProps(SESSION)
    );
    expect(callRes.status).toBe(200);
    expect(callRes.headers.get("content-type")).toContain("application/json");
    const callRpc = await readRpc(callRes);
    const result = callRpc.result as { content: Array<{ type: string; text: string }> };
    const first = result?.content?.[0];
    expect(first?.type).toBe("text");
    const me = JSON.parse(first?.text ?? "{}") as { id: number; full_name: string };
    expect(me).toMatchObject({ id: 11458, full_name: "Test User" });
  }, 15000);
});
