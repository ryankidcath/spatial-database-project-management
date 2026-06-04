/** Fase wizard scope di mobile (`< md`). Desktop memakai sidebar. */
export type MobileScopePhase = "org" | "project" | "workspace";

export const MOBILE_SCOPE_SESSION_KEY = "spatial-pm-mobile-scope-v1";

export type MobileScopeSession = {
  phase: MobileScopePhase;
  orgId: string | null;
  projectId: string | null;
};

export function readMobileScopeSession(): MobileScopeSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MOBILE_SCOPE_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MobileScopeSession;
    if (
      parsed?.phase !== "org" &&
      parsed?.phase !== "project" &&
      parsed?.phase !== "workspace"
    ) {
      return null;
    }
    return {
      phase: parsed.phase,
      orgId:
        typeof parsed.orgId === "string" && parsed.orgId ? parsed.orgId : null,
      projectId:
        typeof parsed.projectId === "string" && parsed.projectId
          ? parsed.projectId
          : null,
    };
  } catch {
    return null;
  }
}

export function writeMobileScopeSession(session: MobileScopeSession): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MOBILE_SCOPE_SESSION_KEY, JSON.stringify(session));
  } catch {
    /* quota / private mode */
  }
}

export function clearMobileScopeSession(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MOBILE_SCOPE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
