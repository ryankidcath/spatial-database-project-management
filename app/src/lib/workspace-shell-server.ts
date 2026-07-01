import type { SupabaseClient } from "@supabase/supabase-js";
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
import type { WorkspaceShellPayload } from "@/lib/workspace-shell-types";

/** Muat shell workspace (org, project, modul, vtables) — dipakai page & server action. */
export async function fetchWorkspaceShell(
  supabase: SupabaseClient
): Promise<WorkspaceShellPayload> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const membershipBootstrapPromise = user?.id
    ? (async (): Promise<boolean> => {
        const [{ count: membershipCount }, { count: orgMembershipCount }] =
          await Promise.all([
            supabase
              .schema("core_pm")
              .from("project_members")
              .select("project_id", { count: "exact", head: true })
              .eq("user_id", user.id),
            supabase
              .schema("core_pm")
              .from("organization_members")
              .select("organization_id", { count: "exact", head: true })
              .eq("user_id", user.id),
          ]);
        if ((membershipCount ?? 0) === 0 && (orgMembershipCount ?? 0) === 0) {
          await supabase.schema("core_pm").rpc("join_demo_org_projects");
          return true;
        }
        return false;
      })()
    : Promise.resolve(false);

  const fetchProjects = () =>
    supabase
      .schema("core_pm")
      .from("projects")
      .select("id, name, key, organization_id, description, hierarchy_labels")
      .is("deleted_at", null)
      .eq("is_archived", false)
      .order("name");

  const [{ data: projectsInitial, error: projectsError }, joinedDemo] =
    await Promise.all([fetchProjects(), membershipBootstrapPromise]);

  let projects = projectsInitial;
  if (joinedDemo) {
    const { data: projectsAfterDemo } = await fetchProjects();
    projects = projectsAfterDemo;
  }

  const projectList = (projects ?? []) as ProjectRow[];
  const allProjectIds = projectList.map((p) => p.id);
  const orgIds = [
    ...new Set(projectList.map((p) => p.organization_id).filter(Boolean)),
  ];

  const { data: myOrgMembershipsRaw, error: orgMembersError } = user?.id
    ? await supabase
        .schema("core_pm")
        .from("organization_members")
        .select("organization_id, user_id, role, joined_at")
        .eq("user_id", user.id)
    : { data: [] as OrganizationMemberRow[], error: null };

  const organizationMembers = (myOrgMembershipsRaw ??
    []) as OrganizationMemberRow[];

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
    { data: projectMembersRaw, error: projectMembersError },
    { data: registryRaw, error: registryError },
    { data: orgModulesRaw, error: orgModulesError },
  ] = await Promise.all([
    allProjectIds.length > 0
      ? supabase
          .schema("core_pm")
          .from("project_members")
          .select("project_id, user_id, role, joined_at")
          .in("project_id", allProjectIds)
      : Promise.resolve({ data: [] as ProjectMemberRow[], error: null }),
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
    ((profilesRaw ?? []) as Array<{ id: string; display_name: string | null }>).map(
      (p) => [p.id, p.display_name]
    )
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

  const vtableResults = await Promise.all([
    allProjectIds.length > 0
      ? supabase
          .schema("core_pm")
          .from("virtual_tables")
          .select(
            "id, project_id, organization_id, slug, display_name, description, icon, sort_order, created_by, created_at"
          )
          .in("project_id", allProjectIds)
          .is("deleted_at", null)
          .order("sort_order")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as VirtualTableRow[], error: null }),
    orgIds.length > 0
      ? supabase
          .schema("core_pm")
          .from("virtual_tables")
          .select(
            "id, project_id, organization_id, slug, display_name, description, icon, sort_order, created_by, created_at"
          )
          .in("organization_id", orgIds)
          .is("deleted_at", null)
          .is("project_id", null)
          .order("sort_order")
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as VirtualTableRow[], error: null }),
  ]);
  const vtablesRaw = vtableResults.flatMap(
    (r) => (r.data ?? []) as VirtualTableRow[]
  );
  const vtablesErr = vtableResults.find((r) => r.error)?.error ?? null;

  const vtableSeenIds = new Set<string>();
  const virtualTables: VirtualTableRow[] = [];
  for (const vt of vtablesRaw) {
    if (!vtableSeenIds.has(vt.id)) {
      vtableSeenIds.add(vt.id);
      virtualTables.push(vt);
    }
  }

  const vtableIds = virtualTables.map((t) => t.id);
  const { data: vcolsRaw, error: vcolsErr } =
    vtableIds.length > 0
      ? await supabase
          .schema("core_pm")
          .from("virtual_columns")
          .select(
            "id, table_id, slug, display_name, data_type, position, is_required, config"
          )
          .in("table_id", vtableIds)
          .order("position")
      : { data: [] as VirtualColumnRow[], error: null };

  const virtualColumns = (vcolsRaw ?? []) as VirtualColumnRow[];

  const fetchError =
    projectsError?.message ??
    orgsError?.message ??
    projectMembersError?.message ??
    profilesError?.message ??
    registryError?.message ??
    orgModulesError?.message ??
    vtablesErr?.message ??
    vcolsErr?.message ??
    orgMembersError?.message ??
    null;

  return {
    organizations: (organizations ?? []) as OrganizationRow[],
    projects: projectList,
    projectMembers,
    organizationMembers,
    moduleRegistry,
    organizationModules,
    virtualTables,
    virtualColumns,
    userEmail: user?.email ?? null,
    userId: user?.id ?? null,
    fetchError,
  };
}
