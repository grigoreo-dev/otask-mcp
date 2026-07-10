/**
 * Stable, non-PII user identifier for OAuth grants.
 *
 * The OAuth provider stores `userId` unencrypted in KV so grants can be listed
 * and replaced (revokeExistingGrants) on re-login. A plain hash of an email is
 * enumerable — emails are low-entropy, so anyone who guesses one can hash it and
 * match the stored id. We use HMAC-SHA256 with a secret pepper so the id cannot
 * be reproduced offline without the secret, while staying stable per email.
 *
 * The O!task Bearer token is unaffected — it lives in encrypted `props`.
 */
export async function hashUserId(email: string, pepper: string): Promise<string> {
  if (!pepper) {
    throw new Error("USER_ID_PEPPER is required to derive a non-enumerable userId");
  }
  const normalized = email.trim().toLowerCase();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(normalized));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
