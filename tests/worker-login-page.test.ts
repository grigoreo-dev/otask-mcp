import { describe, expect, test } from "bun:test";
import { renderLoginPage } from "../packages/worker/src/login-page.ts";

describe("renderLoginPage", () => {
  test("renders RU login form with privacy text", async () => {
    const res = await renderLoginPage({ query: "client_id=abc&state=1" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('lang="ru"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).toContain('name="default_ws"');
    expect(html).toContain('name="default_project"');
    expect(html).toContain('name="allowed_ws"');
    expect(html).toContain('name="allowed_projects"');
    expect(html).toContain("не сохраня");
    expect(html).toContain("O!task MCP — open source remote connector");
    expect(html).toContain('action="/authorize?client_id=abc&amp;state=1"');
    expect(html).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(html).not.toContain("OTASK_PASSWORD");
    expect(html).not.toContain("password_value");
    expect(html).not.toContain("cdn.tailwindcss.com");
    expect(html).not.toMatch(/<script[\s>]/i);
  });

  test("shows error message when provided", async () => {
    const res = await renderLoginPage({
      query: "x=1",
      error: "Укажите email и пароль O!task",
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Укажите email и пароль O!task");
  });
});
