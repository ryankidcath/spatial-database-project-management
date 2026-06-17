import type { SupabaseClient } from "@supabase/supabase-js";
import { pickMapRowTitle } from "@/lib/virtual-table-map-popup";
import type { VirtualColumnDataType } from "@/app/virtual-table-types";
import { writeOrgAuditLog, writeProjectAuditLog } from "./audit-log-actions";
import {
  dispatchWorkspaceNotification,
  type DispatchWorkspaceNotificationInput,
} from "./workspace-notification-dispatch";

export type VirtualTableScope = {
  tableId: string;
  displayName: string;
  organizationId: string;
  projectId: string | null;
};

export async function resolveVirtualTableScope(
  supabase: SupabaseClient,
  tableId: string
): Promise<VirtualTableScope | null> {
  const { data: tableRow } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("id, display_name, project_id, organization_id")
    .eq("id", tableId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!tableRow) return null;

  const row = tableRow as {
    id: string;
    display_name: string;
    project_id: string | null;
    organization_id: string | null;
  };

  let organizationId = row.organization_id;
  if (!organizationId && row.project_id) {
    const { data: projectRow } = await supabase
      .schema("core_pm")
      .from("projects")
      .select("organization_id")
      .eq("id", row.project_id)
      .is("deleted_at", null)
      .maybeSingle();
    organizationId =
      projectRow && typeof projectRow.organization_id === "string"
        ? projectRow.organization_id
        : null;
  }

  if (!organizationId) return null;

  return {
    tableId: row.id,
    displayName: row.display_name,
    organizationId,
    projectId: row.project_id,
  };
}

export async function writeVirtualTableAuditLog(
  supabase: SupabaseClient,
  scope: VirtualTableScope,
  args: {
    actorUserId: string;
    action: string;
    entity: string;
    entityId: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  if (scope.projectId) {
    await writeProjectAuditLog(supabase, {
      projectId: scope.projectId,
      actorUserId: args.actorUserId,
      action: args.action,
      entity: args.entity,
      entityId: args.entityId,
      payload: {
        virtual_table_id: scope.tableId,
        ...args.payload,
      },
    });
    return;
  }

  await writeOrgAuditLog(supabase, {
    organizationId: scope.organizationId,
    actorUserId: args.actorUserId,
    action: args.action,
    entity: args.entity,
    entityId: args.entityId,
    payload: {
      virtual_table_id: scope.tableId,
      ...args.payload,
    },
  });
}

export async function notifyVirtualTableMembers(
  supabase: SupabaseClient,
  scope: VirtualTableScope,
  actorUserId: string,
  input: Omit<
    DispatchWorkspaceNotificationInput,
    "organizationId" | "projectId" | "actorUserId"
  >
): Promise<void> {
  await dispatchWorkspaceNotification(supabase, {
    ...input,
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    actorUserId,
    payload: {
      virtual_table_id: scope.tableId,
      table_display_name: scope.displayName,
      ...input.payload,
    },
  });
}

type ColumnForRowLabel = {
  slug: string;
  display_name: string;
  data_type: string;
  position: number;
};

export function rowLabelFromPayload(
  payload: Record<string, unknown>,
  columns: ColumnForRowLabel[],
  rowId: string
): string {
  return pickMapRowTitle(
    payload,
    columns.map((c) => ({
      slug: c.slug,
      display_name: c.display_name,
      data_type: c.data_type as VirtualColumnDataType,
      position: c.position,
    })),
    {},
    rowId
  );
}

export function formatCellValueForNotification(
  value: unknown,
  dataType?: string
): string {
  if (value == null || value === "") return "—";
  switch (dataType) {
    case "checkbox":
      return value === true ? "Ya" : "Tidak";
    case "date":
      return String(value).slice(0, 10);
    case "number":
      return String(value);
    case "relation": {
      const ids = Array.isArray(value) ? value : [value];
      return ids.map(String).join(", ");
    }
    default:
      return String(value);
  }
}

export function cellValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function columnNotifyOnChange(
  config: Record<string, unknown> | null | undefined
): boolean {
  return config?.notify_on_change === true;
}

export async function flushDueCellNotifications(
  supabase: SupabaseClient
): Promise<void> {
  const { error } = await supabase
    .schema("core_pm")
    .rpc("flush_due_virtual_row_cell_notifications");
  if (error) {
    console.error("[flush_due_virtual_row_cell_notifications]", error.message);
  }
}
