import { OAuthProvider } from "@cloudflare/workers-oauth-provider";
import { AuthHandler } from "./auth-handler.js";
import { apiHandler } from "./mcp-api.js";

export default new OAuthProvider({
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/oauth/token",
  clientRegistrationEndpoint: "/oauth/register",
  apiRoute: "/mcp",
  apiHandler,
  defaultHandler: AuthHandler,
});
