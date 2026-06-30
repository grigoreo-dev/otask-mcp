#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { validateAuthConfig } from "./services/auth.js";
import { registerGetTaskTool } from "./tools/get-task.js";
import { registerUpdateTaskTool } from "./tools/update-task.js";

const server = new McpServer({
  name: "otask-mcp-server",
  version: "1.0.0",
});

registerGetTaskTool(server);
registerUpdateTaskTool(server);

async function main(): Promise<void> {
  try {
    validateAuthConfig();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`ERROR: ${message}`);
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
