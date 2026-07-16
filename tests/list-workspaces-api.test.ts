import { describe, expect, test } from "bun:test";
import { listTeams } from "../packages/core/src/services/api.ts";
import { compactWorkspace } from "../packages/core/src/services/task-mapper.ts";

describe("listTeams", () => {
  test("maps teams envelope", async () => {
    const auth = async () => ({
      Authorization: "Bearer t",
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toContain("/api/v1/teams");
      return new Response(
        JSON.stringify({
          success: true,
          data: { teams: [{ id: 1, slug: "ws-a", name: "Alpha", huge: "x".repeat(100) }] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;
    try {
      const teams = await listTeams(auth);
      expect(teams).toHaveLength(1);
      expect(teams[0].slug).toBe("ws-a");
      const c = compactWorkspace(teams[0] as never);
      expect(c).toEqual({ id: 1, slug: "ws-a", name: "Alpha" });
      expect(JSON.stringify(c)).not.toContain("huge");
    } finally {
      globalThis.fetch = original;
    }
  });
});
