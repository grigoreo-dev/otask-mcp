export interface ProjectAllowList {
  slugs: Set<string>;
  ids: Set<number>;
  isEmpty: boolean;
}

export interface ProjectRef {
  slug?: string | null;
  id?: number | null;
}

export interface ProjectGuard {
  allows(ref: ProjectRef): boolean;
  assertAllowed(ref: ProjectRef): void;
  filterProjects<T extends ProjectRef>(items: T[]): T[];
  readonly list: ProjectAllowList;
}

export function parseProjectAllowList(
  raw: string | undefined | null,
): ProjectAllowList {
  const slugs = new Set<string>();
  const ids = new Set<number>();
  if (!raw?.trim()) {
    return { slugs, ids, isEmpty: true };
  }
  for (const part of raw.split(",")) {
    const token = part.trim();
    if (!token) continue;
    if (/^\d+$/.test(token)) {
      ids.add(Number(token));
    } else {
      slugs.add(token);
    }
  }
  return { slugs, ids, isEmpty: slugs.size === 0 && ids.size === 0 };
}

export function createProjectGuard(list: ProjectAllowList): ProjectGuard {
  return {
    list,
    allows(ref) {
      if (list.isEmpty) return true;
      if (ref.slug && list.slugs.has(ref.slug)) return true;
      if (ref.id != null && list.ids.has(ref.id)) return true;
      return false;
    },
    assertAllowed(ref) {
      if (!this.allows(ref)) {
        const label = ref.slug ?? ref.id ?? "unknown";
        throw new Error(`Project not allowed: ${label}`);
      }
    },
    filterProjects(items) {
      if (list.isEmpty) return items;
      return items.filter((item) => this.allows(item));
    },
  };
}

export function projectGuardFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ProjectGuard {
  return createProjectGuard(parseProjectAllowList(env.OTASK_ALLOWED_PROJECTS));
}

export function resolveHttpProjectGuard(opts: {
  authMode: "gateway" | "passthrough";
  env: NodeJS.ProcessEnv;
  headerRaw: string | undefined;
}): ProjectGuard {
  if (opts.authMode === "gateway") {
    return createProjectGuard(
      parseProjectAllowList(opts.env.OTASK_ALLOWED_PROJECTS),
    );
  }
  return createProjectGuard(parseProjectAllowList(opts.headerRaw));
}

export function projectGuardMode(
  authMode: "gateway" | "passthrough",
  guard: ProjectGuard,
): "env" | "header" | "off" {
  if (guard.list.isEmpty) return "off";
  return authMode === "gateway" ? "env" : "header";
}
