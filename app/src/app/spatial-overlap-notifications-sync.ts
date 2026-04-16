import type { SupabaseClient } from "@supabase/supabase-js";
import { overlapDisplayLabelForIssueGeometryRow } from "./issue-geometry-overlap-label";
import { findMapOverlapWarnings } from "./map-spatial-overlap";

type ProjectLite = { id: string; organization_id: string };

type OrgModule = {
  organization_id: string;
  module_code: string;
  is_enabled: boolean;
};

function orgHasSpatial(
  orgId: string,
  organizationModules: OrgModule[]
): boolean {
  return organizationModules.some(
    (m) =>
      m.organization_id === orgId &&
      m.module_code === "spatial" &&
      m.is_enabled
  );
}

/**
 * Sinkronkan peringatan overlap peta ke notifikasi belum dibaca (satu baris per project).
 * Menghapus notifikasi **unread** `spatial_overlap` lama per project, lalu menambah bila masih ada overlap.
 * Hanya organisasi dengan modul **spatial** aktif; poligon «hasil» menggabungkan hasil ukur PLM dan geometri unit kerja.
 */
export async function syncSpatialOverlapNotifications(
  supabase: SupabaseClient,
  params: {
    userId: string;
    projects: ProjectLite[];
    organizationModules: OrgModule[];
    footprints: { project_id: string; label: string; geojson: unknown }[];
    bidangHasilUkurMap: {
      project_id: string;
      label: string;
      geojson: unknown;
    }[];
    issueGeometryMap: {
      project_id: string;
      label: string;
      feature_key?: string;
      properties?: unknown;
      geojson: unknown;
    }[];
  }
): Promise<void> {
  const kind = "spatial_overlap";

  for (const proj of params.projects) {
    if (!orgHasSpatial(proj.organization_id, params.organizationModules)) {
      continue;
    }

    const demo = params.footprints
      .filter((f) => f.project_id === proj.id)
      .map((d) => ({ label: d.label, geojson: d.geojson }));
    const hasil = [
      ...params.bidangHasilUkurMap
        .filter((b) => b.project_id === proj.id)
        .map((h) => ({ label: h.label, geojson: h.geojson })),
      ...params.issueGeometryMap
        .filter((g) => g.project_id === proj.id)
        .map((g) => ({
          label: overlapDisplayLabelForIssueGeometryRow(g),
          geojson: g.geojson,
        })),
    ];

    const warnings = findMapOverlapWarnings(demo, hasil);

    const { error: delErr } = await supabase
      .schema("core_pm")
      .from("user_notifications")
      .delete()
      .eq("user_id", params.userId)
      .eq("project_id", proj.id)
      .eq("kind", kind)
      .is("read_at", null);

    if (delErr) {
      console.error("[user_notifications] delete unread:", delErr.message);
    }

    if (warnings.length === 0) {
      continue;
    }

    const title = "Peringatan overlap area di peta";
    const body = `${warnings.length} pasangan poligon tumpang tindih (overlap area) pada project ini (hasil ukur, geometri unit kerja, atau demo vs poligon lain). Buka tab Map untuk rincian.`;

    const { error: insErr } = await supabase
      .schema("core_pm")
      .from("user_notifications")
      .insert({
        user_id: params.userId,
        organization_id: proj.organization_id,
        project_id: proj.id,
        kind,
        severity: "warning",
        title,
        body,
        payload: { items: warnings.slice(0, 80) },
      });

    if (insErr) {
      console.error("[user_notifications] insert:", insErr.message);
    }
  }
}
