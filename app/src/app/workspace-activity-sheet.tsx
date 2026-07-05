"use client";

import { History, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { ActivityLogRow } from "./activity-log-types";
import { WorkspaceActivityTab } from "./workspace-activity-tab";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isBelowMd: boolean;
  activityLogs: ActivityLogRow[];
  organizationId: string | null;
  organizationName: string | null;
  selectedProjectId: string | null;
  hasOrgStaffAccess: boolean;
  projectNameById: Map<string, string>;
  virtualTableIds: Set<string>;
  virtualTableNameById: Map<string, string>;
  isLoading?: boolean;
  onOpenTable: (tableId: string) => void;
  onOpenRow: (rowId: string, tableIdHint: string | null) => void;
  onOpenProject?: (projectId: string) => void;
};

export function WorkspaceActivitySheet({
  open,
  onOpenChange,
  isBelowMd,
  activityLogs,
  organizationId,
  organizationName,
  selectedProjectId,
  hasOrgStaffAccess,
  projectNameById,
  virtualTableIds,
  virtualTableNameById,
  isLoading = false,
  onOpenTable,
  onOpenRow,
  onOpenProject,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} side={isBelowMd ? "bottom" : "right"}>
      <SheetContent
        side={isBelowMd ? "bottom" : "right"}
        className={
          isBelowMd
            ? "h-[min(90dvh,100%)]"
            : "w-full max-w-lg sm:max-w-xl"
        }
      >
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          data-testid="activity-history-sheet"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
            <History className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              Riwayat aktivitas
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              onClick={() => onOpenChange(false)}
              aria-label="Tutup riwayat aktivitas"
            >
              <X className="size-4" />
            </Button>
          </div>
          <WorkspaceActivityTab
            activityLogs={activityLogs}
            organizationId={organizationId}
            organizationName={organizationName}
            selectedProjectId={selectedProjectId}
            hasOrgStaffAccess={hasOrgStaffAccess}
            projectNameById={projectNameById}
            virtualTableIds={virtualTableIds}
            virtualTableNameById={virtualTableNameById}
            isBelowMd
            isLoading={isLoading}
            onOpenTable={onOpenTable}
            onOpenRow={onOpenRow}
            onOpenProject={onOpenProject}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
