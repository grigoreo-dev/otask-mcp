import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OtaskAuthResolver } from "./services/auth.js";
import { createOtaskClient } from "./services/client.js";
import { registerAllTools } from "./tools/register.js";

export function createMcpServer(auth: OtaskAuthResolver): McpServer {
  const server = new McpServer({
    name: "otask-mcp-server",
    version: "1.0.0",
  });

  registerAllTools(server, { api: createOtaskClient(auth) });

  return server;
}
