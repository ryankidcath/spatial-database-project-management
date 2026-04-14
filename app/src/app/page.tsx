import { Suspense } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { syncSpatialOverlapNotifications } from "./spatial-overlap-notifications-sync";
import {
  WorkspaceClient,
  type BidangHasilUkurMapRow,
  type DemoFootprintRow,
  type IssueRow,
  type OrganizationRow,
  type ProjectRow,
  type StatusRow,
} from "./workspace-client";
import type { BerkasPermohonanRow } from "./plm-berkas-types";
import type {
  LegalisasiGuFileRow,
  LegalisasiGuHistoryRow,
  LegalisasiGuRow,
} from "./plm-legalisasi-types";
import type {
  AlatUkurRow,
  PengukuranAlatRow,
  PengukuranDokumenRow,
  PengukuranLapanganRow,
  PengukuranSurveyorRow,
  PermohonanInfoSpasialRow,
} from "./plm-pengukuran-types";
import type {
  ModuleRegistryRow,
  OrganizationModuleRow,
} from "./workspace-modules";
import type { UserNotificationRow } from "./user-notification-types";
import type {
  PlmBerkasStatusSummaryRow,
  PlmLegalisasiTahapSummaryRow,
  PlmPengukuranStatusSummaryRow,
} from "./laporan-panel";

type HomeProps = {
  searchParams: Promise<{ joinError?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const qp = await searchParams;
  const joinError = qp.joinError
    ? decodeURIComponent(qp.joinError)
    : null;

  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-lg border border-amber-200 bg-white p-6 text-sm text-amber-900">
          <p className="font-semibold">Variabel lingkungan belum lengkap</p>
          <p className="mt-2">
            Set{" "}
            <code className="rounded bg-slate-100 px-1">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            dan{" "}
            <code className="rounded bg-slate-100 px-1">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            (lokal: salin dari <code className="rounded bg-slate-100 px-1">.env.example</code> ke{" "}
            <code className="rounded bg-slate-100 px-1">app/.env.local</code>).
          </p>
        </div>
      </div>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: projects, error: projectsError } = await supabase
    .schema("core_pm")
    .from("projects")
    .select("id, name, key, organization_id")
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("name");

  const projectList = (projects ?? []) as ProjectRow[];
  const orgIds = [
    ...new Set(projectList.map((p) => p.organization_id).filter(Boolean)),
  ];

  const { data: organizations, error: orgsError } =
    orgIds.length > 0
      ? await supabase
          .schema("core_pm")
          .from("organizations")
          .select("id, name, slug")
          .in("id", orgIds)
          .is("deleted_at", null)
          .order("name")
      : { data: [] as OrganizationRow[], error: null };

  const { data: statuses, error: statusesError } = await supabase
    .schema("core_pm")
    .from("statuses")
    .select("id, project_id, name, category, position")
    .order("project_id")
    .order("position", { ascending: true });

  const { data: issues, error: issuesError } = await supabase
    .schema("core_pm")
    .from("issues")
    .select(
      "id, project_id, parent_id, status_id, key_display, title, sort_order, starts_at, due_at"
    )
    .is("deleted_at", null)
    .order("sort_order");

  const projectIds = projectList.map((p) => p.id);
  const { data: footprintsRaw, error: footprintsError } =
    projectIds.length > 0
      ? await supabase
          .schema("spatial")
          .from("project_demo_footprints")
          .select("id, project_id, label, geojson")
          .in("project_id", projectIds)
      : { data: [] as DemoFootprintRow[], error: null };

  const footprints = (footprintsRaw ?? []) as DemoFootprintRow[];

  const { data: registryRaw, error: registryError } = await supabase
    .schema("core_pm")
    .from("module_registry")
    .select("module_code, display_name, sort_order, is_core")
    .order("sort_order");

  const { data: orgModulesRaw, error: orgModulesError } =
    orgIds.length > 0
      ? await supabase
          .schema("core_pm")
          .from("organization_modules")
          .select("organization_id, module_code, is_enabled")
          .in("organization_id", orgIds)
      : { data: [] as OrganizationModuleRow[], error: null };

  const moduleRegistry = (registryRaw ?? []) as ModuleRegistryRow[];
  const organizationModules = (orgModulesRaw ?? []) as OrganizationModuleRow[];

  const plmEnabledForAnyOrg = organizationModules.some(
    (m) =>
      m.is_enabled &&
      m.module_code === "plm" &&
      orgIds.includes(m.organization_id)
  );

  const { data: bidangMapRaw, error: bidangMapError } =
    projectIds.length > 0 && plmEnabledForAnyOrg
      ? await supabase
          .schema("spatial")
          .from("v_bidang_hasil_ukur_map")
          .select("id, project_id, berkas_id, label, geojson")
          .in("project_id", projectIds)
      : { data: [] as BidangHasilUkurMapRow[], error: null };

  const bidangHasilUkurMap = (bidangMapRaw ?? []) as BidangHasilUkurMapRow[];

  const { data: berkasRaw, error: berkasError } =
    projectIds.length > 0 && plmEnabledForAnyOrg
      ? await supabase
          .schema("plm")
          .from("berkas_permohonan")
          .select(
            `id, project_id, nomor_berkas, tanggal_berkas, status, catatan,
             berkas_pemilik ( urutan, pemilik_tanah ( id, nama_lengkap ) )`
          )
          .in("project_id", projectIds)
          .is("deleted_at", null)
          .order("tanggal_berkas", { ascending: false })
      : { data: [] as BerkasPermohonanRow[], error: null };

  const berkasPermohonan = (berkasRaw ?? []) as BerkasPermohonanRow[];

  const berkasIds = berkasPermohonan.map((b) => b.id);
  const { data: legalisasiRaw, error: legalisasiError } =
    berkasIds.length > 0 && plmEnabledForAnyOrg
      ? await supabase
          .schema("plm")
          .from("legalisasi_gu")
          .select(
            `id, berkas_id, status_tahap, kantor_pertanahan, nomor_berkas_legalisasi, tanggal_berkas_legalisasi,
             penggunaan_tanah, luas_hasil_ukur, tanggal_submit, tanggal_sps, nominal_sps, tanggal_bayar_sps,
             nomor_gu, tanggal_gu, nib_baru, tanggal_nib, nomor_pbt, tanggal_pbt,
             tanggal_tte_gu, tanggal_tte_pbt, tanggal_upload_gu, tanggal_upload_pbt,
             tanggal_persetujuan, tanggal_penyelesaian, catatan, created_at`
          )
          .in("berkas_id", berkasIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: [] as LegalisasiGuRow[], error: null };

  const legalisasiGu = (legalisasiRaw ?? []) as LegalisasiGuRow[];
  const legalisasiIds = legalisasiGu.map((r) => r.id);

  const { data: legalisasiFilesRaw, error: legalisasiFilesError } =
    legalisasiIds.length > 0
      ? await supabase
          .schema("plm")
          .from("legalisasi_gu_file")
          .select(
            "id, legalisasi_gu_id, tipe_file, file_name, mime_type, storage_key, uploaded_at, created_at"
          )
          .in("legalisasi_gu_id", legalisasiIds)
      : { data: [] as LegalisasiGuFileRow[], error: null };

  const legalisasiGuFiles = (legalisasiFilesRaw ?? []) as LegalisasiGuFileRow[];

  const { data: legalisasiHistRaw, error: legalisasiHistError } =
    legalisasiIds.length > 0
      ? await supabase
          .schema("plm")
          .from("legalisasi_gu_history")
          .select(
            "id, legalisasi_gu_id, actor_user_id, event_kind, payload, created_at"
          )
          .in("legalisasi_gu_id", legalisasiIds)
          .order("created_at", { ascending: false })
      : { data: [] as LegalisasiGuHistoryRow[], error: null };

  const legalisasiGuHistory = (legalisasiHistRaw ?? []) as LegalisasiGuHistoryRow[];

  const { data: pisRaw, error: pisError } =
    berkasIds.length > 0 && plmEnabledForAnyOrg
      ? await supabase
          .schema("plm")
          .from("permohonan_informasi_spasial")
          .select(
            "id, berkas_id, tanggal_permohonan, status_hasil, tanggal_download_hasil, catatan"
          )
          .in("berkas_id", berkasIds)
          .is("deleted_at", null)
      : { data: [] as PermohonanInfoSpasialRow[], error: null };

  const permohonanInfoSpasial = (pisRaw ?? []) as PermohonanInfoSpasialRow[];

  const { data: pengLapRaw, error: pengLapError } =
    berkasIds.length > 0 && plmEnabledForAnyOrg
      ? await supabase
          .schema("plm")
          .from("pengukuran_lapangan")
          .select(
            `id, berkas_id, permohonan_informasi_spasial_id, nomor_surat_tugas, tanggal_surat_tugas,
             nomor_surat_pemberitahuan, tanggal_surat_pemberitahuan, tanggal_janji_ukur, tanggal_realisasi_ukur,
             status, catatan, created_at`
          )
          .in("berkas_id", berkasIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: [] as PengukuranLapanganRow[], error: null };

  const pengukuranLapangan = (pengLapRaw ?? []) as PengukuranLapanganRow[];
  const pengIds = pengukuranLapangan.map((p) => p.id);

  const { data: pengSurvRaw, error: pengSurvError } =
    pengIds.length > 0
      ? await supabase
          .schema("plm")
          .from("pengukuran_surveyor")
          .select("id, pengukuran_id, surveyor_user_id, peran, created_at")
          .in("pengukuran_id", pengIds)
      : { data: [] as PengukuranSurveyorRow[], error: null };

  const pengukuranSurveyor = (pengSurvRaw ?? []) as PengukuranSurveyorRow[];

  const { data: pengAlatRaw, error: pengAlatError } =
    pengIds.length > 0
      ? await supabase
          .schema("plm")
          .from("pengukuran_alat")
          .select("id, pengukuran_id, alat_id, peran_alat, created_at")
          .in("pengukuran_id", pengIds)
      : { data: [] as PengukuranAlatRow[], error: null };

  const pengukuranAlat = (pengAlatRaw ?? []) as PengukuranAlatRow[];

  const { data: pengDokRaw, error: pengDokError } =
    pengIds.length > 0
      ? await supabase
          .schema("plm")
          .from("pengukuran_dokumen")
          .select(
            "id, pengukuran_id, tipe_dokumen, file_name, mime_type, storage_key, uploaded_at, created_at"
          )
          .in("pengukuran_id", pengIds)
      : { data: [] as PengukuranDokumenRow[], error: null };

  const pengukuranDokumen = (pengDokRaw ?? []) as PengukuranDokumenRow[];

  const { data: alatUkurRaw, error: alatUkurError } =
    orgIds.length > 0 && plmEnabledForAnyOrg
      ? await supabase
          .schema("plm")
          .from("alat_ukur")
          .select(
            "id, organization_id, kode_aset, jenis, merek_model, serial_number, is_active"
          )
          .in("organization_id", orgIds)
          .is("deleted_at", null)
          .order("kode_aset")
      : { data: [] as AlatUkurRow[], error: null };

  const alatUkur = (alatUkurRaw ?? []) as AlatUkurRow[];

  const { data: bSumRaw, error: bSumErr } =
    projectIds.length > 0 && plmEnabledForAnyOrg
      ? await supabase
          .schema("plm")
          .from("v_berkas_permohonan_summary_by_status")
          .select("project_id, status, jumlah, tanggal_berkas_terbaru")
          .in("project_id", projectIds)
          .order("project_id")
          .order("status")
      : { data: [] as PlmBerkasStatusSummaryRow[], error: null };

  const { data: lSumRaw, error: lSumErr } =
    projectIds.length > 0 && plmEnabledForAnyOrg
      ? await supabase
          .schema("plm")
          .from("v_legalisasi_gu_summary_by_tahap")
          .select("project_id, status_tahap, jumlah")
          .in("project_id", projectIds)
          .order("project_id")
          .order("status_tahap")
      : { data: [] as PlmLegalisasiTahapSummaryRow[], error: null };

  const { data: pSumRaw, error: pSumErr } =
    projectIds.length > 0 && plmEnabledForAnyOrg
      ? await supabase
          .schema("plm")
          .from("v_pengukuran_lapangan_summary_by_status")
          .select("project_id, status, jumlah")
          .in("project_id", projectIds)
          .order("project_id")
          .order("status")
      : { data: [] as PlmPengukuranStatusSummaryRow[], error: null };

  const plmBerkasStatusSummary = (bSumRaw ?? []) as PlmBerkasStatusSummaryRow[];
  const plmLegalisasiTahapSummary = (lSumRaw ?? []) as PlmLegalisasiTahapSummaryRow[];
  const plmPengukuranStatusSummary = (pSumRaw ?? []) as PlmPengukuranStatusSummaryRow[];

  if (user?.id && projectList.length > 0) {
    await syncSpatialOverlapNotifications(supabase, {
      userId: user.id,
      projects: projectList.map((p) => ({
        id: p.id,
        organization_id: p.organization_id,
      })),
      organizationModules,
      footprints,
      bidangHasilUkurMap,
    });
  }

  const { data: notifRaw, error: notifError } =
    user?.id != null
      ? await supabase
          .schema("core_pm")
          .from("user_notifications")
          .select(
            "id, user_id, organization_id, project_id, kind, severity, title, body, payload, read_at, created_at"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(80)
      : { data: [] as UserNotificationRow[], error: null };

  const userNotifications = (notifRaw ?? []) as UserNotificationRow[];

  const fetchError =
    projectsError?.message ??
    orgsError?.message ??
    statusesError?.message ??
    issuesError?.message ??
    footprintsError?.message ??
    bidangMapError?.message ??
    registryError?.message ??
    orgModulesError?.message ??
    berkasError?.message ??
    legalisasiError?.message ??
    legalisasiFilesError?.message ??
    legalisasiHistError?.message ??
    pisError?.message ??
    pengLapError?.message ??
    pengSurvError?.message ??
    pengAlatError?.message ??
    pengDokError?.message ??
    alatUkurError?.message ??
    notifError?.message ??
    bSumErr?.message ??
    lSumErr?.message ??
    pSumErr?.message ??
    null;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
          Memuat workspace…
        </div>
      }
    >
      <WorkspaceClient
        organizations={(organizations ?? []) as OrganizationRow[]}
        projects={projectList}
        statuses={(statuses ?? []) as StatusRow[]}
        issues={(issues ?? []) as IssueRow[]}
        footprints={footprints}
        bidangHasilUkurMap={bidangHasilUkurMap}
        moduleRegistry={moduleRegistry}
        organizationModules={organizationModules}
        berkasPermohonan={berkasPermohonan}
        legalisasiGu={legalisasiGu}
        legalisasiGuFiles={legalisasiGuFiles}
        legalisasiGuHistory={legalisasiGuHistory}
        permohonanInfoSpasial={permohonanInfoSpasial}
        pengukuranLapangan={pengukuranLapangan}
        pengukuranSurveyor={pengukuranSurveyor}
        pengukuranAlat={pengukuranAlat}
        pengukuranDokumen={pengukuranDokumen}
        alatUkur={alatUkur}
        plmBerkasStatusSummary={plmBerkasStatusSummary}
        plmLegalisasiTahapSummary={plmLegalisasiTahapSummary}
        plmPengukuranStatusSummary={plmPengukuranStatusSummary}
        fetchError={fetchError}
        userEmail={user?.email ?? null}
        userNotifications={userNotifications}
        joinError={joinError}
      />
    </Suspense>
  );
}
