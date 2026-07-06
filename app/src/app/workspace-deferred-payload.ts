import type { ViewId } from "./workspace-views";

/** Tab yang cukup dengan shell (org, project, vtables, anggota) — tanpa deferred gemuk. */
export function viewUsesShellOnly(view: ViewId): boolean {
  return (
    view === "Chat" ||
    view === "Aktivitas" ||
    view === "Tabel" ||
    view === "Dashboard"
  );
}

export function viewNeedsDeferredPayload(view: ViewId): boolean {
  return !viewUsesShellOnly(view);
}
