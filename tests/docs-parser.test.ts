import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseOtaskDocsHtml } from "../packages/core/src/docs/parser.ts";

const html = readFileSync(join(import.meta.dir, "fixtures/docs-snippet.html"), "utf8");

describe("parseOtaskDocsHtml", () => {
  test("splits scopes from sidebar and attaches endpoints", () => {
    const catalog = parseOtaskDocsHtml(html);
    const tasks = catalog.scopes.find((s) => s.id === "zadaci");
    const team = catalog.scopes.find((s) => s.id === "komanda");
    expect(tasks?.title).toBe("Задачи");
    expect(tasks?.endpoints.some((e) => e.method === "GET" && e.path.includes("/tasks"))).toBe(
      true
    );
    expect(team?.endpoints.some((e) => e.path.includes("/members/list"))).toBe(true);
  });

  test("sets docsAnchor", () => {
    const catalog = parseOtaskDocsHtml(html);
    const ep = catalog.scopes
      .flatMap((s) => s.endpoints)
      .find((e) => e.id.includes("members-list"));
    expect(ep?.docsAnchor).toBe("#komanda-GETapi-v1-ws--ws_slug--members-list");
  });
});
