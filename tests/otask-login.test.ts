import { describe, expect, test } from "bun:test";
import { loginOtaskWithPassword } from "../packages/core/src/services/auth.ts";

describe("loginOtaskWithPassword", () => {
  test("returns token from O!task login JSON", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ token: "abc", expires_in: 60 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    const result = await loginOtaskWithPassword("a@b.c", "pw", {
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(result.token).toBe("abc");
    expect(result.expiresInMinutes).toBe(60);
  });

  test("throws on non-ok without leaking password", async () => {
    const fetchImpl = async () =>
      new Response(JSON.stringify({ message: "bad creds" }), { status: 401 });
    let message = "";
    try {
      await loginOtaskWithPassword("a@b.c", "super-secret", {
        fetchImpl: fetchImpl as typeof fetch,
      });
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/login failed/);
    expect(message).not.toContain("super-secret");
  });
});
