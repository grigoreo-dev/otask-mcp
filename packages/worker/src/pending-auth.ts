/**
 * Pending OAuth login state in OAUTH_KV + HMAC-signed cookie (pendingId only).
 *
 * The O!task Bearer lives only in KV (≤ PENDING_TTL_SEC). The cookie never
 * carries the token — only a signed pendingId.
 *
 * NOTE: the OAuth request is NOT stored. Step2 re-parses it from the preserved
 * query (form action="/authorize?<same query>"). KV only proves login + binds
 * the client fingerprint.
 */

export const PENDING_COOKIE = "otask_mcp_pending";
export const PENDING_TTL_SEC = 300;

const KEY_PREFIX = "pending:v1:";
const HMAC_CONTEXT = "pending-v1:";

/** Minimal KV surface; Cloudflare KVNamespace is assignable. */
export interface PendingKV {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

export type PendingAuth = {
  otaskToken: string;
  /** HMAC(email, pepper) from step1 — NO email/PII in KV */
  userId: string;
  fingerprint: {
    clientId?: string;
    redirectUri?: string;
    codeChallenge?: string;
  };
  /** unix seconds */
  exp: number;
};

export function createPendingId(): string {
  return crypto.randomUUID();
}

export function pendingKvKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

async function hmacHex(message: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function signPendingCookie(pendingId: string, pepper: string): Promise<string> {
  const hexHmac = await hmacHex(`${HMAC_CONTEXT}${pendingId}`, pepper);
  return `${pendingId}.${hexHmac}`;
}

function extractCookieValue(cookieHeader: string, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (key === name) {
      return trimmed.slice(eq + 1);
    }
  }
  return null;
}

export async function verifyPendingCookie(
  cookieHeader: string,
  pepper: string
): Promise<string | null> {
  const raw = extractCookieValue(cookieHeader, PENDING_COOKIE);
  if (!raw) {
    return null;
  }
  const lastDot = raw.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === raw.length - 1) {
    return null;
  }
  const id = raw.slice(0, lastDot);
  const presented = raw.slice(lastDot + 1);
  if (!id || !presented) {
    return null;
  }
  const expected = await hmacHex(`${HMAC_CONTEXT}${id}`, pepper);
  if (!timingSafeEqual(presented, expected)) {
    return null;
  }
  return id;
}

export function pendingCookieHeader(value: string, maxAge = PENDING_TTL_SEC): string {
  return `${PENDING_COOKIE}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/authorize; Max-Age=${maxAge}`;
}

export function clearPendingCookieHeader(): string {
  return `${PENDING_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/authorize; Max-Age=0`;
}

export async function putPending(
  kv: PendingKV,
  pendingId: string,
  value: PendingAuth,
  ttlSec = PENDING_TTL_SEC
): Promise<void> {
  await kv.put(pendingKvKey(pendingId), JSON.stringify(value), { expirationTtl: ttlSec });
}

export async function getPending(kv: PendingKV, pendingId: string): Promise<PendingAuth | null> {
  const raw = await kv.get(pendingKvKey(pendingId));
  if (raw === null) {
    return null;
  }
  let value: PendingAuth;
  try {
    value = JSON.parse(raw) as PendingAuth;
  } catch {
    return null;
  }
  if (typeof value.exp !== "number" || value.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return value;
}

export async function deletePending(kv: PendingKV, pendingId: string): Promise<void> {
  await kv.delete(pendingKvKey(pendingId));
}

export function fingerprintFromOAuthReq(oauthReq: {
  clientId?: string;
  redirectUri?: string;
  codeChallenge?: string;
  [k: string]: unknown;
}): PendingAuth["fingerprint"] {
  return {
    clientId: oauthReq.clientId,
    redirectUri: oauthReq.redirectUri,
    codeChallenge: oauthReq.codeChallenge,
  };
}

export function fingerprintsMatch(
  a: PendingAuth["fingerprint"],
  b: PendingAuth["fingerprint"]
): boolean {
  return (
    a.clientId === b.clientId &&
    a.redirectUri === b.redirectUri &&
    a.codeChallenge === b.codeChallenge
  );
}
