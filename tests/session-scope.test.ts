import { describe, expect, test } from "bun:test";
import {
  createSessionAuthResolver,
  type OtaskSessionProps,
  scopeFromSession,
} from "../packages/core/src/services/session-scope.ts";

describe("scopeFromSession", () => {
  test("empty allow-lists mean guards off and optional defaults", () => {
    const scope = scopeFromSession({
      otaskToken: "t",
      defaultWs: " my-ws ",
      defaultProject: "42",
    });
    expect(scope.defaultWs).toBe("my-ws");
    expect(scope.defaultProject).toBe("42");
    expect(scope.wsGuard.list.isEmpty).toBe(true);
    expect(scope.projectGuard.list.isEmpty).toBe(true);
    expect(scope.wsGuard.allows("any")).toBe(true);
  });

  test("allow-lists restrict ws and projects", () => {
    const scope = scopeFromSession({
      otaskToken: "t",
      allowedWs: "a, b",
      allowedProjects: "p1, 7",
    });
    expect(scope.wsGuard.allows("a")).toBe(true);
    expect(scope.wsGuard.allows("c")).toBe(false);
    expect(() => scope.wsGuard.assertAllowed("c")).toThrow(/Workspace not allowed/);
    expect(scope.projectGuard.allows({ slug: "p1" })).toBe(true);
    expect(scope.projectGuard.allows({ id: 7 })).toBe(true);
    expect(scope.projectGuard.allows({ slug: "other" })).toBe(false);
  });
});

describe("createSessionAuthResolver", () => {
  test("returns Bearer for otaskToken", async () => {
    const props: OtaskSessionProps = { otaskToken: "secret-token" };
    const headers = await createSessionAuthResolver(props)();
    expect(headers.Authorization).toBe("Bearer secret-token");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
