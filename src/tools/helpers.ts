import { CHARACTER_LIMIT } from "../constants.js";
import { formatApiError } from "../services/api.js";

export function jsonToolResult(
  data: unknown,
  structuredContent?: Record<string, unknown>,
): {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
} {
  let text = JSON.stringify(data, null, 2);

  if (text.length > CHARACTER_LIMIT) {
    text = `${text.slice(0, CHARACTER_LIMIT)}\n… (truncated)`;
  }

  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

export function toolError(error: unknown): {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
} {
  return {
    content: [{ type: "text", text: formatApiError(error) }],
    isError: true,
  };
}
