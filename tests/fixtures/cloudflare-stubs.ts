import { fileURLToPath } from "node:url";
import { plugin } from "bun";

// The `agents` package imports Cloudflare Workers runtime built-ins
// (`cloudflare:email`, `cloudflare:workers`) at module load time. Those
// modules only exist inside workerd, so importing worker code under `bun test`
// fails to resolve them. Register virtual stub modules that provide the exact
// named exports the dependency graph imports, so the import graph loads.
// Nothing in these tests exercises the stubbed runtime classes.
//
// Names collected from `import { ... } from "cloudflare:{workers,email}"`
// across node_modules: DurableObject, EmailMessage, RpcTarget,
// WorkflowEntrypoint, env, exports.
const WORKERS_STUB = `
  export class DurableObject {}
  export class RpcTarget {}
  export class WorkflowEntrypoint {}
  export const env = {};
  export const exports = {};
`;

const EMAIL_STUB = `
  export class EmailMessage {}
`;

plugin({
  name: "cloudflare-builtins-stub",
  setup(build) {
    build.module("cloudflare:workers", () => ({ contents: WORKERS_STUB, loader: "js" }));
    build.module("cloudflare:email", () => ({ contents: EMAIL_STUB, loader: "js" }));
  },
});

// Worker source imports the core package by its published subpath specifiers
// (`@grigoreo-dev/otask-mcp-core/*.js`), which resolve to `dist/` — only present
// after a build. CI runs `bun test` without building, so redirect those
// specifiers to the TypeScript source in `packages/core/src`, matching how the
// rest of the test suite imports core directly.
const CORE_PKG = "@grigoreo-dev/otask-mcp-core";
const coreSrcDir = fileURLToPath(new URL("../../packages/core/src/", import.meta.url));

plugin({
  name: "otask-core-source-resolver",
  setup(build) {
    build.onResolve({ filter: /^@grigoreo-dev\/otask-mcp-core(\/.*)?$/ }, (args) => {
      const subpath = args.path === CORE_PKG ? "server" : args.path.slice(CORE_PKG.length + 1);
      const asTs = subpath.replace(/\.js$/, ".ts");
      return { path: `${coreSrcDir}${asTs}` };
    });
  },
});
