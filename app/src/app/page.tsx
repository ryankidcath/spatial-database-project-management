import { Suspense } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  WorkspaceClient,
  type BidangHasilUkurMapRow,
  type IssueGeometryFeatureMapRow,
  type DemoFootprintRow,
  type IssueRow,
  type OrganizationRow,
  type ProjectMemberRow,
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
import type {
  FinanceInvoiceItemRow,
  FinanceInvoiceRow,
  FinancePembayaranRow,
} from "./finance-types";

type HomeProps = {
  searchParams: Promise<{ joinError?: string; org?: string; project?: string; view?: string }>;
};

/** Halaman workspace mengikuti cookie sesi; jangan cache statis antar-user. */
export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: HomeProps) {
  const qp = await searchParams;
  const joinError = qp.joinError
    ? decodeURIComponent(qp.joinError)
    : null;
  const selectedOrgIdFromQuery = String(qp.org ?? "").trim();
  const selectedProjectIdFromQuery = String(qp.project ?? "").trim();
  const activeViewParam = String(qp.view ?? "").trim().toLowerCase();

  const supabase = await createServerSupabaseClient();

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-lg border border-amber-200 bg-white p-6 text-sm text-amber-900">
          <p className="font-semibold">Konfigurasi aplikasi belum siap</p>
          <p className="mt-2">
            Sistem belum bisa terhubung ke layanan data. Hubungi admin aplikasi
            untuk melengkapi pengaturan koneksi.
          </p>
        </div>
      </div>
    );
  }

  // Pastikan sesi/JWT ter-resolve dulu (refresh token), baru query RLS.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Jangan filter server by ?org=: anggota bisa tanpa project di org itu; RLS tetap membatasi baris.
  const { data: projects, error: projectsError } = await supabase
    .schema("core_pm")
    .from("projects")
    .select("id, name, key, organization_id")
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("name");

  const projectList = (projects ?? []) as ProjectRow[];
  const selectedOrgId = projectList.some((p) => p.organization_id === selectedOrgIdFromQuery)
    ? selectedOrgIdFromQuery
    : projectList[0]?.organization_id ?? null;
  const selectedProjectId = projectList.some((p) => p.id === selectedProjectIdFromQuery)
    ? selectedProjectIdFromQuery
    : null;
  const scopedProjectIds = selectedProjectId
    ? [selectedProjectId]
    : selectedOrgId
      ? projectList
          .filter((p) => p.organization_id === selectedOrgId)
          .map((p) => p.id)
      : projectList.map((p) => p.id);
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

  const [
    { data: statuses, error: statusesError },
    { data: issues, error: issuesError },
    { data: projectMembersRaw, error: projectMembersError },
    { data: footprintsRaw, error: footprintsError },
    { data: registryRaw, error: registryError },
    { data: orgModulesRaw, error: orgModulesError },
  ] = await Promise.all([
    scopedProjectIds.length > 0
      ? supabase
          .schema("core_pm")
          .from("statuses")
          .select("id, project_id, name, category, position")
          .in("project_id", scopedProjectIds)
          .order("project_id")
          .order("position", { ascending: true })
      : Promise.resolve({ data: [] as StatusRow[], error: null }),
    scopedProjectIds.length > 0
      ? supabase
          .schema("core_pm")
          .from("issues")
          .select(
            "id, project_id, parent_id, status_id, key_display, title, sort_order, starts_at, due_at, progress_target, progress_actual, issue_weight, last_note, last_note_at, last_note_by"
          )
          .in("project_id", scopedProjectIds)
          .is("deleted_at", null)
          .order("sort_order")
      : Promise.resolve({ data: [] as IssueRow[], error: null }),
    scopedProjectIds.length > 0
      ? supabase
          .schema("core_pm")
          .from("project_members")
          .select("project_id, user_id, role, joined_at")
          .in("project_id", scopedProjectIds)
      : Promise.resolve({ data: [] as ProjectMemberRow[], error: null }),
    scopedProjectIds.length > 0
      ? supabase
          .schema("spatial")
          .from("project_demo_footprints")
          .select("id, project_id, label, geojson")
          .in("project_id", scopedProjectIds)
      : Promise.resolve({ data: [] as DemoFootprintRow[], error: null }),
    supabase
      .schema("core_pm")
      .from("module_registry")
      .select("module_code, display_name, sort_order, is_core")
      .order("sort_order"),
    orgIds.length > 0
      ? supabase
          .schema("core_pm")
          .from("organization_modules")
          .select("organization_id, module_code, is_enabled")
          .in("organization_id", orgIds)
      : Promise.resolve({ data: [] as OrganizationModuleRow[], error: null }),
  ]);

  const footprints = (footprintsRaw ?? []) as DemoFootprintRow[];
  const projectMembersBase = (projectMembersRaw ?? []) as Array<{
    project_id: string;
    user_id: string;
    role: string;
    joined_at: string;
  }>;
  const memberUserIds = [...new Set(projectMembersBase.map((m) => m.user_id))];
  const { data: profilesRaw, error: profilesError } =
    memberUserIds.length > 0
      ? await supabase
          .schema("core_pm")
          .from("profiles")
          .select("id, display_name")
          .in("id", memberUserIds)
      : { data: [] as Array<{ id: string; display_name: string | null }>, error: null };
  const displayNameByUserId = new Map(
    ((profilesRaw ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [
      p.id,
      p.display_name,
    ])
  );
  const projectMembers: ProjectMemberRow[] = projectMembersBase.map((m) => ({
    project_id: m.project_id,
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    display_name: displayNameByUserId.get(m.user_id) ?? null,
  }));

  const moduleRegistry = (registryRaw ?? []) as ModuleRegistryRow[];
  const organizationModules = (orgModulesRaw ?? []) as OrganizationModuleRow[];

  const plmEnabledForSelectedOrg = organizationModules.some(
    (m) =>
      m.is_enabled &&
      m.module_code === "plm" &&
      m.organization_id === selectedOrgId
  );

  /** Modul spatial untuk salah satu org yang punya project di scope (aman jika `org` URL tidak pas). */
  const orgIdsForScopedProjects = new Set(
    projectList
      .filter((p) => scopedProjectIds.includes(p.id))
      .map((p) => p.organization_id)
      .filter(Boolean)
  );
  const spatialEnabledForScopedProjects =
    orgIdsForScopedProjects.size > 0 &&
    organizationModules.some(
      (m) =>
        m.is_enabled &&
        m.module_code === "spatial" &&
        m.organization_id != null &&
        orgIdsForScopedProjects.has(m.organization_id)
    );
  const needsPlmData = ["berkas", "laporan", "map"].includes(activeViewParam);

  const [
    { data: bidangMapRaw, error: bidangMapError },
    { data: berkasRaw, error: berkasError },
    { data: bSumRaw, error: bSumErr },
    { data: lSumRaw, error: lSumErr },
    { data: pSumRaw, error: pSumErr },
    { data: alatUkurRaw, error: alatUkurError },
    { data: issueGeomRaw, error: issueGeomError },
  ] = await Promise.all([
    scopedProjectIds.length > 0 && plmEnabledForSelectedOrg && needsPlmData
      ? supabase
          .schema("spatial")
          .from("v_bidang_hasil_ukur_map")
          .select("id, project_id, berkas_id, label, geojson")
          .in("project_id", scopedProjectIds)
      : Promise.resolve({ data: [] as BidangHasilUkurMapRow[], error: null }),
    scopedProjectIds.length > 0 && plmEnabledForSelectedOrg && needsPlmData
      ? supabase
          .schema("plm")
          .from("berkas_permohonan")
          .select(
            `id, project_id, nomor_berkas, tanggal_berkas, status, catatan,
             berkas_pemilik ( urutan, pemilik_tanah ( id, nama_lengkap ) )`
          )
          .in("project_id", scopedProjectIds)
          .is("deleted_at", null)
          .order("tanggal_berkas", { ascending: false })
      : Promise.resolve({ data: [] as BerkasPermohonanRow[], error: null }),
    scopedProjectIds.length > 0 && plmEnabledForSelectedOrg && needsPlmData
      ? supabase
          .schema("plm")
          .from("v_berkas_permohonan_summary_by_status")
          .select("project_id, status, jumlah, tanggal_berkas_terbaru")
          .in("project_id", scopedProjectIds)
          .order("project_id")
          .order("status")
      : Promise.resolve({ data: [] as PlmBerkasStatusSummaryRow[], error: null }),
    scopedProjectIds.length > 0 && plmEnabledForSelectedOrg && needsPlmData
      ? supabase
          .schema("plm")
          .from("v_legalisasi_gu_summary_by_tahap")
          .select("project_id, status_tahap, jumlah")
          .in("project_id", scopedProjectIds)
          .order("project_id")
          .order("status_tahap")
      : Promise.resolve({ data: [] as PlmLegalisasiTahapSummaryRow[], error: null }),
    scopedProjectIds.length > 0 && plmEnabledForSelectedOrg && needsPlmData
      ? supabase
          .schema("plm")
          .from("v_pengukuran_lapangan_summary_by_status")
          .select("project_id, status, jumlah")
          .in("project_id", scopedProjectIds)
          .order("project_id")
          .order("status")
      : Promise.resolve({ data: [] as PlmPengukuranStatusSummaryRow[], error: null }),
    selectedOrgId != null && plmEnabledForSelectedOrg && needsPlmData
      ? supabase
          .schema("plm")
          .from("alat_ukur")
          .select(
            "id, organization_id, kode_aset, jenis, merek_model, serial_number, is_active"
          )
          .eq("organization_id", selectedOrgId)
          .is("deleted_at", null)
          .order("kode_aset")
      : Promise.resolve({ data: [] as AlatUkurRow[], error: null }),
    scopedProjectIds.length > 0 && spatialEnabledForScopedProjects
      ? supabase
          .schema("spatial")
          .from("v_issue_geometry_feature_map")
          .select("id, project_id, issue_id, feature_key, label, properties, geojson")
          .in("project_id", scopedProjectIds)
      : Promise.resolve({ data: [] as IssueGeometryFeatureMapRow[], error: null }),
  ]);

  const bidangHasilUkurMap = (bidangMapRaw ?? []) as BidangHasilUkurMapRow[];
  const berkasPermohonan = (berkasRaw ?? []) as BerkasPermohonanRow[];
  const plmBerkasStatusSummary = (bSumRaw ?? []) as PlmBerkasStatusSummaryRow[];
  const plmLegalisasiTahapSummary = (lSumRaw ?? []) as PlmLegalisasiTahapSummaryRow[];
  const plmPengukuranStatusSummary = (pSumRaw ?? []) as PlmPengukuranStatusSummaryRow[];
  const alatUkur = (alatUkurRaw ?? []) as AlatUkurRow[];
  const issueGeometryFeatureMap = (issueGeomRaw ?? []) as IssueGeometryFeatureMapRow[];

  const berkasIds = berkasPermohonan.map((b) => b.id);
  const [
    { data: legalisasiRaw, error: legalisasiError },
    { data: pisRaw, error: pisError },
    { data: pengLapRaw, error: pengLapError },
  ] = await Promise.all([
    berkasIds.length > 0 && plmEnabledForSelectedOrg
      ? supabase
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
      : Promise.resolve({ data: [] as LegalisasiGuRow[], error: null }),
    berkasIds.length > 0 && plmEnabledForSelectedOrg
      ? supabase
          .schema("plm")
          .from("permohonan_informasi_spasial")
          .select(
            "id, berkas_id, tanggal_permohonan, status_hasil, tanggal_download_hasil, catatan"
          )
          .in("berkas_id", berkasIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as PermohonanInfoSpasialRow[], error: null }),
    berkasIds.length > 0 && plmEnabledForSelectedOrg
      ? supabase
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
      : Promise.resolve({ data: [] as PengukuranLapanganRow[], error: null }),
  ]);

  const legalisasiGu = (legalisasiRaw ?? []) as LegalisasiGuRow[];
  const legalisasiIds = legalisasiGu.map((r) => r.id);
  const [
    { data: legalisasiFilesRaw, error: legalisasiFilesError },
    { data: legalisasiHistRaw, error: legalisasiHistError },
  ] = await Promise.all([
    legalisasiIds.length > 0
      ? supabase
          .schema("plm")
          .from("legalisasi_gu_file")
          .select(
            "id, legalisasi_gu_id, tipe_file, file_name, mime_type, storage_key, uploaded_at, created_at"
          )
          .in("legalisasi_gu_id", legalisasiIds)
      : Promise.resolve({ data: [] as LegalisasiGuFileRow[], error: null }),
    legalisasiIds.length > 0
      ? supabase
          .schema("plm")
          .from("legalisasi_gu_history")
          .select(
            "id, legalisasi_gu_id, actor_user_id, event_kind, payload, created_at"
          )
          .in("legalisasi_gu_id", legalisasiIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as LegalisasiGuHistoryRow[], error: null }),
  ]);

  const legalisasiGuFiles = (legalisasiFilesRaw ?? []) as LegalisasiGuFileRow[];
  const legalisasiGuHistory = (legalisasiHistRaw ?? []) as LegalisasiGuHistoryRow[];
  const permohonanInfoSpasial = (pisRaw ?? []) as PermohonanInfoSpasialRow[];
  const pengukuranLapangan = (pengLapRaw ?? []) as PengukuranLapanganRow[];
  const pengIds = pengukuranLapangan.map((p) => p.id);
  const [
    { data: pengSurvRaw, error: pengSurvError },
    { data: pengAlatRaw, error: pengAlatError },
    { data: pengDokRaw, error: pengDokError },
  ] = await Promise.all([
    pengIds.length > 0
      ? supabase
          .schema("plm")
          .from("pengukuran_surveyor")
          .select("id, pengukuran_id, surveyor_user_id, peran, created_at")
          .in("pengukuran_id", pengIds)
      : Promise.resolve({ data: [] as PengukuranSurveyorRow[], error: null }),
    pengIds.length > 0
      ? supabase
          .schema("plm")
          .from("pengukuran_alat")
          .select("id, pengukuran_id, alat_id, peran_alat, created_at")
          .in("pengukuran_id", pengIds)
      : Promise.resolve({ data: [] as PengukuranAlatRow[], error: null }),
    pengIds.length > 0
      ? supabase
          .schema("plm")
          .from("pengukuran_dokumen")
          .select(
            "id, pengukuran_id, tipe_dokumen, file_name, mime_type, storage_key, uploaded_at, created_at"
          )
          .in("pengukuran_id", pengIds)
      : Promise.resolve({ data: [] as PengukuranDokumenRow[], error: null }),
  ]);

  const pengukuranSurveyor = (pengSurvRaw ?? []) as PengukuranSurveyorRow[];
  const pengukuranAlat = (pengAlatRaw ?? []) as PengukuranAlatRow[];
  const pengukuranDokumen = (pengDokRaw ?? []) as PengukuranDokumenRow[];

  const financeEnabledForSelectedOrg = organizationModules.some(
    (m) =>
      m.is_enabled &&
      m.module_code === "finance" &&
      m.organization_id === selectedOrgId
  );
  const needsFinanceData = activeViewParam === "keuangan";

  const { data: finInvRaw, error: finInvErr } =
    scopedProjectIds.length > 0 && financeEnabledForSelectedOrg && needsFinanceData
      ? await supabase
          .schema("finance")
          .from("invoice")
          .select(
            "id, organization_id, project_id, berkas_id, nomor_invoice, status, currency, total_amount, notes, issued_at, due_at, created_at, updated_at, deleted_at"
          )
          .in("project_id", scopedProjectIds)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
      : { data: [] as FinanceInvoiceRow[], error: null };

  const financeInvoices = (finInvRaw ?? []) as FinanceInvoiceRow[];
  const financeInvoiceIds = financeInvoices.map((i) => i.id);

  const [
    { data: finItemRaw, error: finItemErr },
    { data: finPayRaw, error: finPayErr },
  ] = await Promise.all([
    financeInvoiceIds.length > 0
      ? supabase
          .schema("finance")
          .from("invoice_item")
          .select(
            "id, invoice_id, urutan, description, quantity, unit_price, line_total, created_at"
          )
          .in("invoice_id", financeInvoiceIds)
          .order("invoice_id")
          .order("urutan")
      : Promise.resolve({ data: [] as FinanceInvoiceItemRow[], error: null }),
    financeInvoiceIds.length > 0
      ? supabase
          .schema("finance")
          .from("pembayaran")
          .select(
            "id, invoice_id, amount, paid_at, method, reference, notes, created_at"
          )
          .in("invoice_id", financeInvoiceIds)
          .order("paid_at", { ascending: false })
      : Promise.resolve({ data: [] as FinancePembayaranRow[], error: null }),
  ]);

  const financeInvoiceItems = (finItemRaw ?? []) as FinanceInvoiceItemRow[];
  const financePembayaran = (finPayRaw ?? []) as FinancePembayaranRow[];

  const notifRes =
    user?.id != null
      ? await supabase
          .schema("core_pm")
          .from("user_notifications")
          .select(
            "id, user_id, organization_id, project_id, kind, severity, title, body, payload, read_at, created_at"
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: [] as UserNotificationRow[], error: null };

  const { data: notifRaw, error: notifError } = notifRes;

  const userNotifications = (notifRaw ?? []) as UserNotificationRow[];

  const fetchError =
    projectsError?.message ??
    orgsError?.message ??
    statusesError?.message ??
    issuesError?.message ??
    projectMembersError?.message ??
    footprintsError?.message ??
    profilesError?.message ??
    bidangMapError?.message ??
    issueGeomError?.message ??
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
    finInvErr?.message ??
    finItemErr?.message ??
    finPayErr?.message ??
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
        projectMembers={projectMembers}
        footprints={footprints}
        bidangHasilUkurMap={bidangHasilUkurMap}
        issueGeometryFeatureMap={issueGeometryFeatureMap}
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
        financeInvoices={financeInvoices}
        financeInvoiceItems={financeInvoiceItems}
        financePembayaran={financePembayaran}
        fetchError={fetchError}
        userEmail={user?.email ?? null}
        userNotifications={userNotifications}
        joinError={joinError}
      />
    </Suspense>
  );
}
