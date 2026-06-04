import { VIEWS, type ViewId } from "./workspace-views";

/**
 * Tab yang disembunyikan sementara dari navigasi (URL lama dialihkan ke Dashboard).
 * Kode Kanban/Kalender/Gantt tetap di repo untuk diaktifkan lagi nanti.
 */
export const HIDDEN_WORKSPACE_VIEWS: ReadonlySet<ViewId> = new Set([
  "Kanban",
  "Kalender",
  "Gantt",
]);

export function isWorkspaceViewHidden(view: ViewId): boolean {
  return HIDDEN_WORKSPACE_VIEWS.has(view);
}

export type ModuleRegistryRow = {
  module_code: string;
  display_name: string;
  sort_order: number;
  is_core: boolean;
};

export type OrganizationModuleRow = {
  organization_id: string;
  module_code: string;
  is_enabled: boolean;
};

/** Modul yang dianggap aktif untuk satu organisasi (core_pm selalu dianggap aktif). */
export function effectiveEnabledModuleCodes(
  organizationId: string | null,
  rows: OrganizationModuleRow[]
): Set<string> {
  const set = new Set<string>(["core_pm"]);
  if (!organizationId) return set;
  for (const r of rows) {
    if (r.organization_id === organizationId && r.is_enabled) {
      set.add(r.module_code);
    }
  }
  return set;
}

/** Kode modul tambahan yang wajib aktif agar tab view tampil; `null` = tidak ada syarat. */
export function viewRequiredModuleCode(view: ViewId): string | null {
  if (view === "Map") return "spatial";
  if (view === "Berkas" || view === "Laporan") return "plm";
  if (view === "Keuangan") return "finance";
  return null;
}

/** True jika tab view boleh dipakai untuk set modul yang aktif. */
export function isViewAllowedForModules(
  view: ViewId,
  enabled: Set<string>
): boolean {
  if (isWorkspaceViewHidden(view)) return false;
  const req = viewRequiredModuleCode(view);
  if (!req) return true;
  return enabled.has(req);
}

export function viewsForEnabledModules(enabled: Set<string>): ViewId[] {
  return VIEWS.filter((v) => isViewAllowedForModules(v, enabled));
}
