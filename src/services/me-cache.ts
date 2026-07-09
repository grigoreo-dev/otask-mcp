export interface CompactMe {
  id: number;
  full_name: string;
  email?: string;
  timezone: string;
  avatar?: string;
  isonline?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function compactMe(raw: unknown): CompactMe {
  const obj = asRecord(raw);
  if (!obj || typeof obj.id !== "number") {
    throw new Error("Invalid me payload: missing id");
  }
  const full_name =
    typeof obj.full_name === "string"
      ? obj.full_name
      : [obj.first_name, obj.last_name].filter((x) => typeof x === "string").join(" ") ||
        String(obj.id);
  const out: CompactMe = {
    id: obj.id,
    full_name,
    timezone: typeof obj.timezone === "string" && obj.timezone ? obj.timezone : "UTC",
  };
  if (typeof obj.email === "string") out.email = obj.email;
  if (typeof obj.avatar === "string") out.avatar = obj.avatar;
  if (typeof obj.isonline === "boolean") out.isonline = obj.isonline;
  return out;
}

export function createMeCache(
  fetchMe: () => Promise<unknown>,
  ttlMs = 5 * 60 * 1000,
): { get(): Promise<CompactMe>; clear(): void } {
  let cached: CompactMe | null = null;
  let expiresAt = 0;
  return {
    async get() {
      const now = Date.now();
      if (cached && now < expiresAt) return cached;
      cached = compactMe(await fetchMe());
      expiresAt = now + ttlMs;
      return cached;
    },
    clear() {
      cached = null;
      expiresAt = 0;
    },
  };
}
