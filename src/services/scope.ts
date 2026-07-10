import {
  assertProjectIdAllowed,
  assertProjectSlugAllowed,
  createProjectGuard,
  type ProjectGuard,
  parseProjectAllowList,
} from "./project-guard.js";

export interface WsAllowList {
  slugs: Set<string>;
  isEmpty: boolean;
}

export interface WsGuard {
  allows(slug: string): boolean;
  assertAllowed(slug: string): void;
  readonly list: WsAllowList;
}

export interface ScopeContext {
  defaultWs?: string;
  defaultProject?: string;
  wsGuard: WsGuard;
  projectGuard: ProjectGuard;
}

export function parseWsAllowList(raw: string | undefined | null): WsAllowList {
  const slugs = new Set<string>();
  if (!raw?.trim()) {
    return { slugs, isEmpty: true };
  }
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (token) slugs.add(token);
  }
  return { slugs, isEmpty: slugs.size === 0 };
}

export function createWsGuard(list: WsAllowList): WsGuard {
  return {
    list,
    allows(slug) {
      if (list.isEmpty) return true;
      return list.slugs.has(slug);
    },
    assertAllowed(slug) {
      if (!this.allows(slug)) {
        throw new Error(`Workspace not allowed: ${slug}`);
      }
    },
  };
}

function headerValue(
  headers: { [k: string]: string | string[] | undefined },
  name: string
): string | undefined {
  const raw = headers[name];
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  return undefined;
}

function trimOrUndef(v: string | undefined | null): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

export function resolveWsSlug(ws_slug: string | undefined, scope: ScopeContext): string {
  const ws = trimOrUndef(ws_slug) ?? scope.defaultWs;
  if (!ws) {
    throw new Error("ws_slug is required (pass arg or set OTASK_DEFAULT_WS / X-Otask-Default-Ws)");
  }
  scope.wsGuard.assertAllowed(ws);
  return ws;
}

export async function resolveProjectSlug(
  project_slug: string | undefined,
  scope: ScopeContext,
  listProjects: () => Promise<Array<{ id: number; slug: string }>>
): Promise<string> {
  const explicit = trimOrUndef(project_slug);
  if (explicit) {
    await assertProjectSlugAllowed(scope.projectGuard, listProjects, explicit);
    return explicit;
  }

  const def = scope.defaultProject;
  if (!def) {
    throw new Error(
      "project_slug is required (pass arg or set OTASK_DEFAULT_PROJECT / X-Otask-Default-Project)"
    );
  }

  if (/^\d+$/.test(def)) {
    const id = Number(def);
    const projects = await listProjects();
    const project = projects.find((p) => p.id === id);
    if (!project) {
      throw new Error(`Default project id not found: ${id}`);
    }
    scope.projectGuard.assertAllowed({
      id: project.id,
      slug: project.slug,
    });
    return project.slug;
  }

  await assertProjectSlugAllowed(scope.projectGuard, listProjects, def);
  return def;
}

export async function resolveProjectId(
  project_id: number | undefined,
  scope: ScopeContext,
  listProjects: () => Promise<Array<{ id: number; slug: string }>>
): Promise<number> {
  if (project_id != null) {
    await assertProjectIdAllowed(scope.projectGuard, listProjects, project_id);
    return project_id;
  }

  const def = scope.defaultProject;
  if (!def) {
    throw new Error(
      "project_id is required (pass arg or set OTASK_DEFAULT_PROJECT / X-Otask-Default-Project)"
    );
  }

  if (/^\d+$/.test(def)) {
    const id = Number(def);
    await assertProjectIdAllowed(scope.projectGuard, listProjects, id);
    return id;
  }

  const projects = await listProjects();
  const project = projects.find((p) => p.slug === def);
  if (!project) {
    throw new Error(`Default project slug not found: ${def}`);
  }
  scope.projectGuard.assertAllowed({ id: project.id, slug: project.slug });
  return project.id;
}

export function assertDefaultsAllowed(scope: ScopeContext): void {
  if (scope.defaultWs && !scope.wsGuard.list.isEmpty) {
    if (!scope.wsGuard.allows(scope.defaultWs)) {
      throw new Error(`OTASK_DEFAULT_WS "${scope.defaultWs}" is not in OTASK_ALLOWED_WS`);
    }
  }
  if (scope.defaultProject && !scope.projectGuard.list.isEmpty) {
    const def = scope.defaultProject;
    const asId = /^\d+$/.test(def) ? Number(def) : null;
    const allowed =
      scope.projectGuard.allows({ slug: def }) ||
      (asId != null && scope.projectGuard.allows({ id: asId }));
    if (!allowed) {
      throw new Error(`OTASK_DEFAULT_PROJECT "${def}" is not in OTASK_ALLOWED_PROJECTS`);
    }
  }
}

export function scopeFromEnv(env: NodeJS.ProcessEnv = process.env): ScopeContext {
  return {
    defaultWs: trimOrUndef(env.OTASK_DEFAULT_WS),
    defaultProject: trimOrUndef(env.OTASK_DEFAULT_PROJECT),
    wsGuard: createWsGuard(parseWsAllowList(env.OTASK_ALLOWED_WS)),
    projectGuard: createProjectGuard(parseProjectAllowList(env.OTASK_ALLOWED_PROJECTS)),
  };
}

export function resolveHttpScope(opts: {
  authMode: "gateway" | "passthrough";
  env: NodeJS.ProcessEnv;
  headers: { [k: string]: string | string[] | undefined };
}): ScopeContext {
  if (opts.authMode === "gateway") {
    return scopeFromEnv(opts.env);
  }

  const headerWsAllow = headerValue(opts.headers, "x-otask-allowed-ws");
  const headerProjectAllow = headerValue(opts.headers, "x-otask-allowed-projects");
  const headerDefaultWs = headerValue(opts.headers, "x-otask-default-ws");
  const headerDefaultProject = headerValue(opts.headers, "x-otask-default-project");

  return {
    defaultWs: trimOrUndef(headerDefaultWs) ?? trimOrUndef(opts.env.OTASK_DEFAULT_WS),
    defaultProject:
      trimOrUndef(headerDefaultProject) ?? trimOrUndef(opts.env.OTASK_DEFAULT_PROJECT),
    wsGuard: createWsGuard(parseWsAllowList(headerWsAllow)),
    projectGuard: createProjectGuard(parseProjectAllowList(headerProjectAllow)),
  };
}

export function scopeGuardModes(scope: ScopeContext): {
  wsGuard: "env" | "header" | "off";
  projectGuard: "env" | "header" | "off";
  defaults: { ws: boolean; project: boolean };
} {
  return {
    wsGuard: scope.wsGuard.list.isEmpty ? "off" : "env",
    projectGuard: scope.projectGuard.list.isEmpty ? "off" : "env",
    defaults: {
      ws: Boolean(scope.defaultWs),
      project: Boolean(scope.defaultProject),
    },
  };
}
