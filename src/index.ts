#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createEnvAuthResolver, validateStdioAuthConfig } from "./services/auth.js";
import { createMcpServer } from "./server.js";

async function main(): Promise<void> {
  try {
    validateStdioAuthConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }

  const server = createMcpServer(createEnvAuthResolver());
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
