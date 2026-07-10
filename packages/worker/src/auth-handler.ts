import { loginOtaskWithPassword } from "@grigoreo-dev/otask-mcp-core/services/auth.js";
import { renderLoginPage } from "./login-page.js";
import type { OtaskSessionProps } from "./session-props.js";

export interface WorkerEnv {
  OAUTH_PROVIDER: {
    parseAuthRequest(request: Request): Promise<{
      scope: string[];
      [key: string]: unknown;
    }>;
    completeAuthorization(options: {
      request: unknown;
      userId: string;
      metadata: unknown;
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
    const query = url.searchParams.toString();

    if (request.method === "GET") {
      return renderLoginPage({ query });
    }
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const form = await request.formData();
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

    const { redirectTo } = await provider.completeAuthorization({
      request: oauthReq,
      userId: email.toLowerCase(),
      metadata: { email: email.toLowerCase() },
      scope: oauthReq.scope ?? [],
      props,
    });

    return Response.redirect(redirectTo, 302);
  },
};
