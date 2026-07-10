import { createMcpServer } from "@grigoreo-dev/otask-mcp-core/server.js";
import {
  createSessionAuthResolver,
  type OtaskSessionProps,
  scopeFromSession,
} from "@grigoreo-dev/otask-mcp-core/services/session-scope.js";
import { createMcpHandler } from "agents/mcp";

type ExecutionContextWithProps = ExecutionContext & {
  props?: OtaskSessionProps;
};

/**
 * OAuthProvider sets ctx.props before invoking apiHandler.
 * getMcpAuthContext() is only populated inside createMcpHandler's ALS
 * (tool execution), so we bind session auth/scope from ctx.props per request.
 */
function serverFromProps(props: OtaskSessionProps | undefined) {
  if (!props?.otaskToken) {
    return null;
  }
  return createMcpServer(createSessionAuthResolver(props), scopeFromSession(props));
}

function unauthorizedResponse(request: Request): Response {
  const url = new URL(request.url);
  const resourceMetadata = `${url.origin}/.well-known/oauth-protected-resource`;
  return Response.json(
    {
      error: "Unauthorized: missing O!task session. Reconnect the MCP server.",
    },
    {
      status: 401,
      headers: {
        "WWW-Authenticate": `Bearer error="invalid_token", error_description="missing session", resource_metadata="${resourceMetadata}"`,
      },
    }
  );
}

export const apiHandler = {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    const props = (ctx as ExecutionContextWithProps).props;
    const server = serverFromProps(props);
    if (!server) {
      return unauthorizedResponse(request);
    }
    return createMcpHandler(server)(request, env, ctx);
  },
};
