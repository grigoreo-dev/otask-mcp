import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGetTaskTool } from "./tools/get-task.js";
import { registerUpdateTaskTool } from "./tools/update-task.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "otask-mcp-server",
    version: "1.0.0",
  });

  registerGetTaskTool(server);
  registerUpdateTaskTool(server);

  return server;
}
