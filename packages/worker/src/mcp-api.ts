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
  // Canonical MCP resource is /mcp; path-suffixed metadata matches RFC 9728 discovery.
  const resourceMetadata = `${url.origin}/.well-known/oauth-protected-resource/mcp`;
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
    // Stateless request/response mode: a Worker forgets everything between
    // requests, so a stateful transport (default) can't keep an MCP session
    // alive across the separate initialize -> tools/call requests and the
    // tool call hangs waiting on an SSE stream. Omitting sessionIdGenerator
    // disables session management; enableJsonResponse returns plain JSON
    // instead of an SSE stream — ideal for these request/response tools.
    return createMcpHandler(server, {
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })(request, env, ctx);
  },
};
