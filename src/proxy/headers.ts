const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

export function pickForwardRequestHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const forward: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP.has(lower) || lower === "host" || lower === "authorization") {
      continue;
    }
    if (typeof value === "string") {
      forward[key] = value;
    } else if (Array.isArray(value) && value[0]) {
      forward[key] = value[0];
    }
  }

  return forward;
}

export function pickForwardResponseHeaders(
  headers: Headers,
): Record<string, string | string[]> {
  const forward: Record<string, string | string[]> = {};

  headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) {
      return;
    }
    forward[key] = value;
  });

  return forward;
}
