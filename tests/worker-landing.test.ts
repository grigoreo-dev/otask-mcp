import { describe, expect, test } from "bun:test";
import { iconResponse } from "../packages/worker/src/icon-asset.ts";
import { renderLanding } from "../packages/worker/src/landing-page.ts";

describe("landing", () => {
  test("renders with disclaimer and /mcp", async () => {
    const res = renderLanding({ origin: "https://otask-mcp.grigoreo.dev" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("/mcp");
    expect(html.toLowerCase()).toMatch(/unofficial|не.*официал|не аффилир/i);
    // Guard against leaked secrets; use a specific key pattern so the GitHub
    // URL "otask-mcp" (contains "sk-") is not a false positive.
    expect(html).not.toMatch(/OTASK_PASSWORD|password_value|sk-[a-zA-Z0-9]{10,}/);
    expect(html).not.toMatch(/<script[\s>]/i);
  });
});

describe("icon", () => {
  test("returns PNG bytes", async () => {
    const res = iconResponse();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf.byteLength).toBeGreaterThan(0);
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);
  });
});
