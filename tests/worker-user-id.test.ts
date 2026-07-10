import { describe, expect, test } from "bun:test";
import { hashUserId } from "../packages/worker/src/user-id.ts";

describe("hashUserId", () => {
  test("is stable and normalizes case/whitespace", async () => {
    const a = await hashUserId("User@Example.com");
    const b = await hashUserId("  user@example.com  ");
    expect(a).toBe(b);
  });

  test("returns 64-char lowercase hex sha256", async () => {
    const h = await hashUserId("user@example.com");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  test("does not contain the raw email", async () => {
    const h = await hashUserId("secret.person@example.com");
    expect(h).not.toContain("secret.person");
    expect(h).not.toContain("example.com");
  });

  test("different emails produce different ids", async () => {
    const a = await hashUserId("a@example.com");
    const b = await hashUserId("b@example.com");
    expect(a).not.toBe(b);
  });
});
