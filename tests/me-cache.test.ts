import { describe, expect, mock, test } from "bun:test";
import { compactMe, createMeCache } from "../src/services/me-cache.ts";

describe("compactMe", () => {
  test("maps essential fields and defaults timezone", () => {
    expect(
      compactMe({
        id: 11458,
        full_name: "Григорий Лисовский",
        email: "a@b.c",
        timezone: "Europe/Moscow",
        avatar: "https://x",
        isonline: true,
        params: { hide: true },
      })
    ).toEqual({
      id: 11458,
      full_name: "Григорий Лисовский",
      email: "a@b.c",
      timezone: "Europe/Moscow",
      avatar: "https://x",
      isonline: true,
    });
    expect(compactMe({ id: 1, full_name: "X" }).timezone).toBe("UTC");
  });

  test("throws on missing id", () => {
    expect(() => compactMe({})).toThrow(/me/i);
  });
});

describe("createMeCache", () => {
  test("caches within TTL", async () => {
    const fetchMe = mock(async () => ({
      id: 1,
      full_name: "A",
      timezone: "UTC",
    }));
    const cache = createMeCache(fetchMe, 60_000);
    const a = await cache.get();
    const b = await cache.get();
    expect(a).toEqual(b);
    expect(fetchMe).toHaveBeenCalledTimes(1);
  });

  test("refetches after clear", async () => {
    const fetchMe = mock(async () => ({
      id: 1,
      full_name: "A",
      timezone: "UTC",
    }));
    const cache = createMeCache(fetchMe, 60_000);
    await cache.get();
    cache.clear();
    await cache.get();
    expect(fetchMe).toHaveBeenCalledTimes(2);
  });
});
