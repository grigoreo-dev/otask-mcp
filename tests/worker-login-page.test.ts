import { describe, expect, test } from "bun:test";
import { renderLoginStep1, renderLoginStep2 } from "../packages/worker/src/login-page.ts";

describe("renderLoginStep1", () => {
  test("renders credentials-only form with disclaimer (no free-text slugs)", async () => {
    const res = await renderLoginStep1({ query: "client_id=abc&state=1" });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('lang="ru"');
    expect(html).toContain('name="email"');
    expect(html).toContain('name="password"');
    expect(html).not.toContain('name="default_ws"');
    expect(html).not.toContain('name="default_project"');
    expect(html).not.toContain('name="allowed_ws"');
    expect(html).not.toContain('name="allowed_projects"');
    expect(html.toLowerCase()).toMatch(/не.*аффил|unofficial|не.*официал/);
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
    const res = await renderLoginStep1({
      query: "x=1",
      error: "Укажите email и пароль O!task",
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Укажите email и пароль O!task");
  });
});

describe("renderLoginStep2", () => {
  test("renders scope selects with пространство labels and partial-failure warning", async () => {
    const res = await renderLoginStep2({
      query: "client_id=abc&state=1",
      teams: [
        { slug: "ws-a", name: "Alpha" },
        { slug: "ws-b", name: "Beta" },
      ],
      projectsByWs: [
        {
          ws: "ws-a",
          projects: [{ id: 1, slug: "p1", name: "Proj 1" }],
          error: null,
        },
        { ws: "ws-b", projects: [], error: "boom" },
      ],
      defaultTeamSlug: "ws-a",
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<select name="default_ws"');
    expect(html).toContain('name="allowed_ws"');
    expect(html).toContain('name="default_project"');
    expect(html).toContain('name="allowed_projects"');
    expect(html).toContain('name="step"');
    expect(html).toContain('value="2"');
    expect(html).toContain("Пространство");
    expect(html).toContain("Не выбрано");
    expect(html).toContain("Не выбрано = доступ ко всем пространствам/проектам аккаунта.");
    expect(html).toContain("Alpha");
    expect(html).toContain("ws-a");
    expect(html).toContain("ws-b");
    expect(html).toContain("ws-a::p1");
    expect(html).toContain("selected");
    // partial-failure UX: warning for ws-b
    expect(html).toMatch(/ws-b[\s\S]{0,200}(boom|не удалось|ошибк|warning|warn)/i);
    expect(html).toContain('action="/authorize?client_id=abc&amp;state=1"');
    expect(html).not.toMatch(/sk-[a-zA-Z0-9]{10,}/);
    expect(html).not.toContain("OTASK_PASSWORD");
    expect(html).not.toMatch(/<script[\s>]/i);
  });

  test("shows error message when provided", async () => {
    const res = await renderLoginStep2({
      query: "x=1",
      error: "Сессия входа истекла",
      teams: [],
      projectsByWs: [],
    });
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain("Сессия входа истекла");
  });
});
