"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { OrganizationMemberRow, ProjectRow } from "./workspace-client";
import type { OrganizationModuleRow } from "./workspace-modules";
import type { WorkspaceDeferredPayload } from "@/lib/workspace-bootstrap-types";
import { fetchWorkspaceDeferredPayload } from "@/lib/workspace-deferred-payload-server";

export async function fetchWorkspaceDeferredPayloadAction(input: {
  organizationId: string;
  selectedProjectId: string | null;
  scopedProjectIds: string[];
  organizationModules: OrganizationModuleRow[];
  organizationMembers: OrganizationMemberRow[];
  projectList: ProjectRow[];
}): Promise<{ error: string | null; data: WorkspaceDeferredPayload | null }> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { error: "Supabase tidak dikonfigurasi", data: null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Belum masuk", data: null };
  }

  const hasOrgStaffInSelectedOrg = input.organizationMembers.some(
    (m) =>
      m.organization_id === input.organizationId &&
      (m.role === "owner" || m.role === "admin" || m.role === "staff")
  );

  const data = await fetchWorkspaceDeferredPayload(supabase, {
    selectedOrgId: input.organizationId,
    selectedProjectId: input.selectedProjectId,
    scopedProjectIds: input.scopedProjectIds,
    orgIds: [],
    projectList: input.projectList,
    hasOrgStaffInSelectedOrg,
    organizationModules: input.organizationModules,
    userId: user.id,
  });

  return { error: data.fetchError, data };
}
