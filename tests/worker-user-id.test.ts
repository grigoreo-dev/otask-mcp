import { describe, expect, test } from "bun:test";
import { hashUserId } from "../packages/worker/src/user-id.ts";

const PEPPER = "test-pepper-secret";

describe("hashUserId", () => {
  test("is stable and normalizes case/whitespace", async () => {
    const a = await hashUserId("User@Example.com", PEPPER);
    const b = await hashUserId("  user@example.com  ", PEPPER);
    expect(a).toBe(b);
  });

  test("returns 64-char lowercase hex (HMAC-SHA256)", async () => {
    const h = await hashUserId("user@example.com", PEPPER);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  test("does not contain the raw email", async () => {
    const h = await hashUserId("secret.person@example.com", PEPPER);
    expect(h).not.toContain("secret.person");
    expect(h).not.toContain("example.com");
  });

  test("different emails produce different ids", async () => {
    const a = await hashUserId("a@example.com", PEPPER);
    const b = await hashUserId("b@example.com", PEPPER);
    expect(a).not.toBe(b);
  });

  test("different pepper yields different id for same email (not enumerable without secret)", async () => {
    const a = await hashUserId("user@example.com", PEPPER);
    const b = await hashUserId("user@example.com", "other-pepper");
    expect(a).not.toBe(b);
  });

  test("throws when pepper missing", async () => {
    await expect(hashUserId("user@example.com", "")).rejects.toThrow(/USER_ID_PEPPER/);
  });
});
