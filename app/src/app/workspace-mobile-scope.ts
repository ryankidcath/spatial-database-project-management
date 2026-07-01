/** Fase wizard scope di mobile (`< md`). Desktop memakai sidebar. */
import {
  readDurableJsonValue,
  removeDurableJsonValue,
  writeDurableJsonValue,
} from "@/lib/client-durable-storage";

export type MobileScopePhase = "org" | "project" | "workspace";

export const MOBILE_SCOPE_SESSION_KEY = "spatial-pm-mobile-scope-v1";

export type MobileScopeSession = {
  phase: MobileScopePhase;
  orgId: string | null;
  projectId: string | null;
};

export function readMobileScopeSession(): MobileScopeSession | null {
  if (typeof window === "undefined") return null;
  const parsed = readDurableJsonValue<MobileScopeSession>(
    MOBILE_SCOPE_SESSION_KEY,
    { legacySessionKey: MOBILE_SCOPE_SESSION_KEY }
  );
  if (
    !parsed ||
    (parsed.phase !== "org" &&
      parsed.phase !== "project" &&
      parsed.phase !== "workspace")
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
}

export function writeMobileScopeSession(session: MobileScopeSession): void {
  if (typeof window === "undefined") return;
  writeDurableJsonValue(MOBILE_SCOPE_SESSION_KEY, session);
  try {
    sessionStorage.removeItem(MOBILE_SCOPE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function clearMobileScopeSession(): void {
  if (typeof window === "undefined") return;
  removeDurableJsonValue(MOBILE_SCOPE_SESSION_KEY, {
    legacySessionKey: MOBILE_SCOPE_SESSION_KEY,
  });
}
