import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { OtaskClient } from "../services/client.js";
import type { ProjectGuard } from "../services/project-guard.js";
import type { ScopeContext } from "../services/scope.js";

/** Shared dependencies injected into every tool factory. */
export interface ToolDeps {
  api: OtaskClient;
  guard: ProjectGuard;
  scope: ScopeContext;
}

export interface ToolConfig {
  title?: string;
  description?: string;
  inputSchema?: z.ZodTypeAny;
  annotations?: ToolAnnotations;
}

export interface ToolDefinition<TArgs = Record<string, unknown>> {
  name: string;
  config: ToolConfig;
  handler: (args: TArgs) => Promise<{
    content: Array<{ type: "text"; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }>;
}

export type ToolFactory = (deps: ToolDeps) => ToolDefinition;
