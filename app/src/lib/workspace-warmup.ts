import type { OrganizationMemberRow } from "@/app/workspace-client";
import type { ProjectRow } from "@/app/workspace-client";
import type { OrganizationModuleRow } from "@/app/workspace-modules";
import type { VirtualTableRow } from "@/app/virtual-table-types";
import { prefetchActivityLogsIfNeeded } from "@/lib/activity-logs-prefetch";
import {
  prefetchChatInboxIfNeeded,
  tableIdsInChatInboxScope,
} from "@/lib/chat-inbox-prefetch";
import { resetWarmupSessionBudget } from "@/lib/client-background-cache-policy";
import { enqueueWarmupJobs, type WarmupJob } from "@/lib/client-warmup-queue";
import { prefetchVirtualTableMobileRowsIfNeeded } from "@/lib/virtual-table-mobile-rows-prefetch";
import { prefetchWorkspaceDeferredPayloadIfNeeded } from "@/lib/workspace-deferred-payload-prefetch";
import {
  memberHasOrgStaffAccess,
  organizationModulesForOrg,
  projectsInOrganization,
  virtualTablesForWarmupScope,
} from "@/lib/workspace-warmup-scope";

const MAX_TABLES_PER_SCOPE = 3;
const TABLE_ROWS_PRIORITY = 20;
const MULTI_ORG_BASE_PRIORITY = 40;

function buildChatInboxWarmupJobs(input: {
  organizationId: string;
  selectedProjectId: string | null;
  projectsInOrg: { id: string }[];
  virtualTables: VirtualTableRow[];
  hasOrgStaffAccess: boolean;
  userId: string;
  priorityStart: number;
  idPrefix?: string;
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
  let priority = input.priorityStart;
  const prefix = input.idPrefix ?? "";

  for (const projectId of scopeOrder) {
    const scopeTables = virtualTablesForWarmupScope(
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

    jobs.push({
      id: `${prefix}inbox:${input.organizationId}:${projectId ?? "org"}`,
      priority,
      run: () =>
        prefetchChatInboxIfNeeded({
          organizationId: input.organizationId,
          projectId,
          tableIds,
          virtualTables: scopeTables,
          userId: input.userId,
        }),
    });
    priority += 1;
  }

  return jobs;
}

function buildTableRowsWarmupJobs(input: {
  organizationId: string;
  selectedProjectId: string | null;
  virtualTables: VirtualTableRow[];
  hasOrgStaffAccess: boolean;
  priorityStart: number;
  idPrefix?: string;
}): WarmupJob[] {
  const tables = virtualTablesForWarmupScope(
    input.virtualTables,
    input.organizationId,
    input.selectedProjectId,
    input.hasOrgStaffAccess
  ).slice(0, MAX_TABLES_PER_SCOPE);

  return tables.map((table, index) => ({
    id: `${input.idPrefix ?? ""}vtable:${table.id}`,
    priority: input.priorityStart + index,
    run: () => prefetchVirtualTableMobileRowsIfNeeded(table.id),
  }));
}

function buildOrgWarmupJobs(input: {
  organizationId: string;
  selectedProjectId: string | null;
  projectsInOrg: { id: string }[];
  virtualTables: VirtualTableRow[];
  organizationModules: OrganizationModuleRow[];
  organizationMembers: OrganizationMemberRow[];
  hasOrgStaffAccess: boolean;
  userId: string;
  priorityStart: number;
  includeDeferred: boolean;
  includeTableRows: boolean;
  idPrefix?: string;
}): WarmupJob[] {
  const jobs: WarmupJob[] = [];
  const projectIds = input.projectsInOrg.map((p) => p.id);
  const prefix = input.idPrefix ?? "";

  jobs.push({
    id: `${prefix}activity:${input.organizationId}`,
    priority: input.priorityStart,
    run: () =>
      prefetchActivityLogsIfNeeded({
        organizationId: input.organizationId,
        projectIds,
      }),
  });

  if (input.includeDeferred && input.projectsInOrg.length > 0) {
    jobs.push({
      id: `${prefix}deferred:${input.organizationId}:${input.selectedProjectId ?? "org"}`,
      priority: input.priorityStart + 1,
      run: () =>
        prefetchWorkspaceDeferredPayloadIfNeeded({
          organizationId: input.organizationId,
          selectedProjectId: input.selectedProjectId,
          projectsInOrg: input.projectsInOrg as ProjectRow[],
          organizationModules: organizationModulesForOrg(
            input.organizationModules,
            input.organizationId
          ),
          organizationMembers: input.organizationMembers,
        }),
    });
  }

  const inboxStart =
    input.priorityStart + (input.includeDeferred ? 2 : 1);
  jobs.push(
    ...buildChatInboxWarmupJobs({
      organizationId: input.organizationId,
      selectedProjectId: input.selectedProjectId,
      projectsInOrg: input.projectsInOrg,
      virtualTables: input.virtualTables,
      hasOrgStaffAccess: input.hasOrgStaffAccess,
      userId: input.userId,
      priorityStart: inboxStart,
      idPrefix: prefix,
    })
  );

  if (input.includeTableRows) {
    const tableStart = inboxStart + TABLE_ROWS_PRIORITY;
    jobs.push(
      ...buildTableRowsWarmupJobs({
        organizationId: input.organizationId,
        selectedProjectId: input.selectedProjectId,
        virtualTables: input.virtualTables,
        hasOrgStaffAccess: input.hasOrgStaffAccess,
        priorityStart: tableStart,
        idPrefix: prefix,
      })
    );
  }

  return jobs;
}

export type WorkspaceWarmupInput = {
  userId: string;
  organizationId: string;
  selectedProjectId: string | null;
  projects: { id: string; organization_id: string }[];
  organizations: { id: string }[];
  organizationMembers: OrganizationMemberRow[];
  organizationModules: OrganizationModuleRow[];
  virtualTables: VirtualTableRow[];
  hasOrgStaffAccess: boolean;
};

export function startWorkspaceWarmup(input: WorkspaceWarmupInput): () => void {
  if (!input.organizationId || !input.userId) return () => {};

  resetWarmupSessionBudget();

  const projectsInOrg = projectsInOrganization(
    input.projects,
    input.organizationId
  );

  const jobs: WarmupJob[] = buildOrgWarmupJobs({
    organizationId: input.organizationId,
    selectedProjectId: input.selectedProjectId,
    projectsInOrg,
    virtualTables: input.virtualTables,
    organizationModules: input.organizationModules,
    organizationMembers: input.organizationMembers,
    hasOrgStaffAccess: input.hasOrgStaffAccess,
    userId: input.userId,
    priorityStart: 0,
    includeDeferred: true,
    includeTableRows: true,
  });

  let otherOrgPriority = MULTI_ORG_BASE_PRIORITY;
  for (const org of input.organizations) {
    if (org.id === input.organizationId) continue;
    const otherProjects = projectsInOrganization(input.projects, org.id);
    if (otherProjects.length === 0) continue;

    const staff = memberHasOrgStaffAccess(
      input.organizationMembers,
      input.userId,
      org.id
    );
    if (!staff && otherProjects.length === 0) continue;

    jobs.push(
      ...buildOrgWarmupJobs({
        organizationId: org.id,
        selectedProjectId: otherProjects[0]?.id ?? null,
        projectsInOrg: otherProjects,
        virtualTables: input.virtualTables,
        organizationModules: input.organizationModules,
        organizationMembers: input.organizationMembers,
        hasOrgStaffAccess: staff,
        userId: input.userId,
        priorityStart: otherOrgPriority,
        includeDeferred: false,
        includeTableRows: false,
        idPrefix: `other:`,
      })
    );
    otherOrgPriority += 10;
  }

  return enqueueWarmupJobs(jobs);
}
