/**
 * Stable, non-PII user identifier for OAuth grants.
 *
 * The OAuth provider stores `userId` unencrypted in KV so grants can be listed
 * and replaced (revokeExistingGrants) on re-login. We hash the email so the same
 * user maps to the same grant without leaking the email in plaintext storage.
 * The O!task Bearer token stays in encrypted `props` — this does not affect it.
 */
export async function hashUserId(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
