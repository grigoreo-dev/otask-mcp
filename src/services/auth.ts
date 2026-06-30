import { API_BASE_URL } from "../constants.js";
import type { LoginResponse } from "../types.js";

interface TokenCache {
  token: string;
  expiresAt: number;
}

let cachedToken: TokenCache | null = null;

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

export function validateAuthConfig(): void {
  if (getStaticAuthKey()) {
    return;
  }
  if (getEmailPassword()) {
    return;
  }
  throw new Error(
    "Authentication required: set OTASK_AUTH_KEY (Bearer token) or OTASK_EMAIL + OTASK_PASSWORD in environment",
  );
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

export async function getAuthToken(): Promise<string> {
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
      "No O!task credentials: set OTASK_AUTH_KEY or OTASK_EMAIL + OTASK_PASSWORD",
    );
  }

  return loginWithPassword(credentials.email, credentials.password);
}

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}
