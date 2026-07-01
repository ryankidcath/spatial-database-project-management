import type { ViewId } from "./workspace-views";

/** Tab yang cukup dengan shell (org, project, vtables, anggota). */
export function viewUsesShellOnly(view: ViewId): boolean {
  return view === "Chat" || view === "Aktivitas" || view === "Tabel";
}

export function viewNeedsDeferredPayload(view: ViewId): boolean {
  return !viewUsesShellOnly(view);
}
