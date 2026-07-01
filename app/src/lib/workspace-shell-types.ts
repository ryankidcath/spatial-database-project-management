import type {
  OrganizationMemberRow,
  OrganizationRow,
  ProjectMemberRow,
  ProjectRow,
} from "@/app/workspace-client";
import type {
  ModuleRegistryRow,
  OrganizationModuleRow,
} from "@/app/workspace-modules";
import type {
  VirtualColumnRow,
  VirtualTableRow,
} from "@/app/virtual-table-types";

/** Payload shell workspace (PR-C / PR-G) — tanpa deferred Map/PLM/aktivitas server. */
export type WorkspaceShellPayload = {
  organizations: OrganizationRow[];
  projects: ProjectRow[];
  projectMembers: ProjectMemberRow[];
  organizationMembers: OrganizationMemberRow[];
  moduleRegistry: ModuleRegistryRow[];
  organizationModules: OrganizationModuleRow[];
  virtualTables: VirtualTableRow[];
  virtualColumns: VirtualColumnRow[];
  userEmail: string | null;
  userId: string | null;
  fetchError: string | null;
};
