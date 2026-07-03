"use client";

import { useMemo, useState } from "react";
import { formatActivityDateTime } from "./schedule-utils";
import type { ActivityLogRow } from "./activity-log-types";
import {
  formatAuditActivity,
  resolveTableDisplayNameFromAuditLog,
  resolveVirtualRowIdFromAuditLog,
  resolveVirtualTableIdFromAuditLog,
} from "@/lib/audit-activity-display";
import { cn } from "@/lib/utils";
import { WORKSPACE_TAB_LIST_HEADER_CLASS } from "./workspace-tab-list-header";
import { WorkspaceMobileListSkeleton } from "./workspace-mobile-list-skeleton";
import { pilihRuangKerja, ruangKerjaLc } from "@/lib/product-labels";

type Props = {
  activityLogs: ActivityLogRow[];
  organizationId: string | null;
  organizationName: string | null;
  selectedProjectId: string | null;
  hasOrgStaffAccess: boolean;
  projectNameById: Map<string, string>;
  virtualTableIds: Set<string>;
  virtualTableNameById: Map<string, string>;
  isBelowMd: boolean;
  isLoading?: boolean;
  onOpenTable: (tableId: string) => void;
  onOpenRow: (rowId: string, tableIdHint: string | null) => void;
  onOpenProject?: (projectId: string) => void;
};

export function WorkspaceActivityTab({
  activityLogs,
  organizationId,
  organizationName,
  selectedProjectId,
  hasOrgStaffAccess,
  projectNameById,
  virtualTableIds,
  virtualTableNameById,
  isBelowMd,
  isLoading = false,
  onOpenTable,
  onOpenRow,
  onOpenProject,
}: Props) {
  const [crossProject, setCrossProject] = useState(false);

  const filtered = useMemo(() => {
    if (!organizationId) return [] as ActivityLogRow[];

    let rows = activityLogs.filter((l) => l.organization_id === organizationId);

    if (!hasOrgStaffAccess || !crossProject) {
      if (!selectedProjectId) {
        rows = rows.filter((l) => l.project_id == null);
      } else {
        rows = rows.filter(
          (l) =>
            l.project_id === selectedProjectId ||
            (hasOrgStaffAccess && l.project_id == null)
        );
      }
    }

    return [...rows].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)
    );
  }, [
    activityLogs,
    organizationId,
    selectedProjectId,
    hasOrgStaffAccess,
    crossProject,
  ]);

  if (!organizationId) {
    return (
      <p className="px-3 py-6 text-sm text-muted-foreground">
        Pilih organisasi untuk melihat aktivitas.
      </p>
    );
  }

  if (!selectedProjectId && !hasOrgStaffAccess) {
    return (
      <p className="px-3 py-6 text-sm text-muted-foreground">
        {pilihRuangKerja()} untuk melihat aktivitas di assignment Anda.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden",
        isBelowMd ? "h-full flex-1" : "mt-2"
      )}
    >
      {hasOrgStaffAccess ? (
        <div className={WORKSPACE_TAB_LIST_HEADER_CLASS}>
          <label className="flex w-full min-h-10 cursor-pointer items-center gap-2.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 shrink-0 rounded border-border"
              checked={crossProject}
              onChange={(e) => setCrossProject(e.target.checked)}
            />
            Semua {ruangKerjaLc} di org
          </label>
        </div>
      ) : null}

      <ul className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto pm-mobile-scroll p-2">
        {isLoading && filtered.length === 0 ? (
          <WorkspaceMobileListSkeleton count={6} variant="activity" />
        ) : null}
        {!isLoading && filtered.length === 0 ? (
          <li className="px-2 py-8 text-center text-sm text-muted-foreground">
            Belum ada aktivitas untuk filter ini.
          </li>
        ) : (
          filtered.map((log) => {
            const display = formatAuditActivity(log, projectNameById);
            const tableId = resolveVirtualTableIdFromAuditLog(log, virtualTableIds);
            const tableName = resolveTableDisplayNameFromAuditLog(
              log,
              virtualTableNameById,
              virtualTableIds
            );
            const rowId = resolveVirtualRowIdFromAuditLog(log);
            const metaParts = [
              log.actor_display_name?.trim() || "Seseorang",
              organizationName?.trim() || null,
              display.scopeLabel,
              tableName,
            ].filter(Boolean);
            const clickable =
              Boolean(tableId) ||
              Boolean(rowId) ||
              (log.action === "project_created" && log.project_id && onOpenProject);

            const handleClick = () => {
              if (rowId) {
                onOpenRow(rowId, tableId);
                return;
              }
              if (tableId) {
                onOpenTable(tableId);
                return;
              }
              if (
                log.action === "project_created" &&
                log.project_id &&
                onOpenProject
              ) {
                onOpenProject(log.project_id);
              }
            };

            return (
              <li key={log.id} className="min-w-0">
                <button
                  type="button"
                  disabled={!clickable}
                  onClick={handleClick}
                  className={cn(
                    "flex w-full min-w-0 flex-col gap-1 rounded-lg px-3 py-2.5 text-left transition-colors",
                    clickable
                      ? "hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                      : "cursor-default"
                  )}
                >
                  <div className="flex min-w-0 items-baseline justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">
                      {display.title}
                    </span>
                    <time
                      className="shrink-0 text-[11px] text-muted-foreground"
                      dateTime={log.created_at}
                    >
                      {formatActivityDateTime(log.created_at)}
                    </time>
                  </div>
                  {display.detail ? (
                    <p className="truncate text-xs text-muted-foreground">
                      {display.detail}
                    </p>
                  ) : null}
                  <p className="truncate text-[11px] text-muted-foreground">
                    {metaParts.join(" · ")}
                  </p>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
