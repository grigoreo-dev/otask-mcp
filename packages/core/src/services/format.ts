export function agentListResult(
  summary: string,
  items: unknown[],
  next?: unknown
): { summary: string; items: unknown[]; next: unknown } {
  return {
    summary,
    items,
    next: next === undefined ? null : next,
  };
}
