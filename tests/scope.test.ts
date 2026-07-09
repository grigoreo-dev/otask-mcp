import { describe, expect, test } from "bun:test";
import {
  parseWsAllowList,
  createWsGuard,
  resolveWsSlug,
  resolveProjectSlug,
  resolveProjectId,
  scopeFromEnv,
  resolveHttpScope,
  assertDefaultsAllowed,
  type ScopeContext,
} from "../src/services/scope.ts";
import {
  createProjectGuard,
  parseProjectAllowList,
} from "../src/services/project-guard.ts";

function scope(partial: Partial<ScopeContext> & { projectAllow?: string } = {}): ScopeContext {
  return {
    defaultWs: partial.defaultWs,
    defaultProject: partial.defaultProject,
    wsGuard: partial.wsGuard ?? createWsGuard(parseWsAllowList(undefined)),
    projectGuard:
      partial.projectGuard ??
      createProjectGuard(parseProjectAllowList(partial.projectAllow ?? "")),
  };
}

describe("parseWsAllowList", () => {
  test("empty when unset", () => {
    expect(parseWsAllowList(undefined).isEmpty).toBe(true);
  });

  test("parses comma-separated slugs", () => {
    const list = parseWsAllowList(" ws-a , ws-b ");
    expect(list.slugs.has("ws-a")).toBe(true);
    expect(list.slugs.has("ws-b")).toBe(true);
    expect(list.isEmpty).toBe(false);
  });
});

describe("WsGuard", () => {
  test("allows all when empty", () => {
    const g = createWsGuard(parseWsAllowList(""));
    expect(g.allows("any")).toBe(true);
  });

  test("restricts to listed slugs", () => {
    const g = createWsGuard(parseWsAllowList("allowed-ws"));
    expect(g.allows("allowed-ws")).toBe(true);
    expect(g.allows("other")).toBe(false);
    expect(() => g.assertAllowed("other")).toThrow(/Workspace not allowed/);
  });
});

describe("resolveWsSlug", () => {
  test("uses explicit arg over default", () => {
    const s = scope({ defaultWs: "default-ws" });
    expect(resolveWsSlug("explicit-ws", s)).toBe("explicit-ws");
  });

  test("falls back to default", () => {
    const s = scope({ defaultWs: "default-ws" });
    expect(resolveWsSlug(undefined, s)).toBe("default-ws");
    expect(resolveWsSlug("", s)).toBe("default-ws");
  });

  test("throws when neither arg nor default", () => {
    expect(() => resolveWsSlug(undefined, scope())).toThrow(/ws_slug is required/);
  });

  test("asserts workspace allow-list", () => {
    const s = scope({
      defaultWs: "blocked",
      wsGuard: createWsGuard(parseWsAllowList("only-this")),
    });
    expect(() => resolveWsSlug(undefined, s)).toThrow(/Workspace not allowed/);
    expect(resolveWsSlug("only-this", s)).toBe("only-this");
  });
});

describe("resolveProjectSlug", () => {
  test("uses arg then asserts allow-list", async () => {
    const s = scope({ projectAllow: "good" });
    await expect(
      resolveProjectSlug("good", s, async () => [{ id: 1, slug: "good" }]),
    ).resolves.toBe("good");
    await expect(
      resolveProjectSlug("bad", s, async () => [{ id: 2, slug: "bad" }]),
    ).rejects.toThrow(/Project not allowed/);
  });

  test("falls back to default slug", async () => {
    const s = scope({
      defaultProject: "def-slug",
      projectAllow: "def-slug",
    });
    await expect(
      resolveProjectSlug(undefined, s, async () => [
        { id: 9, slug: "def-slug" },
      ]),
    ).resolves.toBe("def-slug");
  });

  test("resolves default numeric id to slug", async () => {
    const s = scope({
      defaultProject: "42",
      projectAllow: "42",
    });
    await expect(
      resolveProjectSlug(undefined, s, async () => [
        { id: 42, slug: "from-id" },
      ]),
    ).resolves.toBe("from-id");
  });

  test("throws when no project", async () => {
    await expect(
      resolveProjectSlug(undefined, scope(), async () => []),
    ).rejects.toThrow(/project_slug is required/);
  });
});

describe("resolveProjectId", () => {
  test("uses explicit id", async () => {
    const s = scope({ projectAllow: "7" });
    await expect(
      resolveProjectId(7, s, async () => [{ id: 7, slug: "p" }]),
    ).resolves.toBe(7);
  });

  test("falls back to default id", async () => {
    const s = scope({ defaultProject: "99", projectAllow: "99" });
    await expect(
      resolveProjectId(undefined, s, async () => [{ id: 99, slug: "x" }]),
    ).resolves.toBe(99);
  });

  test("falls back to default slug resolved via listProjects", async () => {
    const s = scope({
      defaultProject: "my-proj",
      projectAllow: "my-proj",
    });
    await expect(
      resolveProjectId(undefined, s, async () => [
        { id: 55, slug: "my-proj" },
      ]),
    ).resolves.toBe(55);
  });
});

describe("scopeFromEnv / resolveHttpScope", () => {
  test("scopeFromEnv reads defaults and allow-lists", () => {
    const s = scopeFromEnv({
      OTASK_DEFAULT_WS: "ws-1",
      OTASK_DEFAULT_PROJECT: "proj-1",
      OTASK_ALLOWED_WS: "ws-1,ws-2",
      OTASK_ALLOWED_PROJECTS: "proj-1,3",
    });
    expect(s.defaultWs).toBe("ws-1");
    expect(s.defaultProject).toBe("proj-1");
    expect(s.wsGuard.allows("ws-1")).toBe(true);
    expect(s.wsGuard.allows("ws-x")).toBe(false);
    expect(s.projectGuard.allows({ slug: "proj-1" })).toBe(true);
  });

  test("gateway HTTP uses env for ws allow-list", () => {
    const s = resolveHttpScope({
      authMode: "gateway",
      env: {
        OTASK_DEFAULT_WS: "env-ws",
        OTASK_ALLOWED_WS: "env-ws",
        OTASK_ALLOWED_PROJECTS: "p1",
      },
      headers: {
        "x-otask-allowed-ws": "hdr-ws",
        "x-otask-allowed-projects": "hdr-p",
        "x-otask-default-ws": "hdr-default",
      },
    });
    expect(s.defaultWs).toBe("env-ws");
    expect(s.wsGuard.allows("env-ws")).toBe(true);
    expect(s.wsGuard.allows("hdr-ws")).toBe(false);
    expect(s.projectGuard.allows({ slug: "p1" })).toBe(true);
  });

  test("passthrough HTTP uses headers for allow-lists and default overrides", () => {
    const s = resolveHttpScope({
      authMode: "passthrough",
      env: {
        OTASK_DEFAULT_WS: "env-ws",
        OTASK_DEFAULT_PROJECT: "env-p",
        OTASK_ALLOWED_WS: "env-ws",
        OTASK_ALLOWED_PROJECTS: "env-p",
      },
      headers: {
        "x-otask-allowed-ws": "hdr-ws",
        "x-otask-allowed-projects": "hdr-p",
        "x-otask-default-ws": "hdr-ws",
        "x-otask-default-project": "hdr-p",
      },
    });
    expect(s.defaultWs).toBe("hdr-ws");
    expect(s.defaultProject).toBe("hdr-p");
    expect(s.wsGuard.allows("hdr-ws")).toBe(true);
    expect(s.wsGuard.allows("env-ws")).toBe(false);
    expect(s.projectGuard.allows({ slug: "hdr-p" })).toBe(true);
  });
});

describe("assertDefaultsAllowed", () => {
  test("ok when defaults inside allow-lists", () => {
    expect(() =>
      assertDefaultsAllowed(
        scope({
          defaultWs: "ws1",
          defaultProject: "p1",
          wsGuard: createWsGuard(parseWsAllowList("ws1")),
          projectGuard: createProjectGuard(parseProjectAllowList("p1")),
        }),
      ),
    ).not.toThrow();
  });

  test("throws when default ws outside allow-list", () => {
    expect(() =>
      assertDefaultsAllowed(
        scope({
          defaultWs: "bad",
          wsGuard: createWsGuard(parseWsAllowList("good")),
        }),
      ),
    ).toThrow(/OTASK_DEFAULT_WS/);
  });

  test("throws when default project outside allow-list", () => {
    expect(() =>
      assertDefaultsAllowed(
        scope({
          defaultProject: "bad",
          projectGuard: createProjectGuard(parseProjectAllowList("good")),
        }),
      ),
    ).toThrow(/OTASK_DEFAULT_PROJECT/);
  });
});
