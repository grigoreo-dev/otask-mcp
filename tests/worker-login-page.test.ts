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
    expect(html).not.toContain('name="step"');
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
  });

  test("marks project options with data-ws for space→project filtering", async () => {
    const res = await renderLoginStep2({
      query: "client_id=abc&state=1",
      teams: [
        { slug: "ws-a", name: "Alpha" },
        { slug: "ws-b", name: "Beta" },
      ],
      projectsByWs: [
        {
          ws: "ws-a",
          projects: [
            { id: 1, slug: "p1", name: "Proj 1" },
            { id: 2, slug: "p2", name: "Proj 2" },
          ],
          error: null,
        },
        {
          ws: "ws-b",
          projects: [{ id: 3, slug: "p3", name: "Proj 3" }],
          error: null,
        },
      ],
      defaultTeamSlug: "ws-a",
    });
    const html = await res.text();

    // default_project options carry data-ws
    expect(html).toMatch(/name="default_project"[\s\S]*?data-ws="ws-a"[\s\S]*?ws-a::p1/);
    expect(html).toMatch(/data-ws="ws-a"[^>]*>Proj 2|data-ws="ws-a"[^>]*value="ws-a::p2"/);
    expect(html).toMatch(/data-ws="ws-b"[^>]*value="ws-b::p3"|value="ws-b::p3"[^>]*data-ws="ws-b"/);

    // allowed_projects options carry data-ws
    expect(html).toMatch(/name="allowed_projects"[\s\S]*?data-ws="ws-a"/);
    expect(html).toMatch(/name="allowed_projects"[\s\S]*?data-ws="ws-b"/);

    // empty default option stays without data-ws requirement (value="")
    expect(html).toContain('value="">— не выбран —</option>');
  });

  test("includes inline filter script for default_ws and allowed_ws (step2 only)", async () => {
    const res = await renderLoginStep2({
      query: "x=1",
      teams: [{ slug: "ws-a", name: "Alpha" }],
      projectsByWs: [
        { ws: "ws-a", projects: [{ id: 1, slug: "p1", name: "P1" }], error: null },
      ],
    });
    const html = await res.text();
    expect(html).toMatch(/<script[\s>]/i);
    // script wires both space selects
    expect(html).toMatch(/default_ws/);
    expect(html).toMatch(/allowed_ws/);
    expect(html).toMatch(/default_project/);
    expect(html).toMatch(/allowed_projects/);
    expect(html).toMatch(/data-ws/);
    // runs on load
    expect(html).toMatch(/DOMContentLoaded|document\.readyState/);
    // no external CDN
    expect(html).not.toContain("cdn.");
    expect(html).not.toMatch(/src=["']https?:/);
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

describe("project option filter helpers", () => {
  test("default filter keeps empty option and matching ws only", async () => {
    const { projectVisibleForDefaultWs, projectVisibleForAllowedWs } = await import(
      "../packages/worker/src/login-page.ts"
    );
    expect(projectVisibleForDefaultWs("", "ws-a")).toBe(true);
    expect(projectVisibleForDefaultWs("ws-a", "ws-a")).toBe(true);
    expect(projectVisibleForDefaultWs("ws-b", "ws-a")).toBe(false);
  });

  test("allowed filter shows all when no spaces selected; otherwise intersects", async () => {
    const { projectVisibleForAllowedWs } = await import("../packages/worker/src/login-page.ts");
    expect(projectVisibleForAllowedWs("ws-a", [])).toBe(true);
    expect(projectVisibleForAllowedWs("ws-b", [])).toBe(true);
    expect(projectVisibleForAllowedWs("ws-a", ["ws-a"])).toBe(true);
    expect(projectVisibleForAllowedWs("ws-b", ["ws-a"])).toBe(false);
    expect(projectVisibleForAllowedWs("ws-b", ["ws-a", "ws-b"])).toBe(true);
  });
});
