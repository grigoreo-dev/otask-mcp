import { describe, expect, test } from "bun:test";
import {
  parseProjectAllowList,
  createProjectGuard,
} from "../src/services/project-guard.ts";

describe("parseProjectAllowList", () => {
  test("empty when unset", () => {
    const list = parseProjectAllowList(undefined);
    expect(list.isEmpty).toBe(true);
  });

  test("parses slugs and numeric ids", () => {
    const list = parseProjectAllowList("abc-slug, 188, other");
    expect(list.slugs.has("abc-slug")).toBe(true);
    expect(list.slugs.has("other")).toBe(true);
    expect(list.ids.has(188)).toBe(true);
    expect(list.isEmpty).toBe(false);
  });
});

describe("ProjectGuard", () => {
  test("allows all when empty", () => {
    const g = createProjectGuard(parseProjectAllowList(""));
    expect(g.allows({ id: 1 })).toBe(true);
    expect(g.allows({ slug: "x" })).toBe(true);
  });

  test("matches slug or id", () => {
    const g = createProjectGuard(parseProjectAllowList("p1,42"));
    expect(g.allows({ slug: "p1" })).toBe(true);
    expect(g.allows({ id: 42 })).toBe(true);
    expect(g.allows({ slug: "nope" })).toBe(false);
    expect(g.allows({ id: 1 })).toBe(false);
  });

  test("assertAllowed throws", () => {
    const g = createProjectGuard(parseProjectAllowList("p1"));
    expect(() => g.assertAllowed({ slug: "p1" })).not.toThrow();
    expect(() => g.assertAllowed({ slug: "x" })).toThrow(/Project not allowed/);
  });

  test("filterProjects", () => {
    const g = createProjectGuard(parseProjectAllowList("a,2"));
    const out = g.filterProjects([
      { slug: "a", id: 1 },
      { slug: "b", id: 2 },
      { slug: "c", id: 3 },
    ]);
    expect(out).toEqual([
      { slug: "a", id: 1 },
      { slug: "b", id: 2 },
    ]);
  });
});
