import { describe, expect, test } from "bun:test";
import {
  parseProjectAllowList,
  createProjectGuard,
  assertProjectIdAllowed,
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

describe("assertProjectIdAllowed", () => {
  test("uses knownSlug without listProjects", async () => {
    const g = createProjectGuard(parseProjectAllowList("allowed-proj"));
    let listed = false;
    await assertProjectIdAllowed(
      g,
      async () => {
        listed = true;
        return [];
      },
      42,
      "allowed-proj",
    );
    expect(listed).toBe(false);
  });

  test("resolves slug via listProjects for slug-only allow-list", async () => {
    const g = createProjectGuard(parseProjectAllowList("allowed-proj"));
    await assertProjectIdAllowed(
      g,
      async () => [{ id: 42, slug: "allowed-proj" }],
      42,
    );
  });

  test("denies when resolved slug not on allow-list", async () => {
    const g = createProjectGuard(parseProjectAllowList("allowed-proj"));
    await expect(
      assertProjectIdAllowed(
        g,
        async () => [{ id: 99, slug: "other" }],
        99,
      ),
    ).rejects.toThrow(/Project not allowed/);
  });
});
