import type { SupabaseClient } from "@supabase/supabase-js";
import { findMapOverlapWarnings } from "./map-spatial-overlap";

type ProjectLite = { id: string; organization_id: string };

type OrgModule = {
  organization_id: string;
  module_code: string;
  is_enabled: boolean;
};

function orgHasPlmAndSpatial(
  orgId: string,
  organizationModules: OrgModule[]
): boolean {
  const plm = organizationModules.some(
    (m) =>
      m.organization_id === orgId &&
      m.module_code === "plm" &&
      m.is_enabled
  );
  const spatial = organizationModules.some(
    (m) =>
      m.organization_id === orgId &&
      m.module_code === "spatial" &&
      m.is_enabled
  );
  return plm && spatial;
}

/**
 * Sinkronkan peringatan overlap peta ke notifikasi belum dibaca (satu baris per project).
 * Menghapus notifikasi **unread** `spatial_overlap` lama per project, lalu menambah bila masih ada overlap.
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
  }
): Promise<void> {
  const kind = "spatial_overlap";

  for (const proj of params.projects) {
    if (!orgHasPlmAndSpatial(proj.organization_id, params.organizationModules)) {
      continue;
    }

    const demo = params.footprints
      .filter((f) => f.project_id === proj.id)
      .map((d) => ({ label: d.label, geojson: d.geojson }));
    const hasil = params.bidangHasilUkurMap
      .filter((b) => b.project_id === proj.id)
      .map((h) => ({ label: h.label, geojson: h.geojson }));

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

    const title = "Peringatan tumpang tindih peta";
    const body = `${warnings.length} pasangan geometri bersinggungan pada project ini (hasil ukur atau demo vs hasil). Buka tab Map untuk rincian.`;

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
