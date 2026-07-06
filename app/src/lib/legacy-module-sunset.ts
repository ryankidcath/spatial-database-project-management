import type { ViewId } from "@/app/workspace-views";

/** Modul legacy — tidak diaktifkan untuk organisasi baru (L0). */
export const LEGACY_MODULE_CODES = ["plm", "finance"] as const;

export type LegacyModuleCode = (typeof LEGACY_MODULE_CODES)[number];

/** Tab workspace yang bergantung modul legacy. */
export const LEGACY_WORKSPACE_VIEWS: ReadonlySet<ViewId> = new Set([
  "Berkas",
  "Laporan",
  "Keuangan",
  "Kanban",
  "Kalender",
  "Gantt",
]);

/** Modul default organisasi / ruang kerja baru (vtable-first). */
export const VTABLE_FIRST_DEFAULT_MODULE_CODES = ["core_pm", "spatial"] as const;

export function isLegacyModuleCode(code: string): code is LegacyModuleCode {
  return (LEGACY_MODULE_CODES as readonly string[]).includes(code);
}

export function isLegacyWorkspaceView(view: ViewId): boolean {
  return LEGACY_WORKSPACE_VIEWS.has(view);
}

export function organizationHasLegacyModulesEnabled(
  organizationId: string | null,
  rows: { organization_id: string; module_code: string; is_enabled: boolean }[]
): boolean {
  if (!organizationId) return false;
  return rows.some(
    (r) =>
      r.organization_id === organizationId &&
      r.is_enabled &&
      isLegacyModuleCode(r.module_code)
  );
}
