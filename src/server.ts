import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OtaskAuthResolver } from "./services/auth.js";
import { createOtaskClient } from "./services/client.js";
import {
  scopeFromEnv,
  type ScopeContext,
} from "./services/scope.js";
import { registerAllTools } from "./tools/register.js";

export function createMcpServer(
  auth: OtaskAuthResolver,
  scope: ScopeContext = scopeFromEnv({}),
): McpServer {
  const server = new McpServer({
    name: "otask-mcp-server",
    version: "1.3.0",
  });

  registerAllTools(server, {
    api: createOtaskClient(auth),
    guard: scope.projectGuard,
    scope,
  });

  return server;
}
