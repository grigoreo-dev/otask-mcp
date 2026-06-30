import { API_BASE_URL } from "../constants.js";
import type { LoginResponse } from "../types.js";
import { getPassthroughToken } from "./http-auth-context.js";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

export type HttpAuthMode = "gateway" | "passthrough";

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

/** Stdio MCP: O!task credentials must be in process env */
export function validateStdioAuthConfig(): void {
  if (hasServerOtaskCredentials()) {
    return;
  }
  throw new Error(
    "Authentication required: set OTASK_AUTH_KEY or OTASK_EMAIL + OTASK_PASSWORD in environment",
  );
}

/** HTTP MCP startup: gateway mode requires MCP_AUTH_TOKEN */
export function validateHttpAuthConfig(): void {
  if (hasServerOtaskCredentials() && !process.env.MCP_AUTH_TOKEN?.trim()) {
    throw new Error(
      "MCP_AUTH_TOKEN is required when OTASK_AUTH_KEY or OTASK_EMAIL + OTASK_PASSWORD are set (gateway mode)",
    );
  }
}

export function extractBearerToken(
  authorizationHeader: string | undefined,
): string | undefined {
  if (!authorizationHeader?.startsWith("Bearer ")) {
    return undefined;
  }
  const token = authorizationHeader.slice("Bearer ".length).trim();
  return token || undefined;
}

/**
 * Validates client Bearer for /mcp.
 * - gateway: Bearer must match MCP_AUTH_TOKEN; O!task calls use server env
 * - passthrough: Bearer is forwarded to O!task API
 */
export function authorizeHttpMcpRequest(clientBearer: string | undefined): {
  ok: true;
  passthroughToken?: string;
} | {
  ok: false;
  status: number;
  error: string;
  hint: string;
} {
  if (getHttpAuthMode() === "gateway") {
    const mcpToken = process.env.MCP_AUTH_TOKEN?.trim();
    if (!clientBearer || clientBearer !== mcpToken) {
      return {
        ok: false,
        status: 401,
        error: "Unauthorized",
        hint: "Gateway mode: send Authorization: Bearer <MCP_AUTH_TOKEN>",
      };
    }
    return { ok: true };
  }

  if (!clientBearer) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized",
      hint: "Passthrough mode: send Authorization: Bearer <O!task token>",
    };
  }

  return { ok: true, passthroughToken: clientBearer };
}

async function loginWithPassword(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
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
      typeof body.message === "string"
        ? body.message
        : JSON.stringify(body).slice(0, 500);
    throw new Error(`O!task login failed (${response.status}): ${detail}`);
  }

  const expiresInMinutes = body.expires_in ?? 1_000_000;
  cachedToken = {
    token: body.token,
    expiresAt: Date.now() + expiresInMinutes * 60 * 1000,
  };

  return body.token;
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
    throw new Error(
      "No server O!task credentials: set OTASK_AUTH_KEY or OTASK_EMAIL + OTASK_PASSWORD",
    );
  }

  return loginWithPassword(credentials.email, credentials.password);
}

export async function getAuthToken(): Promise<string> {
  const passthrough = getPassthroughToken();
  if (passthrough) {
    return passthrough;
  }

  return getServerAuthToken();
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}
