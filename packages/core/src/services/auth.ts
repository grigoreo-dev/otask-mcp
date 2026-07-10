import { API_BASE_URL } from "../constants.js";
import type { LoginResponse } from "../types.js";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

export type HttpAuthMode = "gateway" | "passthrough";

/** Resolves headers for O!task API calls (per MCP request in HTTP mode). */
export type OtaskAuthResolver = () => Promise<Record<string, string>>;

function getStaticAuthKey(): string | undefined {
  return process.env.OTASK_AUTH_KEY?.trim() || undefined;
}

function getEmailPassword(): { email: string; password: string } | undefined {
  const email = process.env.OTASK_EMAIL?.trim();
  const password = process.env.OTASK_PASSWORD?.trim();
  if (email && password) {
    return { email, password };
  }
  return undefined;
}

export function hasServerOtaskCredentials(): boolean {
  return Boolean(getStaticAuthKey() || getEmailPassword());
}

export function getHttpAuthMode(): HttpAuthMode {
  return hasServerOtaskCredentials() ? "gateway" : "passthrough";
}

export function validateStdioAuthConfig(): void {
  if (!hasServerOtaskCredentials()) {
    throw new Error("Set OTASK_AUTH_KEY or OTASK_EMAIL + OTASK_PASSWORD for stdio MCP");
  }
}

export function validateHttpAuthConfig(): void {
  if (hasServerOtaskCredentials() && !process.env.MCP_AUTH_TOKEN?.trim()) {
    throw new Error("MCP_AUTH_TOKEN is required when OTASK_* credentials are set in env");
  }
}

export function extractBearerToken(authorizationHeader: string | undefined): string | undefined {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return undefined;
  }
  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token || undefined;
}

export function extractProjectAllowListHeader(headers: {
  [k: string]: string | string[] | undefined;
}): string | undefined {
  const raw = headers["x-otask-allowed-projects"];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return undefined;
}

export function authorizeHttpMcpRequest(clientBearer: string | undefined):
  | {
      ok: true;
      otaskBearer?: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
      hint: string;
    } {
  if (hasServerOtaskCredentials()) {
    const mcpToken = process.env.MCP_AUTH_TOKEN?.trim();
    if (!clientBearer || clientBearer !== mcpToken) {
      return {
        ok: false,
        status: 401,
        error: "Unauthorized",
        hint: "Gateway: Authorization: Bearer <MCP_AUTH_TOKEN>",
      };
    }
    return { ok: true };
  }

  if (!clientBearer) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      hint: "Passthrough: Authorization: Bearer <O!task token>",
    };
  }

  return { ok: true, otaskBearer: clientBearer };
}

export function createPassthroughAuthResolver(otaskBearer: string): OtaskAuthResolver {
  return async () => ({
    Authorization: `Bearer ${otaskBearer}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  });
}

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

async function loginWithPassword(email: string, password: string): Promise<string> {
  const result = await loginOtaskWithPassword(email, password);
  cachedToken = {
    token: result.token,
    expiresAt: Date.now() + result.expiresInMinutes * 60 * 1000,
  };
  return result.token;
}

async function getServerAuthToken(): Promise<string> {
  const staticKey = getStaticAuthKey();
  if (staticKey) {
    return staticKey;
  }

  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const credentials = getEmailPassword();
  if (!credentials) {
    throw new Error("No OTASK_* credentials in env");
  }

  return loginWithPassword(credentials.email, credentials.password);
}

export function createEnvAuthResolver(): OtaskAuthResolver {
  return async () => {
    const token = await getServerAuthToken();
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  };
}
