import { describe, expect, test } from "bun:test";
import { extractProjectAllowListHeader } from "../src/services/auth.ts";
import { projectGuardMode, resolveHttpProjectGuard } from "../src/services/project-guard.ts";

describe("extractProjectAllowListHeader", () => {
  test("reads x-otask-allowed-projects string", () => {
    expect(
      extractProjectAllowListHeader({
        "x-otask-allowed-projects": "p1,42",
      })
    ).toBe("p1,42");
  });

  test("returns undefined when missing", () => {
    expect(extractProjectAllowListHeader({})).toBeUndefined();
  });

  test("takes first value when array", () => {
    expect(
      extractProjectAllowListHeader({
        "x-otask-allowed-projects": ["a", "b"],
      })
    ).toBe("a");
  });
});

describe("resolveHttpProjectGuard", () => {
  test("gateway uses env and ignores header", () => {
    const guard = resolveHttpProjectGuard({
      authMode: "gateway",
      env: { OTASK_ALLOWED_PROJECTS: "from-env" },
      headerRaw: "from-header",
    });
    expect(guard.list.slugs.has("from-env")).toBe(true);
    expect(guard.list.slugs.has("from-header")).toBe(false);
  });

  test("passthrough uses header and ignores env", () => {
    const guard = resolveHttpProjectGuard({
      authMode: "passthrough",
      env: { OTASK_ALLOWED_PROJECTS: "from-env" },
      headerRaw: "from-header",
    });
    expect(guard.list.slugs.has("from-header")).toBe(true);
    expect(guard.list.slugs.has("from-env")).toBe(false);
  });

  test("empty source yields empty list", () => {
    const guard = resolveHttpProjectGuard({
      authMode: "gateway",
      env: {},
      headerRaw: "ignored",
    });
    expect(guard.list.isEmpty).toBe(true);
  });
});

describe("projectGuardMode", () => {
  test("off when empty", () => {
    const guard = resolveHttpProjectGuard({
      authMode: "gateway",
      env: {},
      headerRaw: undefined,
    });
    expect(projectGuardMode("gateway", guard)).toBe("off");
    expect(projectGuardMode("passthrough", guard)).toBe("off");
  });

  test("env for gateway with list", () => {
    const guard = resolveHttpProjectGuard({
      authMode: "gateway",
      env: { OTASK_ALLOWED_PROJECTS: "p1" },
      headerRaw: undefined,
    });
    expect(projectGuardMode("gateway", guard)).toBe("env");
  });

  test("header for passthrough with list", () => {
    const guard = resolveHttpProjectGuard({
      authMode: "passthrough",
      env: {},
      headerRaw: "p1",
    });
    expect(projectGuardMode("passthrough", guard)).toBe("header");
  });
});
