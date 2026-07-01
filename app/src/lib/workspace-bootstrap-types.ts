import type {
  BidangHasilUkurMapRow,
  DemoFootprintRow,
  IssueFeatureAttributeRow,
  IssueGeometryFeatureMapRow,
  IssueRow,
  ProjectMemberRow,
  ProjectRow,
  StatusRow,
  UserPresenceRow,
} from "@/app/workspace-client";
import type { BerkasPermohonanRow } from "@/app/plm-berkas-types";
import type {
  LegalisasiGuFileRow,
  LegalisasiGuHistoryRow,
  LegalisasiGuRow,
} from "@/app/plm-legalisasi-types";
import type {
  AlatUkurRow,
  PengukuranAlatRow,
  PengukuranDokumenRow,
  PengukuranLapanganRow,
  PengukuranSurveyorRow,
  PermohonanInfoSpasialRow,
} from "@/app/plm-pengukuran-types";
import type {
  ModuleRegistryRow,
  OrganizationModuleRow,
} from "@/app/workspace-modules";
import type {
  PlmBerkasStatusSummaryRow,
  PlmLegalisasiTahapSummaryRow,
  PlmPengukuranStatusSummaryRow,
} from "@/app/laporan-panel";
import type {
  FinanceInvoiceItemRow,
  FinanceInvoiceRow,
  FinancePembayaranRow,
} from "@/app/finance-types";
import type {
  VirtualTableRow,
  VirtualColumnRow,
} from "@/app/virtual-table-types";
import type { VirtualDashboardRow } from "@/app/virtual-dashboard-types";

export type WorkspaceBootstrapScope = {
  selectedOrgId: string | null;
  selectedProjectId: string | null;
  scopedProjectIds: string[];
  orgIds: string[];
  projectList: ProjectRow[];
  hasOrgStaffInSelectedOrg: boolean;
  organizationModules: OrganizationModuleRow[];
  userId: string | null;
};

export type WorkspaceDeferredPayload = {
  issues: IssueRow[];
  statuses: StatusRow[];
  projectMembers: ProjectMemberRow[];
  footprints: DemoFootprintRow[];
  moduleRegistry: ModuleRegistryRow[];
  organizationModules: OrganizationModuleRow[];
  userPresence: UserPresenceRow[];
  bidangHasilUkurMap: BidangHasilUkurMapRow[];
  berkasPermohonan: BerkasPermohonanRow[];
  plmBerkasStatusSummary: PlmBerkasStatusSummaryRow[];
  plmLegalisasiTahapSummary: PlmLegalisasiTahapSummaryRow[];
  plmPengukuranStatusSummary: PlmPengukuranStatusSummaryRow[];
  alatUkur: AlatUkurRow[];
  issueGeometryFeatureMap: IssueGeometryFeatureMapRow[];
  issueFeatureAttributes: IssueFeatureAttributeRow[];
  legalisasiGu: LegalisasiGuRow[];
  legalisasiGuFiles: LegalisasiGuFileRow[];
  legalisasiGuHistory: LegalisasiGuHistoryRow[];
  permohonanInfoSpasial: PermohonanInfoSpasialRow[];
  pengukuranLapangan: PengukuranLapanganRow[];
  pengukuranSurveyor: PengukuranSurveyorRow[];
  pengukuranAlat: PengukuranAlatRow[];
  pengukuranDokumen: PengukuranDokumenRow[];
  financeInvoices: FinanceInvoiceRow[];
  financeInvoiceItems: FinanceInvoiceItemRow[];
  financePembayaran: FinancePembayaranRow[];
  virtualTables: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
  virtualDashboardsByProjectId: Record<string, VirtualDashboardRow>;
  fetchError: string | null;
};
