import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { listProjects, listTeams } from "@grigoreo-dev/otask-mcp-core/services/api.js";
import {
  createPassthroughAuthResolver,
  loginOtaskWithPassword,
} from "@grigoreo-dev/otask-mcp-core/services/auth.js";
import { iconResponse } from "./icon-asset.js";
import { renderLanding } from "./landing-page.js";
import { renderLoginStep1, renderLoginStep2 } from "./login-page.js";
import {
  clearPendingCookieHeader,
  createPendingId,
  deletePending,
  fingerprintFromOAuthReq,
  fingerprintsMatch,
  getPending,
  PENDING_TTL_SEC,
  type PendingKV,
  pendingCookieHeader,
  putPending,
  signPendingCookie,
  verifyPendingCookie,
} from "./pending-auth.js";
import type { OtaskSessionProps } from "./session-props.js";
import { hashUserId } from "./user-id.js";

export interface WorkerEnv {
  OAUTH_PROVIDER: OAuthHelpers;
  OAUTH_KV: KVNamespace;
  /** Secret pepper for HMAC of userId; set as a Worker secret. */
  USER_ID_PEPPER?: string;
}

/** Concurrency-capped map over items (order preserved). */
async function mapPool<T, R>(items: T[], size: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      const item = items[idx];
      if (item === undefined) continue;
      out[idx] = await fn(item);
    }
  });
  await Promise.all(workers);
  return out;
}

function csv(values: string[]): string | undefined {
  const parts = values.map((v) => v.trim()).filter(Boolean);
  return parts.length ? parts.join(",") : undefined;
}

/** Form value is either "wsSlug::projectSlug" or a plain project slug / id. */
function parseProjectValue(v: FormDataEntryValue | null | undefined): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  if (!s) return undefined;
  const sep = s.indexOf("::");
  if (sep === -1) return s;
  const projectSlug = s.slice(sep + 2).trim();
  return projectSlug || undefined;
}

function withSetCookie(res: Response, cookie: string): Response {
  const headers = new Headers(res.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export const AuthHandler = {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      return renderLanding({ origin: url.origin });
    }
    if (
      request.method === "GET" &&
      (url.pathname === "/favicon.ico" || url.pathname === "/icon.png")
    ) {
      return iconResponse();
    }
    if (url.pathname !== "/authorize") {
      return new Response("Not found", { status: 404 });
    }

    const provider = env.OAUTH_PROVIDER;
    const query = url.searchParams.toString();

    const pepper = env.USER_ID_PEPPER?.trim();
    if (!pepper) {
      return new Response("Server misconfigured: missing USER_ID_PEPPER secret", { status: 500 });
    }

    if (request.method === "GET") {
      // Parse early so invalid OAuth query fails with a clear step1 error.
      try {
        await provider.parseAuthRequest(request);
      } catch {
        return renderLoginStep1({
          query,
          error: "Некорректный OAuth-запрос. Откройте подключение MCP снова из клиента.",
        });
      }
      return renderLoginStep1({ query });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return renderLoginStep1({
        query,
        error: "Некорректные данные формы. Попробуйте войти снова.",
      });
    }

    let oauthReq: Awaited<ReturnType<OAuthHelpers["parseAuthRequest"]>>;
    try {
      oauthReq = await provider.parseAuthRequest(request);
    } catch {
      return renderLoginStep1({
        query,
        error: "Некорректный OAuth-запрос. Откройте подключение MCP снова из клиента.",
      });
    }

    const fp = fingerprintFromOAuthReq(oauthReq);
    const kv = env.OAUTH_KV as unknown as PendingKV;

    // Step1: form has password field (credentials).
    const hasPasswordField = form.has("password");
    if (hasPasswordField) {
      const email = String(form.get("email") || "").trim();
      const password = String(form.get("password") || "");
      if (!email || !password) {
        return renderLoginStep1({
          query,
          error: "Укажите email и пароль O!task",
        });
      }

      let token: string;
      try {
        const result = await loginOtaskWithPassword(email, password);
        token = result.token;
      } catch {
        return renderLoginStep1({
          query,
          error: "Не удалось войти в O!task. Проверьте email и пароль.",
        });
      }

      const userId = await hashUserId(email, pepper);
      const id = createPendingId();
      await putPending(kv, id, {
        otaskToken: token,
        userId,
        fingerprint: fp,
        exp: Math.floor(Date.now() / 1000) + PENDING_TTL_SEC,
      });

      const auth = createPassthroughAuthResolver(token);
      let teams: Awaited<ReturnType<typeof listTeams>> = [];
      try {
        teams = await listTeams(auth);
      } catch {
        teams = [];
      }

      // Total teams failure or empty list → restart login (no empty required select).
      if (teams.length === 0) {
        await deletePending(kv, id);
        return withSetCookie(
          renderLoginStep1({
            query,
            error: "Не удалось загрузить пространства O!task. Попробуйте войти снова.",
          }),
          clearPendingCookieHeader()
        );
      }

      const projectsByWs = await mapPool(teams, 5, async (t) => {
        try {
          const projects = await listProjects(t.slug, auth);
          return {
            ws: t.slug,
            projects: projects.map((p) => ({ id: p.id, slug: p.slug, name: p.name })),
            error: null as string | null,
          };
        } catch (e) {
          return {
            ws: t.slug,
            projects: [],
            error: String(e),
          };
        }
      });

      const warnings = projectsByWs
        .filter((entry) => entry.error)
        .map((entry) => {
          const team = teams.find((t) => t.slug === entry.ws);
          const name = team?.name ?? entry.ws;
          return `Проекты пространства «${name}» не загрузились`;
        });

      const defaultTeamSlug = teams[0]?.slug;
      const resp = renderLoginStep2({
        query,
        teams: teams.map((t) => ({ slug: t.slug, name: t.name })),
        projectsByWs,
        defaultTeamSlug,
        warnings: warnings.length ? warnings : undefined,
      });
      const cookieVal = await signPendingCookie(id, pepper);
      return withSetCookie(resp, pendingCookieHeader(cookieVal));
    }

    // Step2: scope picks (hidden step=2 / no password).
    const id = await verifyPendingCookie(request.headers.get("Cookie") ?? "", pepper);
    const pending = id ? await getPending(kv, id) : null;
    if (!pending || !fingerprintsMatch(pending.fingerprint, fp)) {
      return withSetCookie(
        renderLoginStep1({
          query,
          error: "Сессия входа истекла. Войдите заново.",
        }),
        clearPendingCookieHeader()
      );
    }

    const props: OtaskSessionProps = {
      otaskToken: pending.otaskToken,
      defaultWs: String(form.get("default_ws") || "").trim() || undefined,
      defaultProject: parseProjectValue(form.get("default_project")) || undefined,
      allowedWs: csv(form.getAll("allowed_ws").map(String)) || undefined,
      allowedProjects:
        csv(form.getAll("allowed_projects").map((v) => parseProjectValue(v) ?? "")) || undefined,
    };

    let redirectTo: string;
    try {
      const result = await provider.completeAuthorization({
        request: oauthReq,
        userId: pending.userId,
        metadata: {},
        scope: oauthReq.scope ?? [],
        props,
      });
      redirectTo = result.redirectTo;
    } catch {
      // Keep pending until TTL so the user can retry step2 without re-login.
      return renderLoginStep1({
        query,
        error: "Не удалось завершить авторизацию. Попробуйте снова.",
      });
    }

    if (id) {
      await deletePending(kv, id);
    }

    const redirect = Response.redirect(redirectTo, 302);
    return withSetCookie(redirect, clearPendingCookieHeader());
  },
};
