import type { DocsCatalog, EndpointRecord, HttpMethod, ScopeCatalog } from "./types.ts";

const METHODS = new Set<HttpMethod>(["GET", "POST", "PUT", "PATCH", "DELETE"]);

interface SidebarScope {
  id: string;
  title: string;
  endpointIds: string[];
  endpointTitles: Map<string, string>;
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSidebar(html: string): SidebarScope[] {
  const scopes: SidebarScope[] = [];
  const parts = html.split(/(?=<li[^>]*class="[^"]*sidebar__menu-item[^"]*")/i);

  for (const part of parts) {
    if (!/sidebar__menu-item/i.test(part)) continue;

    const scopeMatch = part.match(
      /href=["']#([^"']+)["'][^>]*class=["'][^"']*sidebar__menu-link[^"']*["'][^>]*>[\s\S]*?<span[^>]*class=["'][^"']*sidebar__menu-link-name[^"']*["'][^>]*>([\s\S]*?)<\/span>/i
    );
    if (!scopeMatch) continue;

    const id = scopeMatch[1]!;
    const title = stripTags(scopeMatch[2]!);
    const endpointIds: string[] = [];
    const endpointTitles = new Map<string, string>();

    const subRe =
      /href=["']#([^"']+)["'][^>]*class=["'][^"']*sidebar__submenu-link[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi;
    let sm: RegExpExecArray | null = subRe.exec(part);
    while (sm !== null) {
      const epId = sm[1]!;
      if (epId === id) {
        sm = subRe.exec(part);
        continue;
      }
      endpointIds.push(epId);
      endpointTitles.set(epId, stripTags(sm[2]!));
      sm = subRe.exec(part);
    }

    scopes.push({ id, title, endpointIds, endpointTitles });
  }

  return scopes;
}

function findIdIndex(html: string, id: string): number {
  const patterns = [`id="${id}"`, `id='${id}'`];
  let best = -1;
  for (const p of patterns) {
    const idx = html.indexOf(p);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx;
  }
  return best;
}

function sliceForEndpoint(html: string, endpointId: string, allEndpointIds: string[]): string {
  const start = findIdIndex(html, endpointId);
  if (start === -1) return "";

  let end = html.length;
  for (const otherId of allEndpointIds) {
    if (otherId === endpointId) continue;
    const idx = findIdIndex(html, otherId);
    if (idx > start && idx < end) end = idx;
  }
  return html.slice(start, end);
}

function parseEndpointSlice(
  slice: string,
  id: string,
  sidebarTitle?: string
): EndpointRecord | null {
  if (!slice) return null;

  const text = stripTags(slice);
  const methodMatch = text.match(/\b(GET|POST|PUT|PATCH|DELETE)\b/);
  const method = (methodMatch?.[1] as HttpMethod | undefined) ?? "GET";
  if (!METHODS.has(method)) return null;

  const pathMatch = text.match(/\/api\/v1\/[^\s<"]+/);
  const path = pathMatch?.[0]?.replace(/[.,;)]+$/, "") ?? "";

  const authRequired =
    /Требуется аутентификация/i.test(text) || /required authentication/i.test(text);

  let title = sidebarTitle ?? "";
  if (!title) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hMatch = slice.match(
      new RegExp(`id=["']${escaped}["'][^>]*>([\\s\\S]*?)<\\/h[1-6]>`, "i")
    );
    if (hMatch) title = stripTags(hMatch[1]!);
  }

  const pathParams: EndpointRecord["pathParams"] = [];
  for (const m of path.matchAll(/\{([^}]+)\}/g)) {
    pathParams.push({ name: m[1]!, required: true });
  }

  return {
    id,
    title,
    method,
    path,
    authRequired,
    pathParams,
    queryParams: [],
    bodyParams: [],
    docsAnchor: `#${id}`,
  };
}

export function parseOtaskDocsHtml(html: string): DocsCatalog {
  const sidebarScopes = parseSidebar(html);
  const allEndpointIds = sidebarScopes.flatMap((s) => s.endpointIds);

  const scopes: ScopeCatalog[] = sidebarScopes.map((s) => {
    const endpoints: EndpointRecord[] = [];
    for (const epId of s.endpointIds) {
      const slice = sliceForEndpoint(html, epId, allEndpointIds);
      const record = parseEndpointSlice(slice, epId, s.endpointTitles.get(epId));
      if (record) endpoints.push(record);
    }
    return {
      id: s.id,
      title: s.title,
      endpoints,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    scopes,
  };
}
