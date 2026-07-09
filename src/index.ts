#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEnvAuthResolver, validateStdioAuthConfig } from "./services/auth.js";
import {
  assertDefaultsAllowed,
  scopeFromEnv,
} from "./services/scope.js";
import { createMcpServer } from "./server.js";

async function main(): Promise<void> {
  try {
    validateStdioAuthConfig();
    const scope = scopeFromEnv();
    assertDefaultsAllowed(scope);

    const server = createMcpServer(createEnvAuthResolver(), scope);
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
