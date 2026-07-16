import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { AuthHandler, type WorkerEnv } from "../packages/worker/src/auth-handler.ts";
import { PENDING_COOKIE } from "../packages/worker/src/pending-auth.ts";
import { hashUserId } from "../packages/worker/src/user-id.ts";

const PEPPER = "test-pepper-wizard-5b";
const EMAIL = "user@example.com";
const PASSWORD = "secret-pass";
const TOKEN = "otask-bearer-token-xyz";
const OAUTH_QUERY = "client_id=cid&redirect_uri=https%3A%2F%2Fc%2Fcb&response_type=code&state=s1";
const AUTHORIZE_URL = `https://worker.example/authorize?${OAUTH_QUERY}`;

type CompleteCall = {
  request: { clientId: string; redirectUri: string; codeChallenge?: string; scope?: string[] };
  userId: string;
  metadata: unknown;
  scope: string[];
  props: Record<string, unknown>;
};

function memKV() {
  const m = new Map<string, string>();
  return {
    async put(k: string, v: string, _opts?: { expirationTtl?: number }) {
      m.set(k, v);
    },
    async get(k: string) {
      return m.get(k) ?? null;
    },
    async delete(k: string) {
      m.delete(k);
    },
    _map: m,
  };
}

function createFakeProvider(opts?: {
  parseOverride?: (request: Request) => Promise<Record<string, unknown>>;
}) {
  const completeCalls: CompleteCall[] = [];
  let parseCount = 0;

  const defaultAuthReq = {
    responseType: "code",
    clientId: "cid",
    redirectUri: "https://c/cb",
    scope: [] as string[],
    state: "s1",
    codeChallenge: "challenge-abc",
  };

  const provider = {
    async parseAuthRequest(request: Request) {
      parseCount++;
      if (opts?.parseOverride) {
        return opts.parseOverride(request);
      }
      return { ...defaultAuthReq };
    },
    async completeAuthorization(options: CompleteCall) {
      completeCalls.push(options);
      return { redirectTo: "https://c/cb?code=xyz" };
    },
  } as unknown as OAuthHelpers;

  return { provider, completeCalls, getParseCount: () => parseCount, defaultAuthReq };
}

function installFetchMocks() {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/v1/auth/login")) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      expect(body.email).toBe(EMAIL);
      expect(body.password).toBe(PASSWORD);
      return new Response(JSON.stringify({ token: TOKEN, expires_in: 60 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/api/v1/teams")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            teams: [
              { id: 1, slug: "ws-a", name: "Alpha" },
              { id: 2, slug: "ws-b", name: "Beta" },
            ],
            default_team: { id: 1, slug: "ws-a", name: "Alpha" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    if (url.includes("/projects/list")) {
      const wsMatch = url.match(/\/ws\/([^/]+)\/projects\/list/);
      const ws = wsMatch ? decodeURIComponent(wsMatch[1]) : "unknown";
      if (ws === "ws-a") {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              projects: [{ id: 10, slug: "p1", name: "Proj 1" }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            projects: [{ id: 20, slug: "p2", name: "Proj 2" }],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return new Response(JSON.stringify({ success: false, message: `unexpected fetch: ${url}` }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

function formBody(entries: Record<string, string | string[]>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(entries)) {
    if (Array.isArray(v)) {
      for (const item of v) p.append(k, item);
    } else {
      p.set(k, v);
    }
  }
  return p;
}

function setCookieFromResponse(res: Response): string | null {
  // Response may expose Set-Cookie via getSetCookie() or headers.get
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] };
  if (typeof anyHeaders.getSetCookie === "function") {
    const all = anyHeaders.getSetCookie();
    const hit = all.find((c) => c.startsWith(`${PENDING_COOKIE}=`));
    if (hit) return hit.split(";")[0] ?? null;
  }
  const single = res.headers.get("Set-Cookie");
  if (!single) return null;
  if (single.includes(PENDING_COOKIE)) {
    return single.split(";")[0] ?? null;
  }
  return null;
}

describe("AuthHandler OAuth wizard", () => {
  let restoreFetch: (() => void) | undefined;

  beforeEach(() => {
    restoreFetch = installFetchMocks();
  });

  afterEach(() => {
    restoreFetch?.();
  });

  test("step1 POST: sets pending cookie, renders step2, KV has no email, no completeAuthorization", async () => {
    const kv = memKV();
    const { provider, completeCalls } = createFakeProvider();
    const env: WorkerEnv = {
      OAUTH_PROVIDER: provider,
      OAUTH_KV: kv as unknown as KVNamespace,
      USER_ID_PEPPER: PEPPER,
    };

    const res = await AuthHandler.fetch(
      new Request(AUTHORIZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ email: EMAIL, password: PASSWORD }),
      }),
      env
    );

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain(`${PENDING_COOKIE}=`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Path=/authorize");

    const html = await res.text();
    expect(html).toContain('<select name="default_ws"');
    expect(html).not.toContain('name="step"');
    expect(html).toContain("Alpha");
    expect(html).not.toContain('name="password"');

    const pendingKeys = [...kv._map.keys()].filter((k) => k.startsWith("pending:v1:"));
    expect(pendingKeys).toHaveLength(1);
    const pendingKey = pendingKeys[0];
    expect(pendingKey).toBeDefined();
    const raw = pendingKey ? kv._map.get(pendingKey) : undefined;
    expect(raw).toBeDefined();
    expect(raw).not.toContain("email");
    expect(raw).not.toContain(EMAIL);
    const parsed = JSON.parse(raw as string) as {
      otaskToken: string;
      userId: string;
      fingerprint: { clientId?: string; redirectUri?: string; codeChallenge?: string };
    };
    expect(parsed.otaskToken).toBe(TOKEN);
    expect(parsed.userId).toBe(await hashUserId(EMAIL, PEPPER));
    expect(parsed.fingerprint.clientId).toBe("cid");
    expect(parsed.fingerprint.redirectUri).toBe("https://c/cb");
    expect(parsed.fingerprint.codeChallenge).toBe("challenge-abc");

    expect(completeCalls).toHaveLength(0);
  });

  test("step2 POST: completeAuthorization with props, deletes KV, redirects, clears cookie", async () => {
    const kv = memKV();
    const { provider, completeCalls } = createFakeProvider();
    const env: WorkerEnv = {
      OAUTH_PROVIDER: provider,
      OAUTH_KV: kv as unknown as KVNamespace,
      USER_ID_PEPPER: PEPPER,
    };

    const step1 = await AuthHandler.fetch(
      new Request(AUTHORIZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ email: EMAIL, password: PASSWORD }),
      }),
      env
    );
    const cookiePair = setCookieFromResponse(step1);
    expect(cookiePair).toBeTruthy();
    expect(completeCalls).toHaveLength(0);
    if (!cookiePair) throw new Error("expected Set-Cookie from step1");

    const step2 = await AuthHandler.fetch(
      new Request(AUTHORIZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookiePair,
        },
        body: formBody({
          step: "2",
          default_ws: "ws-a",
          default_project: "ws-a::p1",
          allowed_ws: ["ws-a", "ws-b"],
          allowed_projects: ["ws-a::p1", "ws-b::p2"],
        }),
      }),
      env
    );

    expect(step2.status).toBe(302);
    expect(step2.headers.get("Location")).toBe("https://c/cb?code=xyz");
    const clearCookie = step2.headers.get("Set-Cookie") ?? "";
    expect(clearCookie).toContain(`${PENDING_COOKIE}=`);
    expect(clearCookie).toContain("Max-Age=0");

    expect(completeCalls).toHaveLength(1);
    const call = completeCalls[0];
    expect(call).toBeDefined();
    if (!call) throw new Error("expected completeAuthorization call");
    expect(call.userId).toBe(await hashUserId(EMAIL, PEPPER));
    expect(call.props.otaskToken).toBe(TOKEN);
    expect(call.props.defaultWs).toBe("ws-a");
    expect(call.props.defaultProject).toBe("p1");
    expect(call.props.allowedWs).toBe("ws-a,ws-b");
    expect(call.props.allowedProjects).toBe("p1,p2");
    expect(call.scope).toEqual([]);

    const pendingKeys = [...kv._map.keys()].filter((k) => k.startsWith("pending:v1:"));
    expect(pendingKeys).toHaveLength(0);
  });

  test("step2 with missing pending: step1 error, no completeAuthorization", async () => {
    const kv = memKV();
    const { provider, completeCalls } = createFakeProvider();
    const env: WorkerEnv = {
      OAUTH_PROVIDER: provider,
      OAUTH_KV: kv as unknown as KVNamespace,
      USER_ID_PEPPER: PEPPER,
    };

    const res = await AuthHandler.fetch(
      new Request(AUTHORIZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // no cookie
        },
        body: formBody({
          step: "2",
          default_ws: "ws-a",
        }),
      }),
      env
    );

    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toMatch(/Сессия входа истекла|истекла/i);
    expect(html).toContain('name="password"');
    expect(completeCalls).toHaveLength(0);
    const clearCookie = res.headers.get("Set-Cookie") ?? "";
    expect(clearCookie).toContain("Max-Age=0");
  });

  test("step2 fingerprint mismatch: step1 error, no completeAuthorization", async () => {
    const kv = memKV();
    let parseN = 0;
    const { provider, completeCalls } = createFakeProvider({
      parseOverride: async () => {
        parseN++;
        if (parseN === 1) {
          return {
            responseType: "code",
            clientId: "cid",
            redirectUri: "https://c/cb",
            scope: [],
            state: "s1",
            codeChallenge: "challenge-abc",
          };
        }
        // step2 re-parse with different clientId
        return {
          responseType: "code",
          clientId: "other-client",
          redirectUri: "https://c/cb",
          scope: [],
          state: "s1",
          codeChallenge: "challenge-abc",
        };
      },
    });
    const env: WorkerEnv = {
      OAUTH_PROVIDER: provider,
      OAUTH_KV: kv as unknown as KVNamespace,
      USER_ID_PEPPER: PEPPER,
    };

    const step1 = await AuthHandler.fetch(
      new Request(AUTHORIZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ email: EMAIL, password: PASSWORD }),
      }),
      env
    );
    const cookiePair = setCookieFromResponse(step1);
    expect(cookiePair).toBeTruthy();
    if (!cookiePair) throw new Error("expected Set-Cookie from step1");
    // still one pending entry after step1
    expect([...kv._map.keys()].filter((k) => k.startsWith("pending:v1:"))).toHaveLength(1);

    const step2 = await AuthHandler.fetch(
      new Request(AUTHORIZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookiePair,
        },
        body: formBody({
          step: "2",
          default_ws: "ws-a",
        }),
      }),
      env
    );

    expect(step2.status).toBe(400);
    const html = await step2.text();
    expect(html).toMatch(/Сессия входа истекла|истекла/i);
    expect(completeCalls).toHaveLength(0);
  });

  test("GET /authorize renders step1 credentials form", async () => {
    const kv = memKV();
    const { provider } = createFakeProvider();
    const env: WorkerEnv = {
      OAUTH_PROVIDER: provider,
      OAUTH_KV: kv as unknown as KVNamespace,
      USER_ID_PEPPER: PEPPER,
    };

    const res = await AuthHandler.fetch(new Request(AUTHORIZE_URL, { method: "GET" }), env);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).not.toContain('<select name="default_ws"');
  });

  test("step1 POST when teams fetch fails: step1 error, clears cookie, no pending KV, no completeAuthorization", async () => {
    restoreFetch?.();
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/auth/login")) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        expect(body.email).toBe(EMAIL);
        expect(body.password).toBe(PASSWORD);
        return new Response(JSON.stringify({ token: TOKEN, expires_in: 60 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/api/v1/teams")) {
        return new Response(JSON.stringify({ success: false, message: "teams unavailable" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: false, message: `unexpected fetch: ${url}` }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    restoreFetch = () => {
      globalThis.fetch = original;
    };

    const kv = memKV();
    const { provider, completeCalls } = createFakeProvider();
    const env: WorkerEnv = {
      OAUTH_PROVIDER: provider,
      OAUTH_KV: kv as unknown as KVNamespace,
      USER_ID_PEPPER: PEPPER,
    };

    const res = await AuthHandler.fetch(
      new Request(AUTHORIZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ email: EMAIL, password: PASSWORD }),
      }),
      env
    );

    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Не удалось загрузить пространства O!task");
    expect(html).toContain('name="password"');
    expect(html).not.toContain('<select name="default_ws"');

    const setCookie = res.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toContain(`${PENDING_COOKIE}=`);
    expect(setCookie).toContain("Max-Age=0");

    const pendingKeys = [...kv._map.keys()].filter((k) => k.startsWith("pending:v1:"));
    expect(pendingKeys).toHaveLength(0);
    expect(completeCalls).toHaveLength(0);
  });

  test("step2 when completeAuthorization throws: step1 error, pending kept, cookie not cleared", async () => {
    const kv = memKV();
    const { provider, completeCalls } = createFakeProvider();
    (
      provider as { completeAuthorization: (opts: CompleteCall) => Promise<{ redirectTo: string }> }
    ).completeAuthorization = async (opts: CompleteCall) => {
      completeCalls.push(opts);
      throw new Error("completeAuthorization failed");
    };

    const env: WorkerEnv = {
      OAUTH_PROVIDER: provider,
      OAUTH_KV: kv as unknown as KVNamespace,
      USER_ID_PEPPER: PEPPER,
    };

    const step1 = await AuthHandler.fetch(
      new Request(AUTHORIZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formBody({ email: EMAIL, password: PASSWORD }),
      }),
      env
    );
    const cookiePair = setCookieFromResponse(step1);
    expect(cookiePair).toBeTruthy();
    if (!cookiePair) throw new Error("expected Set-Cookie from step1");
    expect([...kv._map.keys()].filter((k) => k.startsWith("pending:v1:"))).toHaveLength(1);

    const step2 = await AuthHandler.fetch(
      new Request(AUTHORIZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookiePair,
        },
        body: formBody({
          default_ws: "ws-a",
        }),
      }),
      env
    );

    expect(step2.status).toBe(400);
    const html = await step2.text();
    expect(html).toContain("Не удалось завершить авторизацию");
    expect(html).toContain('name="password"');
    expect(step2.headers.get("Location")).toBeNull();
    // Pending kept for retry; no success redirect / clear cookie.
    expect([...kv._map.keys()].filter((k) => k.startsWith("pending:v1:"))).toHaveLength(1);
    const setCookie = step2.headers.get("Set-Cookie");
    expect(setCookie).toBeNull();
    expect(completeCalls).toHaveLength(1);
  });
});
