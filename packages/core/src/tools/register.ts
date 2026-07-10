import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolFactories } from "./registry.js";
import type { ToolDeps } from "./types.js";

export function registerAllTools(server: McpServer, deps: ToolDeps): void {
  for (const createTool of toolFactories) {
    const { name, config, handler } = createTool(deps);
    server.registerTool(name, config, handler);
  }
}
