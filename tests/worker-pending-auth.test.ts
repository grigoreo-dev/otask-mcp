import { describe, expect, test } from "bun:test";
import {
  clearPendingCookieHeader,
  createPendingId,
  deletePending,
  fingerprintFromOAuthReq,
  fingerprintsMatch,
  getPending,
  PENDING_COOKIE,
  PENDING_TTL_SEC,
  type PendingAuth,
  pendingCookieHeader,
  pendingKvKey,
  putPending,
  signPendingCookie,
  verifyPendingCookie,
} from "../packages/worker/src/pending-auth.ts";

const pepper = "test-pepper-not-secret";

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

describe("pending cookie", () => {
  test("round-trips pendingId", async () => {
    const id = createPendingId();
    const cookieVal = await signPendingCookie(id, pepper);
    expect(cookieVal.includes(".")).toBe(true);
    expect(cookieVal).not.toContain("Bearer");
    const back = await verifyPendingCookie(`otask_mcp_pending=${cookieVal}`, pepper);
    expect(back).toBe(id);
  });

  test("rejects tampered cookie", async () => {
    const id = createPendingId();
    const cookieVal = await signPendingCookie(id, pepper);
    const bad = `${cookieVal.slice(0, -2)}ff`;
    expect(await verifyPendingCookie(`otask_mcp_pending=${bad}`, pepper)).toBeNull();
  });

  test("returns null for missing or malformed cookie", async () => {
    expect(await verifyPendingCookie("", pepper)).toBeNull();
    expect(await verifyPendingCookie("other=foo", pepper)).toBeNull();
    expect(await verifyPendingCookie("otask_mcp_pending=no-dot", pepper)).toBeNull();
  });
});

describe("pendingCookieHeader", () => {
  test("contains HttpOnly, Secure, SameSite=Lax, Path=/authorize", () => {
    const h = pendingCookieHeader("id.hmac");
    expect(h).toContain(`${PENDING_COOKIE}=id.hmac`);
    expect(h).toContain("HttpOnly");
    expect(h).toContain("Secure");
    expect(h).toContain("SameSite=Lax");
    expect(h).toContain("Path=/authorize");
    expect(h).toContain(`Max-Age=${PENDING_TTL_SEC}`);
  });

  test("clearPendingCookieHeader sets Max-Age=0", () => {
    const h = clearPendingCookieHeader();
    expect(h).toContain(`${PENDING_COOKIE}=`);
    expect(h).toContain("Max-Age=0");
    expect(h).toContain("HttpOnly");
    expect(h).toContain("Secure");
    expect(h).toContain("SameSite=Lax");
    expect(h).toContain("Path=/authorize");
  });
});

describe("pending KV", () => {
  test("pendingKvKey uses pending:v1: prefix", () => {
    expect(pendingKvKey("abc")).toBe("pending:v1:abc");
  });

  test("putPending → getPending round-trips PendingAuth", async () => {
    const kv = memKV();
    const id = createPendingId();
    const now = Math.floor(Date.now() / 1000);
    const value: PendingAuth = {
      otaskToken: "tok-secret",
      userId: "deadbeef".repeat(8),
      fingerprint: {
        clientId: "client-1",
        redirectUri: "https://app.example/cb",
        codeChallenge: "challenge",
      },
      exp: now + 300,
    };
    await putPending(kv, id, value);
    const got = await getPending(kv, id);
    expect(got).toEqual(value);
  });

  test("getPending returns null when exp is in the past", async () => {
    const kv = memKV();
    const id = createPendingId();
    const past: PendingAuth = {
      otaskToken: "tok",
      userId: "uid",
      fingerprint: {},
      exp: Math.floor(Date.now() / 1000) - 10,
    };
    await putPending(kv, id, past);
    expect(await getPending(kv, id)).toBeNull();
  });

  test("deletePending removes the entry", async () => {
    const kv = memKV();
    const id = createPendingId();
    const value: PendingAuth = {
      otaskToken: "tok",
      userId: "uid",
      fingerprint: {},
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    await putPending(kv, id, value);
    await deletePending(kv, id);
    expect(await getPending(kv, id)).toBeNull();
  });

  test("JSON stored in KV does NOT contain email", async () => {
    const kv = memKV();
    const id = createPendingId();
    const value: PendingAuth = {
      otaskToken: "tok",
      userId: "hmac-user-id-only",
      fingerprint: { clientId: "c" },
      exp: Math.floor(Date.now() / 1000) + 300,
    };
    await putPending(kv, id, value);
    const raw = kv._map.get(pendingKvKey(id));
    expect(raw).toBeTruthy();
    expect(raw).not.toContain("email");
    expect(JSON.parse(raw as string)).not.toHaveProperty("email");
  });
});

describe("fingerprint helpers", () => {
  test("fingerprintFromOAuthReq picks clientId/redirectUri/codeChallenge", () => {
    const fp = fingerprintFromOAuthReq({
      clientId: "c",
      redirectUri: "https://x",
      codeChallenge: "ch",
      extra: "ignored",
    });
    expect(fp).toEqual({
      clientId: "c",
      redirectUri: "https://x",
      codeChallenge: "ch",
    });
  });

  test("fingerprintsMatch compares the three fields", () => {
    const a = { clientId: "c", redirectUri: "r", codeChallenge: "ch" };
    expect(fingerprintsMatch(a, { ...a })).toBe(true);
    expect(fingerprintsMatch(a, { ...a, clientId: "other" })).toBe(false);
  });
});
