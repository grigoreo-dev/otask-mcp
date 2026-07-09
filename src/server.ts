import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OtaskAuthResolver } from "./services/auth.js";
import { createOtaskClient } from "./services/client.js";
import {
  createProjectGuard,
  parseProjectAllowList,
  type ProjectGuard,
} from "./services/project-guard.js";
import { registerAllTools } from "./tools/register.js";

export function createMcpServer(
  auth: OtaskAuthResolver,
  guard: ProjectGuard = createProjectGuard(parseProjectAllowList(undefined)),
): McpServer {
  const server = new McpServer({
    name: "otask-mcp-server",
    version: "1.2.0",
  });

  registerAllTools(server, { api: createOtaskClient(auth), guard });

  return server;
}
