import type { OrganizationModuleRow } from "@/app/workspace-modules";
import type { VirtualTableRow } from "@/app/virtual-table-types";

const ORG_STAFF_ROLES = new Set(["owner", "admin", "staff"]);

export function memberHasOrgStaffAccess(
  organizationMembers: {
    organization_id: string;
    user_id: string;
    role: string;
  }[],
  userId: string,
  organizationId: string
): boolean {
  return organizationMembers.some(
    (m) =>
      m.organization_id === organizationId &&
      m.user_id === userId &&
      ORG_STAFF_ROLES.has(m.role)
  );
}

export function projectsInOrganization(
  projects: { id: string; organization_id: string }[],
  organizationId: string
): { id: string; organization_id: string }[] {
  return projects.filter((p) => p.organization_id === organizationId);
}

export function organizationModulesForOrg(
  organizationModules: OrganizationModuleRow[],
  organizationId: string
): OrganizationModuleRow[] {
  return organizationModules.filter((m) => m.organization_id === organizationId);
}

export function virtualTablesForWarmupScope(
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
