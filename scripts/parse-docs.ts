#!/usr/bin/env bun
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseOtaskDocsHtml } from "../packages/core/src/docs/parser.ts";

const args = process.argv.slice(2);
const fileIdx = args.indexOf("--file");
let html: string;
if (fileIdx >= 0) {
  html = readFileSync(args[fileIdx + 1]!, "utf8");
} else {
  const res = await fetch("https://api.otask.ru/docs");
  if (!res.ok) throw new Error(`Fetch docs failed: ${res.status}`);
  html = await res.text();
}

const catalog = parseOtaskDocsHtml(html);
const outDir = join(import.meta.dir, "..", "docs", "catalog");
mkdirSync(join(outDir, "scopes"), { recursive: true });
writeFileSync(
  join(outDir, "index.json"),
  JSON.stringify(
    {
      generatedAt: catalog.generatedAt,
      scopes: catalog.scopes.map((s) => ({
        id: s.id,
        title: s.title,
        endpointCount: s.endpoints.length,
        file: `scopes/${s.id}.json`,
      })),
    },
    null,
    2
  )
);
for (const scope of catalog.scopes) {
  writeFileSync(join(outDir, "scopes", `${scope.id}.json`), JSON.stringify(scope, null, 2));
}
console.error(
  `Wrote ${catalog.scopes.length} scopes, ${catalog.scopes.reduce((n, s) => n + s.endpoints.length, 0)} endpoints → docs/catalog`
);
