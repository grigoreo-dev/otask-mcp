import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import { loginOtaskWithPassword } from "@grigoreo-dev/otask-mcp-core/services/auth.js";
import { iconResponse } from "./icon-asset.js";
import { renderLanding } from "./landing-page.js";
import { renderLoginPage } from "./login-page.js";
import type { OtaskSessionProps } from "./session-props.js";
import { hashUserId } from "./user-id.js";

export interface WorkerEnv {
  OAUTH_PROVIDER: OAuthHelpers;
  /** Secret pepper for HMAC of userId; set as a Worker secret. */
  USER_ID_PEPPER?: string;
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

    let oauthReq: Awaited<ReturnType<OAuthHelpers["parseAuthRequest"]>>;
    try {
      oauthReq = await provider.parseAuthRequest(request);
    } catch {
      return renderLoginPage({
        query,
        error: "Некорректный OAuth-запрос. Откройте подключение MCP снова из клиента.",
      });
    }

    if (request.method === "GET") {
      return renderLoginPage({ query });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return renderLoginPage({
        query,
        error: "Некорректные данные формы. Попробуйте войти снова.",
      });
    }
    const email = String(form.get("email") || "").trim();
    const defaultWs = String(form.get("default_ws") || "").trim() || undefined;
    const defaultProject = String(form.get("default_project") || "").trim() || undefined;
    const allowedWs = String(form.get("allowed_ws") || "").trim() || undefined;
    const allowedProjects = String(form.get("allowed_projects") || "").trim() || undefined;

    let token: string;
    {
      const password = String(form.get("password") || "");
      if (!email || !password) {
        return renderLoginPage({
          query,
          error: "Укажите email и пароль O!task",
        });
      }
      try {
        const result = await loginOtaskWithPassword(email, password);
        token = result.token;
      } catch {
        return renderLoginPage({
          query,
          error: "Не удалось войти в O!task. Проверьте email и пароль.",
        });
      }
    }

    const props: OtaskSessionProps = {
      otaskToken: token,
      defaultWs,
      defaultProject,
      allowedWs,
      allowedProjects,
    };

    // userId is stored unencrypted in KV; HMAC(email, pepper) keeps it stable but
    // non-enumerable without the secret. metadata is empty on purpose — no audit UI,
    // and props (encrypted) already carry the O!task Bearer token used to call the API.
    // Single full MCP access for this connector; grant requested scopes as-is (usually empty/MCP defaults).
    const { redirectTo } = await provider.completeAuthorization({
      request: oauthReq,
      userId: await hashUserId(email, pepper),
      metadata: {},
      scope: oauthReq.scope ?? [],
      props,
    });

    return Response.redirect(redirectTo, 302);
  },
};
