"use server";

export async function writeProjectAuditLog(
  supabase: any,
  args: {
    projectId: string;
    actorUserId: string;
    action: string;
    entity: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const { data: projectRow } = await supabase
    .schema("core_pm")
    .from("projects")
    .select("organization_id")
    .eq("id", args.projectId)
    .is("deleted_at", null)
    .maybeSingle();
  const organizationId =
    projectRow && typeof projectRow.organization_id === "string"
      ? projectRow.organization_id
      : null;
  if (!organizationId) return;
  await supabase.schema("core_pm").from("audit_log").insert({
    organization_id: organizationId,
    project_id: args.projectId,
    actor_user_id: args.actorUserId,
    action: args.action,
    entity: args.entity,
    entity_id: args.entityId,
    payload: args.payload ?? {},
  });
}

export async function writeUserAuthAuditLog(
  supabase: any,
  args: {
    actorUserId: string;
    action: "user_logged_in" | "user_logged_out";
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const { data: memberships } = await supabase
    .schema("core_pm")
    .from("project_members")
    .select("project_id")
    .eq("user_id", args.actorUserId)
    .limit(1);
  const projectId =
    Array.isArray(memberships) && memberships.length > 0
      ? String(memberships[0]?.project_id ?? "")
      : "";
  if (!projectId) return;
  const { data: projectRow } = await supabase
    .schema("core_pm")
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  const organizationId =
    projectRow && typeof projectRow.organization_id === "string"
      ? projectRow.organization_id
      : null;
  if (!organizationId) return;
  await supabase.schema("core_pm").from("audit_log").insert({
    organization_id: organizationId,
    project_id: projectId,
    actor_user_id: args.actorUserId,
    action: args.action,
    entity: "auth_session",
    entity_id: args.actorUserId,
    payload: args.payload ?? {},
  });
}
