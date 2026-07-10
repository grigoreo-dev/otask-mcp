import type { OtaskAuthResolver } from "./auth.js";
import { createPassthroughAuthResolver } from "./auth.js";
import { createProjectGuard, parseProjectAllowList } from "./project-guard.js";
import { createWsGuard, parseWsAllowList, type ScopeContext } from "./scope.js";

export interface OtaskSessionProps {
  otaskToken: string;
  defaultWs?: string;
  defaultProject?: string;
  allowedWs?: string;
  allowedProjects?: string;
}

function trimOrUndef(v: string | undefined | null): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

export function scopeFromSession(props: OtaskSessionProps): ScopeContext {
  return {
    defaultWs: trimOrUndef(props.defaultWs),
    defaultProject: trimOrUndef(props.defaultProject),
    wsGuard: createWsGuard(parseWsAllowList(props.allowedWs)),
    projectGuard: createProjectGuard(parseProjectAllowList(props.allowedProjects)),
  };
}

export function createSessionAuthResolver(props: OtaskSessionProps): OtaskAuthResolver {
  return createPassthroughAuthResolver(props.otaskToken);
}
