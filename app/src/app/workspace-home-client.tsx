"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { WorkspaceClient } from "./workspace-client";
import { fetchWorkspaceShellAction } from "./fetch-workspace-shell-action";
import {
  readWorkspaceShellCache,
  setWorkspaceShellCache,
} from "@/lib/workspace-shell-cache";
import type { WorkspaceShellPayload } from "@/lib/workspace-shell-types";
import { WorkspaceShellProvider } from "./workspace-shell-context";
import RootLoading from "./loading";

type Props = {
  joinError: string | null;
};

/** PR-G: paint shell dari cache lokal, revalidate ke server di background. */
export function WorkspaceHomeClient({ joinError }: Props) {
  const [shell, setShell] = useState<WorkspaceShellPayload | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [revalidating, setRevalidating] = useState(false);

  useLayoutEffect(() => {
    const cached = readWorkspaceShellCache();
    if (cached) {
      setShell(cached);
      setRevalidating(true);
      setBootstrapping(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchWorkspaceShellAction().then((res) => {
      if (cancelled) return;
      if (res.data) {
        setShell(res.data);
        if (res.data.userId) {
          setWorkspaceShellCache(res.data.userId, res.data);
        }
      }
      setBootstrapping(false);
      setRevalidating(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshWorkspaceShell = useCallback(async () => {
    setRevalidating(true);
    try {
      const res = await fetchWorkspaceShellAction();
      if (res.data) {
        setShell(res.data);
        if (res.data.userId) {
          setWorkspaceShellCache(res.data.userId, res.data);
        }
        return res.data;
      }
      return null;
    } finally {
      setRevalidating(false);
    }
  }, []);

  if (bootstrapping && !shell) {
    return <RootLoading />;
  }

  if (!shell) {
    return <RootLoading />;
  }

  return (
    <>
      {revalidating ? (
        <div
          className="pointer-events-none fixed inset-x-0 top-0 z-[80] flex justify-center px-3 pt-[max(0.25rem,env(safe-area-inset-top))]"
          role="status"
          aria-live="polite"
        >
          <span className="rounded-full border border-border bg-background/95 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm">
            Memperbarui…
          </span>
        </div>
      ) : null}
      <WorkspaceShellProvider refreshWorkspaceShell={refreshWorkspaceShell}>
        <WorkspaceClient
        organizations={shell.organizations}
        projects={shell.projects}
        statuses={[]}
        issues={[]}
        projectMembers={shell.projectMembers}
        organizationMembers={shell.organizationMembers}
        footprints={[]}
        bidangHasilUkurMap={[]}
        issueGeometryFeatureMap={[]}
        issueFeatureAttributes={[]}
        moduleRegistry={shell.moduleRegistry}
        organizationModules={shell.organizationModules}
        berkasPermohonan={[]}
        legalisasiGu={[]}
        legalisasiGuFiles={[]}
        legalisasiGuHistory={[]}
        permohonanInfoSpasial={[]}
        pengukuranLapangan={[]}
        pengukuranSurveyor={[]}
        pengukuranAlat={[]}
        pengukuranDokumen={[]}
        alatUkur={[]}
        plmBerkasStatusSummary={[]}
        plmLegalisasiTahapSummary={[]}
        plmPengukuranStatusSummary={[]}
        financeInvoices={[]}
        financeInvoiceItems={[]}
        financePembayaran={[]}
        activityLogs={[]}
        userPresence={[]}
        fetchError={shell.fetchError}
        userEmail={shell.userEmail}
        userId={shell.userId}
        virtualTables={shell.virtualTables}
        virtualColumns={shell.virtualColumns}
        virtualDashboardsByProjectId={{}}
        joinError={joinError}
      />
      </WorkspaceShellProvider>
    </>
  );
}
