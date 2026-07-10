# Cloudflare Remote MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public Cloudflare Workers remote MCP with OAuth 2.1 bridge (login + scope UI), shared portable core for tools, and RU README with emoji + agent install prompts — without breaking stdio/Docker/npm HTTP.

**Architecture:** Extract portable MCP core (`packages/core`) from current `src/`. Thin adapters: `packages/stdio`, `packages/http-node` (existing gateway/passthrough), `packages/worker` (`OAuthProvider` + login form + `createMcpHandler` / session props → `OtaskAuthResolver` + `ScopeContext`). Official demo on maintainer CF; self-deploy via Wrangler documented.

**Tech Stack:** Bun ≥1.1, TypeScript, `@modelcontextprotocol/sdk`, Zod, Cloudflare Workers, `agents` (`createMcpHandler`, `getMcpAuthContext`), `@cloudflare/workers-oauth-provider`, Wrangler, KV for OAuth state, existing `bun test` + Biome CI.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-10-cloudflare-remote-mcp-design.md`
- Code, commits, PR titles, this plan: **English**
- User-facing README: **Russian**, emoji section markers, agent install prompts
- Password: never store or log; drop after login request
- Public multi-user Worker: **no** server `OTASK_*` / gateway `MCP_AUTH_TOKEN`
- O!task token + scope only in OAuth encrypted session props
- Empty allow-lists = guards off (full token access)
- Scope on Worker from **session only** (not MCP client headers, not server env allow-lists)
- Do not break bins `otask-mcp` / `otask-mcp-http` without major version
- Do not modify `.github/workflows/publish.yml` OIDC flow except path fixes if monorepo requires
- Required CI still: `lint`, `build`, `unit`, `PR Title`
- Reference CF patterns: https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/ and `cloudflare/agents` examples `mcp-worker-authenticated`
- YAGNI: no captcha, no billing, no native O!task OAuth, no McpAgent Durable Object state unless `createMcpHandler` path proves insufficient

## File Structure

| Path | Responsibility |
|------|----------------|
| `packages/core/src/**` | Portable tools, api, mappers, guards, auth resolvers, `createMcpServer`, `scopeFromSession` |
| `packages/core/package.json` | `@grigoreo-dev/otask-mcp-core` (private workspace package) |
| `packages/stdio/src/index.ts` | stdio entry (was `src/index.ts`) |
| `packages/http-node/src/mcp-http.ts` | Node Streamable HTTP (was `src/mcp-http.ts`) |
| `packages/worker/src/index.ts` | `OAuthProvider` export default |
| `packages/worker/src/auth-handler.ts` | Login HTML + POST login + `completeAuthorization` |
| `packages/worker/src/login-page.ts` | RU login form HTML builder |
| `packages/worker/src/mcp-api.ts` | MCP apiHandler using session props |
| `packages/worker/wrangler.toml` | Worker name, KV, compatibility |
| `packages/worker/package.json` | deps: `agents`, `@cloudflare/workers-oauth-provider` |
| `package.json` (root) | workspaces, bins → stdio/http-node dist, scripts |
| `tsconfig*.json` | root + per-package |
| `Dockerfile` | build/run `http-node` |
| `README.md` | RU docs: privacy, modes, emoji, agent prompts |
| `tests/**` | stay at repo root or `packages/core/tests` — keep `bun test` green |
| `.github/workflows/ci.yml` | monorepo-aware lint/build/unit |
| `.github/workflows/deploy-worker.yml` | optional `workflow_dispatch` wrangler deploy |

Unchanged intent: tag publish of `@grigoreo-dev/otask-mcp` with stdio + HTTP bins.

---

### Task 1: Branch + `scopeFromSession` (TDD, before monorepo move)

**Files:**
- Create: `src/services/session-scope.ts`
- Create: `tests/session-scope.test.ts`
- Modify: `src/services/scope.ts` only if exporting helpers needed (prefer reuse existing `parseWsAllowList`, `createWsGuard`, `createProjectGuard`, `parseProjectAllowList`)

**Interfaces:**
- Produces:
```typescript
export interface OtaskSessionProps {
  otaskToken: string;
  defaultWs?: string;
  defaultProject?: string;
  /** Comma-separated workspace slugs; empty/undefined = allow-list off */
  allowedWs?: string;
  /** Comma-separated project slugs or numeric ids; empty/undefined = allow-list off */
  allowedProjects?: string;
}

export function scopeFromSession(props: OtaskSessionProps): ScopeContext;
export function createSessionAuthResolver(props: OtaskSessionProps): OtaskAuthResolver;
```
- Consumes: `ScopeContext`, `createPassthroughAuthResolver`, guard parsers from existing modules

- [ ] **Step 1: Create branch**

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/cloudflare-remote-mcp
```

- [ ] **Step 2: Write failing tests**

Create `tests/session-scope.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import {
  createSessionAuthResolver,
  scopeFromSession,
  type OtaskSessionProps,
} from "../src/services/session-scope.ts";

describe("scopeFromSession", () => {
  test("empty allow-lists mean guards off and optional defaults", () => {
    const scope = scopeFromSession({
      otaskToken: "t",
      defaultWs: " my-ws ",
      defaultProject: "42",
    });
    expect(scope.defaultWs).toBe("my-ws");
    expect(scope.defaultProject).toBe("42");
    expect(scope.wsGuard.list.isEmpty).toBe(true);
    expect(scope.projectGuard.list.isEmpty).toBe(true);
    expect(scope.wsGuard.allows("any")).toBe(true);
  });

  test("allow-lists restrict ws and projects", () => {
    const scope = scopeFromSession({
      otaskToken: "t",
      allowedWs: "a, b",
      allowedProjects: "p1, 7",
    });
    expect(scope.wsGuard.allows("a")).toBe(true);
    expect(scope.wsGuard.allows("c")).toBe(false);
    expect(() => scope.wsGuard.assertAllowed("c")).toThrow(/Workspace not allowed/);
    expect(scope.projectGuard.allows({ slug: "p1" })).toBe(true);
    expect(scope.projectGuard.allows({ id: 7 })).toBe(true);
    expect(scope.projectGuard.allows({ slug: "other" })).toBe(false);
  });
});

describe("createSessionAuthResolver", () => {
  test("returns Bearer for otaskToken", async () => {
    const props: OtaskSessionProps = { otaskToken: "secret-token" };
    const headers = await createSessionAuthResolver(props)();
    expect(headers.Authorization).toBe("Bearer secret-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
bun test tests/session-scope.test.ts
```

Expected: fail resolving `../src/services/session-scope.ts` or missing exports.

- [ ] **Step 4: Implement `src/services/session-scope.ts`**

```typescript
import type { OtaskAuthResolver } from "./auth.js";
import { createPassthroughAuthResolver } from "./auth.js";
import {
  createProjectGuard,
  parseProjectAllowList,
} from "./project-guard.js";
import {
  createWsGuard,
  parseWsAllowList,
  type ScopeContext,
} from "./scope.js";

export interface OtaskSessionProps {
  otaskToken: string;
  defaultWs?: string;
  defaultProject?: string;
  allowedWs?: string;
  allowedProjects?: string;
}

function trimOrUndef(v: string | undefined | null): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

export function scopeFromSession(props: OtaskSessionProps): ScopeContext {
  return {
    defaultWs: trimOrUndef(props.defaultWs),
    defaultProject: trimOrUndef(props.defaultProject),
    wsGuard: createWsGuard(parseWsAllowList(props.allowedWs)),
    projectGuard: createProjectGuard(parseProjectAllowList(props.allowedProjects)),
  };
}

export function createSessionAuthResolver(props: OtaskSessionProps): OtaskAuthResolver {
  return createPassthroughAuthResolver(props.otaskToken);
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
bun test tests/session-scope.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/services/session-scope.ts tests/session-scope.test.ts
git commit -m "feat: scope and auth resolver from OAuth session props"
```

---

### Task 2: Extract portable O!task login helper (no password cache for Worker)

**Files:**
- Modify: `src/services/auth.ts`
- Create: `tests/otask-login.test.ts`

**Interfaces:**
- Produces:
```typescript
export async function loginOtaskWithPassword(
  email: string,
  password: string,
  options?: { fetchImpl?: typeof fetch; apiBaseUrl?: string }
): Promise<{ token: string; expiresInMinutes: number }>;
```
- Side effect: existing `loginWithPassword` may call this and still update process-local cache for gateway/stdio only
- Worker must call `loginOtaskWithPassword` **without** using the process cache

- [ ] **Step 1: Write failing test with mocked fetch**

```typescript
import { describe, expect, test } from "bun:test";
import { loginOtaskWithPassword } from "../src/services/auth.ts";

describe("loginOtaskWithPassword", () => {
  test("returns token from O!task login JSON", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ token: "abc", expires_in: 60 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const result = await loginOtaskWithPassword("a@b.c", "pw", { fetchImpl: fetchImpl as typeof fetch });
    expect(result.token).toBe("abc");
    expect(result.expiresInMinutes).toBe(60);
  });

  test("throws on non-ok without leaking password", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ message: "bad creds" }), { status: 401 });
    await expect(
      loginOtaskWithPassword("a@b.c", "super-secret", { fetchImpl: fetchImpl as typeof fetch })
    ).rejects.toThrow(/login failed/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
bun test tests/otask-login.test.ts
```

- [ ] **Step 3: Implement export in `src/services/auth.ts`**

Add (adapt imports/`API_BASE_URL` already present):

```typescript
export async function loginOtaskWithPassword(
  email: string,
  password: string,
  options?: { fetchImpl?: typeof fetch; apiBaseUrl?: string }
): Promise<{ token: string; expiresInMinutes: number }> {
  const fetchImpl = options?.fetchImpl ?? fetch;
  const base = options?.apiBaseUrl ?? API_BASE_URL;
  const response = await fetchImpl(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  const body = (await response.json().catch(() => ({}))) as LoginResponse & {
    message?: string;
  };

  if (!response.ok || !body.token) {
    const detail =
      typeof body.message === "string" ? body.message : JSON.stringify(body).slice(0, 500);
    throw new Error(`O!task login failed (${response.status}): ${detail}`);
  }

  return {
    token: body.token,
    expiresInMinutes: body.expires_in ?? 1_000_000,
  };
}
```

Refactor internal `loginWithPassword` to call `loginOtaskWithPassword` then set `cachedToken` as today.

- [ ] **Step 4: Run unit tests**

```bash
bun test tests/otask-login.test.ts tests/session-scope.test.ts
bun test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/auth.ts tests/otask-login.test.ts
git commit -m "feat: export password login helper without requiring env cache"
```

---

### Task 3: Monorepo scaffold (workspaces) without behavior change

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/stdio/package.json`, `packages/http-node/package.json`
- Modify: root `package.json` (workspaces)
- Move: `src/**` → `packages/core/src/**` (git mv)
- Move: entrypoints into stdio/http-node that re-export/import core
- Update: `tests/**` imports, `Dockerfile`, `tsconfig`, CI paths, `biome.json` if needed

**Interfaces:**
- Root package name stays `@grigoreo-dev/otask-mcp`
- Bins still `otask-mcp` → built stdio entry, `otask-mcp-http` → built http-node entry
- Core package name: `@grigoreo-dev/otask-mcp-core` with `"private": true` (not published separately in v1)

**Preferred layout after move:**

```
packages/core/src/          # former src/ minus pure entry files
packages/stdio/src/index.ts
packages/http-node/src/mcp-http.ts
tests/                      # keep at root; import from packages/core/src
```

- [ ] **Step 1: Create workspace package.json files**

Root `package.json` additions (merge carefully with existing fields):

```json
{
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "bun run --filter @grigoreo-dev/otask-mcp-core build && bun run --filter @grigoreo-dev/otask-mcp-stdio build && bun run --filter @grigoreo-dev/otask-mcp-http build",
    "test": "bun test",
    "lint": "biome check .",
    "start": "bun run packages/stdio/dist/index.js",
    "start:http": "bun run packages/http-node/dist/mcp-http.js"
  }
}
```

If Bun workspace filter syntax differs in the installed Bun version, use sequential `tsc -p packages/core` etc. — verify with `bun --version` and adjust scripts to what works; **do not leave broken scripts**.

`packages/core/package.json`:

```json
{
  "name": "@grigoreo-dev/otask-mcp-core",
  "version": "1.4.0",
  "private": true,
  "type": "module",
  "main": "dist/server.js",
  "types": "dist/server.d.ts",
  "exports": {
    ".": "./dist/server.js",
    "./*": "./dist/*"
  },
  "scripts": {
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^3.24.2"
  }
}
```

`packages/stdio/package.json` and `packages/http-node/package.json`: depend on `"@grigoreo-dev/otask-mcp-core": "workspace:*"`, build with tsc, single entry each.

- [ ] **Step 2: git mv sources**

```bash
mkdir -p packages/core packages/stdio/src packages/http-node/src
git mv src packages/core/src
# Then split entry files:
git mv packages/core/src/index.ts packages/stdio/src/index.ts
git mv packages/core/src/mcp-http.ts packages/http-node/src/mcp-http.ts
```

Fix imports in moved entry files to use `@grigoreo-dev/otask-mcp-core/...` or relative paths into core `dist` / `src` for Bun tests.

**Import strategy (pick one and use consistently):**
- **Tests + Bun:** import TypeScript from `packages/core/src/...` with relative paths from `tests/`
- **Built bins:** compile core first; stdio/http-node import from `../core/dist/...`

Update every `from "../src/` in tests to `from "../packages/core/src/`.

- [ ] **Step 3: tsconfig per package**

`packages/core/tsconfig.json`: `rootDir` `./src`, `outDir` `./dist`, same strict flags as root.

Stdio/http-node tsconfigs: compile their `src` only, `paths` or node resolution to core.

- [ ] **Step 4: Dockerfile**

```dockerfile
FROM oven/bun:1 AS builder
WORKDIR /app
COPY package.json bun.lockb ./
COPY packages ./packages
RUN bun install --frozen-lockfile
RUN bun run build

FROM oven/bun:1-slim
WORKDIR /app
COPY package.json bun.lockb ./
COPY packages ./packages
RUN bun install --frozen-lockfile --production
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/http-node/dist ./packages/http-node/dist
ENV PORT=3847
EXPOSE 3847
CMD ["bun", "run", "packages/http-node/dist/mcp-http.js"]
```

Adjust if lockfile paths require copying root workspaces differently — image must start HTTP server on 3847.

- [ ] **Step 5: Verify green tree**

```bash
bun install
bun run lint
bun run build
bun test
```

Expected: lint/build/test exit 0. Fix any path breakage before commit.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: monorepo packages core, stdio, http-node"
```

---

### Task 4: Worker package scaffold + wrangler

**Files:**
- Create: `packages/worker/package.json`
- Create: `packages/worker/tsconfig.json`
- Create: `packages/worker/wrangler.toml`
- Create: `packages/worker/src/index.ts` (stub export)
- Create: `packages/worker/src/env.d.ts`
- Modify: root workspace list if not already `packages/*`

**Interfaces:**
- Worker name: `otask-mcp` (changeable via wrangler)
- Bindings:
  - `OAUTH_KV` (KV namespace)
  - secrets later: none required for multi-user login (O!task is user-supplied)
  - optional `COOKIE_ENCRYPTION_KEY` if provider requires (follow workers-oauth-provider docs at implement time)

- [ ] **Step 1: Install worker deps in workspace**

```bash
cd /root/otask-mcp
bun add agents @cloudflare/workers-oauth-provider --cwd packages/worker
bun add -d wrangler @cloudflare/workers-types typescript --cwd packages/worker
```

Pin versions that install cleanly; record exact versions in package.json.

- [ ] **Step 2: `packages/worker/wrangler.toml`**

```toml
name = "otask-mcp"
main = "src/index.ts"
compatibility_date = "2025-03-10"
compatibility_flags = ["nodejs_compat"]

[[kv_namespaces]]
binding = "OAUTH_KV"
id = "REPLACE_AFTER_wrangler_kv_namespace_create"
preview_id = "REPLACE_PREVIEW"

[vars]
# no OTASK_* for multi-user public deploy
```

- [ ] **Step 3: Minimal stub `packages/worker/src/index.ts`**

```typescript
export default {
  async fetch(): Promise<Response> {
    return new Response("otask-mcp worker scaffold", { status: 200 });
  },
};
```

- [ ] **Step 4: Typecheck / dry run**

```bash
cd packages/worker && bunx wrangler deploy --dry-run
```

Expected: bundles without error (KV id may warn — use placeholder only for dry-run if required).

- [ ] **Step 5: Commit**

```bash
git add packages/worker package.json bun.lockb
git commit -m "chore: scaffold Cloudflare worker package"
```

---

### Task 5: Login page (RU) + auth handler (OAuth completeAuthorization)

**Files:**
- Create: `packages/worker/src/login-page.ts`
- Create: `packages/worker/src/auth-handler.ts`
- Create: `packages/worker/src/session-props.ts` (re-export or map to core `OtaskSessionProps`)
- Test: `packages/worker/src/login-page.test.ts` or root `tests/worker-login-page.test.ts` (pure HTML builder, no CF runtime)

**Interfaces:**
- Consumes: `loginOtaskWithPassword` from core; `env.OAUTH_PROVIDER` helpers from workers-oauth-provider
- Produces: `AuthHandler` with `fetch(request, env, ctx)`
- On success `completeAuthorization`:
```typescript
await provider.completeAuthorization({
  request: oauthReq,
  userId: email, // stable id = email lowercased
  scope: oauthReq.scope ?? [],
  props: {
    otaskToken: token,
    defaultWs: form default_ws or undefined,
    defaultProject: form default_project or undefined,
    allowedWs: form allowed_ws or undefined,
    allowedProjects: form allowed_projects or undefined,
  } satisfies OtaskSessionProps,
  // metadata fields per library API at implement time
});
```
- Password field read once from `FormData`, never assigned to `props`, never logged

- [ ] **Step 1: Pure login HTML builder + test**

`login-page.ts` exports:

```typescript
export function renderLoginPage(opts: {
  query: string;
  error?: string;
}): Response
```

HTML requirements:
- `lang="ru"`
- Fields: `email`, `password`, `default_ws`, `default_project`, `allowed_ws`, `allowed_projects`
- Privacy paragraph (RU): пароль не сохраняется; токен O!task только в сессии MCP; при истечении — повторный вход
- Link to project README privacy (relative `/` info page or GitHub README URL)
- Short EN footer line: "O!task MCP — open source remote connector"
- POST to `/authorize?${opts.query}`
- Tailwind CDN optional (match CF example) or minimal CSS

Test asserts: contains `name="email"`, `name="password"`, privacy substring `не сохраня`, no hardcoded secrets.

- [ ] **Step 2: Implement auth-handler**

Pattern (adjust to exact `OAuthHelpers` types from installed package):

```typescript
import { loginOtaskWithPassword } from "@grigoreo-dev/otask-mcp-core/services/auth.js";
import type { OtaskSessionProps } from "@grigoreo-dev/otask-mcp-core/services/session-scope.js";
import { renderLoginPage } from "./login-page.js";

export interface WorkerEnv {
  OAUTH_PROVIDER: {
    parseAuthRequest(request: Request): Promise<unknown>;
    completeAuthorization(options: {
      request: unknown;
      userId: string;
      scope: string[];
      props: OtaskSessionProps;
    }): Promise<{ redirectTo: string }>;
  };
}

export const AuthHandler = {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/authorize") {
      return new Response("Not found", { status: 404 });
    }
    const provider = env.OAUTH_PROVIDER;
    const oauthReq = await provider.parseAuthRequest(request);

    if (request.method === "GET") {
      return renderLoginPage({ query: url.searchParams.toString() });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const form = await request.formData();
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const defaultWs = String(form.get("default_ws") || "").trim() || undefined;
    const defaultProject = String(form.get("default_project") || "").trim() || undefined;
    const allowedWs = String(form.get("allowed_ws") || "").trim() || undefined;
    const allowedProjects = String(form.get("allowed_projects") || "").trim() || undefined;

    if (!email || !password) {
      return renderLoginPage({
        query: url.searchParams.toString(),
        error: "Укажите email и пароль O!task",
      });
    }

    let token: string;
    try {
      const result = await loginOtaskWithPassword(email, password);
      token = result.token;
    } catch {
      return renderLoginPage({
        query: url.searchParams.toString(),
        error: "Не удалось войти в O!task. Проверьте email и пароль.",
      });
    }

    const props: OtaskSessionProps = {
      otaskToken: token,
      defaultWs,
      defaultProject,
      allowedWs,
      allowedProjects,
    };

    const { redirectTo } = await provider.completeAuthorization({
      request: oauthReq,
      userId: email.toLowerCase(),
      scope: [],
      props,
    });

    return Response.redirect(redirectTo, 302);
  },
};
```

**Critical:** after building `props`, do not keep `password` variable in any async continuation beyond login call; avoid logging `form`.

- [ ] **Step 3: Unit-test login page only under bun test; auth-handler integration optional mock**

```bash
bun test tests/worker-login-page.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/worker tests
git commit -m "feat(worker): RU login form and OAuth authorization handler"
```

---

### Task 6: Wire OAuthProvider + MCP apiHandler with session props

**Files:**
- Modify: `packages/worker/src/index.ts`
- Create: `packages/worker/src/mcp-api.ts`
- Modify: `packages/core/src/server.ts` if needed for version string only

**Interfaces:**
- MCP route: `/mcp`
- OAuth: `/authorize`, `/oauth/token`, `/oauth/register` (per CF example)
- `getMcpAuthContext()` → `props` as `OtaskSessionProps`
- Build server per request (stateless handler) OR once if context is request-scoped — **must** read props per tool call via `getMcpAuthContext()`

- [ ] **Step 1: Implement `mcp-api.ts`**

```typescript
import { createMcpHandler, getMcpAuthContext } from "agents/mcp";
import { createMcpServer } from "@grigoreo-dev/otask-mcp-core/server.js";
import {
  createSessionAuthResolver,
  scopeFromSession,
  type OtaskSessionProps,
} from "@grigoreo-dev/otask-mcp-core/services/session-scope.js";

function serverFromAuthContext() {
  const authCtx = getMcpAuthContext();
  const props = authCtx?.props as OtaskSessionProps | undefined;
  if (!props?.otaskToken) {
    throw new Error("Unauthorized: missing O!task session. Reconnect the MCP server.");
  }
  return createMcpServer(createSessionAuthResolver(props), scopeFromSession(props));
}

export const apiHandler = {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const server = serverFromAuthContext();
    return createMcpHandler(server)(request, env, ctx);
  },
};
```

If `getMcpAuthContext()` is only valid inside tool handlers (not at handler entry), instead register tools through a factory that calls `getMcpAuthContext()` **inside each tool** — then refactor `createMcpServer` to accept a `() => { auth, scope }` lazy deps. Prefer the pattern that matches the installed `agents` version; verify against `examples/mcp-worker-authenticated` source in node_modules or GitHub.

**If lazy deps required**, add to core:

```typescript
export type AuthScopeProvider = () => {
  auth: OtaskAuthResolver;
  scope: ScopeContext;
};

export function createMcpServerFromProvider(provider: AuthScopeProvider): McpServer
```

where each tool resolves provider() at call time. Existing `createMcpServer(auth, scope)` remains for stdio/http-node.

- [ ] **Step 2: Export OAuthProvider in `index.ts`**

```typescript
import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { AuthHandler } from "./auth-handler.js";
import { apiHandler } from "./mcp-api.js";

export default new OAuthProvider({
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler: AuthHandler,
  // kv binding name per package docs — often configured via wrangler + constructor options
});
```

Read installed `@cloudflare/workers-oauth-provider` README for exact constructor options (`apiHandlers` vs `apiHandler`, KV binding). **Match the installed API**, not this sketch, if they differ.

- [ ] **Step 3: Map O!task 401 to reconnect message**

In core API client (`packages/core/src/services/api.ts` `assertSuccess` or equivalent), when status is 401, throw:

```typescript
throw new Error(
  "O!task authorization expired or rejected (401). Reconnect the MCP server and sign in again."
);
```

Add/adjust unit test in `tests/api-paths.test.ts` or new test if assertSuccess is testable.

- [ ] **Step 4: Local smoke**

```bash
cd packages/worker
bunx wrangler kv namespace create OAUTH_KV
# paste id into wrangler.toml
bunx wrangler dev
```

Manual: open `/authorize` (may need OAuth query params from MCP Inspector). Use MCP Inspector OAuth flow against `http://127.0.0.1:8787/mcp`.

- [ ] **Step 5: Commit**

```bash
git add packages/worker packages/core tests
git commit -m "feat(worker): OAuth-protected MCP handler with session scope"
```

---

### Task 7: CI + optional deploy workflow + rate limit notes

**Files:**
- Modify: `.github/workflows/ci.yml` (paths, build commands)
- Create: `.github/workflows/deploy-worker.yml` (`workflow_dispatch`)
- Create: `packages/worker/DEPLOY.md` (English operator notes) **or** fold into README RU section only — prefer README for users; short EN in `packages/worker/README.md`

- [ ] **Step 1: Ensure CI runs monorepo**

`ci.yml` jobs must run from repo root:

```yaml
- run: bun install --frozen-lockfile
- run: bun run lint
- run: bun run build
- run: bun test
```

Job names remain `lint`, `build`, `unit` (branch protection).

- [ ] **Step 2: deploy-worker.yml**

```yaml
name: Deploy Worker
on:
  workflow_dispatch:
jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun install --cwd packages/worker
      - name: Deploy
        working-directory: packages/worker
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: bunx wrangler deploy
```

Document required GitHub secrets in `packages/worker/README.md`.

- [ ] **Step 3: Rate limiting (config, not code)**

In `packages/worker/README.md` add checklist:
1. Cloudflare dashboard → Security → Rate limiting rules
2. Rule A: `/authorize` POST ≤ 10 / min / IP
3. Rule B: `/mcp` ≤ 120 / min / IP (tune later)
4. Challenge free-tier alternatives if RL not available: note WAF custom rule

No captcha code in v1.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows packages/worker/README.md
git commit -m "ci: monorepo CI and optional worker deploy workflow"
```

---

### Task 8: README (RU) — privacy, emoji, agent prompts, modes

**Files:**
- Modify: `README.md` (full restructure; keep accurate env tables)

**Required sections (emoji headers):**

1. `## 🚀 Возможности` — short pitch
2. `## 🔒 Приватность и доверие` — password not stored; token only in session; re-login; OSS intent; link to CF blog
3. `## ☁️ Remote MCP (Cloudflare)` — official URL placeholder `https://otask-mcp.<account>.workers.dev/mcp` until deployed; OAuth connect steps
4. `## 💻 stdio (локально)`
5. `## 🐳 Docker / HTTP`
6. `## 🔀 Режимы auth` — matrix: stdio | gateway | passthrough | **remote Worker**
7. `## 🤖 Промпты для агентов` — six fenced prompts (see below)
8. `## 🔧 Self-deploy Worker`
9. Env/headers tables (existing, updated)

**Six agent prompt blocks** (copy-paste, Russian instructions to the agent):

```markdown
### Claude web → официальный URL
\`\`\`
Подключи remote MCP сервер O!task:
- URL: https://<OFFICIAL>/mcp
- Используй OAuth / Connect flow клиента
- После логина email+password O!task задай default workspace/project если нужно
Не сохраняй мой пароль в файлы репозитория.
\`\`\`

### Cursor → официальный URL
\`\`\`
Добавь в MCP config Cursor remote server O!task:
url: https://<OFFICIAL>/mcp
auth: oauth
После connect проверь otask_me.
\`\`\`

### Self-deploy Worker
\`\`\`
Задеплой otask-mcp Worker из репозитория grigoreo-dev/otask-mcp:
1) packages/worker, wrangler kv namespace create OAUTH_KV
2) wrangler deploy
3) Дай мне URL /mcp и пропиши в MCP клиент с OAuth
\`\`\`

### Docker passthrough
\`\`\`
Подними otask-mcp HTTP passthrough в Docker без OTASK_* в env.
Клиент шлёт Authorization: Bearer <O!task token>.
PORT 3847. Проверь GET /health.
\`\`\`

### stdio local
\`\`\`
Установи @grigoreo-dev/otask-mcp, настрой stdio MCP с OTASK_EMAIL+OTASK_PASSWORD
или OTASK_AUTH_KEY. Добавь в Claude Desktop / Cursor mcp servers.
\`\`\`

### Gateway self-host
\`\`\`
HTTP gateway: задай OTASK_* + MCP_AUTH_TOKEN.
Клиент шлёт Bearer MCP_AUTH_TOKEN, не токен O!task.
\`\`\`
```

Replace `<OFFICIAL>` when demo is live; until then state `TBD after first deploy` once in privacy/remote section — **not** as unfinished plan placeholder in code.

Link: https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/

- [ ] **Step 1: Edit README.md**

- [ ] **Step 2: Sanity — no secrets, RU for user prose**

```bash
# must not match real credentials
grep -E 'OTASK_PASSWORD=|sk-|eyJ' README.md && exit 1 || true
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: RU README with privacy, remote MCP, agent install prompts"
```

---

### Task 9: Version bump, PR, smoke checklist

**Files:**
- Modify: root + package versions to `1.5.0` (minor: remote MCP + monorepo)
- Modify: `createMcpServer` version string if hardcoded

- [ ] **Step 1: Bump version consistently**

```bash
# update package.json version fields to 1.5.0 in root + packages
```

- [ ] **Step 2: Full verify**

```bash
bun run lint && bun run build && bun test
```

Expected: all green.

- [ ] **Step 3: Push PR**

```bash
git push -u origin feat/cloudflare-remote-mcp
gh pr create --title "feat: Cloudflare remote MCP OAuth bridge" --body "$(cat <<'EOF'
## Summary
- Shared core monorepo (core / stdio / http-node / worker)
- Cloudflare Worker OAuth 2.1 bridge + RU login/scope form
- Session props → OtaskAuthResolver + ScopeContext
- README RU: privacy, emoji, agent prompts

## Spec
docs/superpowers/specs/2026-07-10-cloudflare-remote-mcp-design.md

## Test plan
- [ ] bun lint/build/test green
- [ ] wrangler dev + MCP Inspector OAuth
- [ ] Docker http still starts
- [ ] stdio still starts with OTASK_*
EOF
)"
```

- [ ] **Step 4: Post-merge deploy (human)**

1. Create KV, set wrangler ids
2. `wrangler deploy` or Actions `Deploy Worker`
3. Paste official URL into README
4. Tag `v1.5.0` when ready to publish npm (only if bins/package layout verified)

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Any remote MCP client + OAuth on same Worker | 5–6 |
| Password not stored; token in session | 5–6 |
| Re-login on O!task expiry | 6 (401 message) |
| Official demo + self-deploy | 7–8 |
| Scope on login form → session | 1, 5–6 |
| Shared core refactor | 3 |
| Rate limit minimum | 7 |
| McpAgent / OAuthProvider approach | 6 (`createMcpHandler` + OAuthProvider; McpAgent DO optional) |
| RU README emoji + agent prompts | 8 |
| Keep Docker/stdio working | 3, 9 |

**Note on McpAgent vs createMcpHandler:** Spec recommends CF Agents path; official authenticated example uses `createMcpHandler` + `OAuthProvider` + `getMcpAuthContext`. Plan follows that (stateless, correct for multi-user tokens). Introduce `McpAgent` only if a concrete client requires DO session affinity.

**Open at implement time (not design gaps):** exact `OAuthProvider` constructor fields and whether tools need lazy auth provider — resolve from installed package versions in Task 6.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-10-cloudflare-remote-mcp.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans checkpoints  

Which approach?
