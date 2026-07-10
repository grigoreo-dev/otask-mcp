interface Env {
  OAUTH_KV: KVNamespace;
  COOKIE_ENCRYPTION_KEY?: string;
  /** Secret pepper for HMAC of the OAuth userId (keeps email non-enumerable in KV). */
  USER_ID_PEPPER: string;
}
