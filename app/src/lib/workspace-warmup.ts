import type { VirtualTableRow } from "@/app/virtual-table-types";
import { prefetchActivityLogsIfNeeded } from "@/lib/activity-logs-prefetch";
import {
  prefetchChatInboxIfNeeded,
  tableIdsInChatInboxScope,
} from "@/lib/chat-inbox-prefetch";
import { resetWarmupSessionBudget } from "@/lib/client-background-cache-policy";
import { enqueueWarmupJobs, type WarmupJob } from "@/lib/client-warmup-queue";

function virtualTablesForChatScope(
  virtualTables: VirtualTableRow[],
  organizationId: string,
  projectId: string | null,
  hasOrgStaffAccess: boolean
): VirtualTableRow[] {
  const orgTables = hasOrgStaffAccess
    ? virtualTables.filter(
        (vt) => vt.organization_id === organizationId && !vt.project_id
      )
    : [];
  const projectTables = projectId
    ? virtualTables.filter((vt) => vt.project_id === projectId)
    : [];
  return [...orgTables, ...projectTables];
}

function buildChatInboxWarmupJobs(input: {
  organizationId: string;
  selectedProjectId: string | null;
  projectsInOrg: { id: string }[];
  virtualTables: VirtualTableRow[];
  hasOrgStaffAccess: boolean;
  userId: string;
}): WarmupJob[] {
  const projectIds = input.projectsInOrg.map((p) => p.id);
  const scopeOrder: (string | null)[] = [];

  if (input.selectedProjectId) {
    scopeOrder.push(input.selectedProjectId);
  }
  if (input.hasOrgStaffAccess) {
    scopeOrder.push(null);
  }
  for (const pid of projectIds) {
    if (pid !== input.selectedProjectId) scopeOrder.push(pid);
  }

  const jobs: WarmupJob[] = [];
  let priority = 1;

  for (const projectId of scopeOrder) {
    const scopeTables = virtualTablesForChatScope(
      input.virtualTables,
      input.organizationId,
      projectId,
      input.hasOrgStaffAccess
    );
    const tableIds = tableIdsInChatInboxScope(
      scopeTables,
      input.organizationId,
      projectId
    );
    if (tableIds.length === 0) continue;

    const jobId = `inbox:${input.organizationId}:${projectId ?? "org"}`;
    const jobPriority = priority;
    priority += 1;

    jobs.push({
      id: jobId,
      priority: jobPriority,
      run: () =>
        prefetchChatInboxIfNeeded({
          organizationId: input.organizationId,
          projectId,
          tableIds,
          virtualTables: scopeTables,
          userId: input.userId,
        }),
    });
  }

  return jobs;
}

export function startWorkspaceWarmup(input: {
  organizationId: string;
  selectedProjectId: string | null;
  projectsInOrg: { id: string }[];
  virtualTables: VirtualTableRow[];
  hasOrgStaffAccess: boolean;
  userId: string;
}): () => void {
  if (!input.organizationId || !input.userId) return () => {};

  resetWarmupSessionBudget();

  const projectIds = input.projectsInOrg.map((p) => p.id);
  const jobs: WarmupJob[] = [
    {
      id: `activity:${input.organizationId}`,
      priority: 0,
      run: () =>
        prefetchActivityLogsIfNeeded({
          organizationId: input.organizationId,
          projectIds,
        }),
    },
    ...buildChatInboxWarmupJobs(input),
  ];

  return enqueueWarmupJobs(jobs);
}
