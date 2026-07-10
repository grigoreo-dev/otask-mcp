import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OtaskAuthResolver } from "./services/auth.js";
import { createOtaskClient } from "./services/client.js";
import { createMeCache } from "./services/me-cache.js";
import { type ScopeContext, scopeFromEnv } from "./services/scope.js";
import { registerAllTools } from "./tools/register.js";

export function createMcpServer(
  auth: OtaskAuthResolver,
  scope: ScopeContext = scopeFromEnv({})
): McpServer {
  const server = new McpServer({
    name: "otask-mcp-server",
    version: "1.5.0",
  });

  const api = createOtaskClient(auth);
  registerAllTools(server, {
    api,
    guard: scope.projectGuard,
    scope,
    meCache: createMeCache(() => api.getMe()),
  });

  return server;
}
