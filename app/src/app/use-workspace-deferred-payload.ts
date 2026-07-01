"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectRow } from "./workspace-client";
import type { OrganizationMemberRow } from "./workspace-client";
import type { OrganizationModuleRow } from "./workspace-modules";
import type { WorkspaceDeferredPayload } from "@/lib/workspace-bootstrap-types";
import type { ViewId } from "./workspace-views";
import { fetchWorkspaceDeferredPayloadAction } from "./fetch-workspace-deferred-payload-action";
import { viewNeedsDeferredPayload } from "./workspace-deferred-payload";

type ShellDeferredFields = {
  issues: WorkspaceDeferredPayload["issues"];
  statuses: WorkspaceDeferredPayload["statuses"];
  projectMembers: WorkspaceDeferredPayload["projectMembers"];
  footprints: WorkspaceDeferredPayload["footprints"];
  bidangHasilUkurMap: WorkspaceDeferredPayload["bidangHasilUkurMap"];
  issueGeometryFeatureMap: WorkspaceDeferredPayload["issueGeometryFeatureMap"];
  issueFeatureAttributes: WorkspaceDeferredPayload["issueFeatureAttributes"];
  berkasPermohonan: WorkspaceDeferredPayload["berkasPermohonan"];
  legalisasiGu: WorkspaceDeferredPayload["legalisasiGu"];
  legalisasiGuFiles: WorkspaceDeferredPayload["legalisasiGuFiles"];
  legalisasiGuHistory: WorkspaceDeferredPayload["legalisasiGuHistory"];
  permohonanInfoSpasial: WorkspaceDeferredPayload["permohonanInfoSpasial"];
  pengukuranLapangan: WorkspaceDeferredPayload["pengukuranLapangan"];
  pengukuranSurveyor: WorkspaceDeferredPayload["pengukuranSurveyor"];
  pengukuranAlat: WorkspaceDeferredPayload["pengukuranAlat"];
  pengukuranDokumen: WorkspaceDeferredPayload["pengukuranDokumen"];
  alatUkur: WorkspaceDeferredPayload["alatUkur"];
  plmBerkasStatusSummary: WorkspaceDeferredPayload["plmBerkasStatusSummary"];
  plmLegalisasiTahapSummary: WorkspaceDeferredPayload["plmLegalisasiTahapSummary"];
  plmPengukuranStatusSummary: WorkspaceDeferredPayload["plmPengukuranStatusSummary"];
  financeInvoices: WorkspaceDeferredPayload["financeInvoices"];
  financeInvoiceItems: WorkspaceDeferredPayload["financeInvoiceItems"];
  financePembayaran: WorkspaceDeferredPayload["financePembayaran"];
  userPresence: WorkspaceDeferredPayload["userPresence"];
  virtualDashboardsByProjectId: WorkspaceDeferredPayload["virtualDashboardsByProjectId"];
};

type UseWorkspaceDeferredPayloadInput = ShellDeferredFields & {
  activeView: ViewId;
  canonicalOrgId: string | null;
  selectedProjectId: string | null;
  projectsInOrg: ProjectRow[];
  organizationMembers: OrganizationMemberRow[];
  organizationModules: OrganizationModuleRow[];
  shellFetchError: string | null;
};

function mergeShellWithDeferred(
  shell: ShellDeferredFields,
  deferred: WorkspaceDeferredPayload | null
): ShellDeferredFields & { fetchError: string | null } {
  if (!deferred) {
    return { ...shell, fetchError: null };
  }
  return {
    issues: deferred.issues,
    statuses: deferred.statuses,
    projectMembers: deferred.projectMembers,
    footprints: deferred.footprints,
    bidangHasilUkurMap: deferred.bidangHasilUkurMap,
    issueGeometryFeatureMap: deferred.issueGeometryFeatureMap,
    issueFeatureAttributes: deferred.issueFeatureAttributes,
    berkasPermohonan: deferred.berkasPermohonan,
    legalisasiGu: deferred.legalisasiGu,
    legalisasiGuFiles: deferred.legalisasiGuFiles,
    legalisasiGuHistory: deferred.legalisasiGuHistory,
    permohonanInfoSpasial: deferred.permohonanInfoSpasial,
    pengukuranLapangan: deferred.pengukuranLapangan,
    pengukuranSurveyor: deferred.pengukuranSurveyor,
    pengukuranAlat: deferred.pengukuranAlat,
    pengukuranDokumen: deferred.pengukuranDokumen,
    alatUkur: deferred.alatUkur,
    plmBerkasStatusSummary: deferred.plmBerkasStatusSummary,
    plmLegalisasiTahapSummary: deferred.plmLegalisasiTahapSummary,
    plmPengukuranStatusSummary: deferred.plmPengukuranStatusSummary,
    financeInvoices: deferred.financeInvoices,
    financeInvoiceItems: deferred.financeInvoiceItems,
    financePembayaran: deferred.financePembayaran,
    userPresence: deferred.userPresence,
    virtualDashboardsByProjectId: deferred.virtualDashboardsByProjectId,
    fetchError: deferred.fetchError,
  };
}

export function useWorkspaceDeferredPayload(input: UseWorkspaceDeferredPayloadInput) {
  const {
    activeView,
    canonicalOrgId,
    selectedProjectId,
    projectsInOrg,
    organizationMembers,
    organizationModules,
    shellFetchError,
    ...shell
  } = input;

  const [deferred, setDeferred] = useState<WorkspaceDeferredPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const loadedScopeRef = useRef<string | null>(null);
  const inflightRef = useRef<Promise<void> | null>(null);

  const scopeKey = [
    canonicalOrgId ?? "",
    selectedProjectId ?? "",
    projectsInOrg.map((p) => p.id).join(","),
  ].join(":");

  const load = useCallback(async () => {
    if (!canonicalOrgId || projectsInOrg.length === 0) return;
    if (inflightRef.current) {
      await inflightRef.current;
      return;
    }

    const run = (async () => {
      setLoading(true);
      try {
        const res = await fetchWorkspaceDeferredPayloadAction({
          organizationId: canonicalOrgId,
          selectedProjectId,
          scopedProjectIds: projectsInOrg.map((p) => p.id),
          organizationModules,
          organizationMembers,
          projectList: projectsInOrg,
        });
        if (res.data) {
          setDeferred(res.data);
          loadedScopeRef.current = scopeKey;
        }
      } finally {
        setLoading(false);
        inflightRef.current = null;
      }
    })();

    inflightRef.current = run;
    await run;
  }, [
    canonicalOrgId,
    selectedProjectId,
    projectsInOrg,
    organizationModules,
    organizationMembers,
    scopeKey,
  ]);

  useEffect(() => {
    if (!viewNeedsDeferredPayload(activeView)) return;
    if (loadedScopeRef.current === scopeKey && deferred) return;
    void load();
  }, [activeView, scopeKey, deferred, load]);

  useEffect(() => {
    if (loadedScopeRef.current === scopeKey) return;
    setDeferred(null);
    loadedScopeRef.current = null;
  }, [scopeKey]);

  const merged = mergeShellWithDeferred(shell, deferred);

  return {
    ...merged,
    loading,
    loaded: Boolean(deferred) && loadedScopeRef.current === scopeKey,
    fetchError: merged.fetchError ?? shellFetchError,
  };
}
