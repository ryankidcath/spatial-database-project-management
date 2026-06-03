"use server";

import { revalidatePath } from "next/cache";
import { buildChatRowPathSegments } from "@/lib/chat-row-context";
import {
  pickMapRowTitle,
  type VirtualColumnForMapPopup,
} from "@/lib/virtual-table-map-popup";
import type { VirtualColumnDataType } from "./virtual-table-types";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveRelationLabelsAction } from "./virtual-table-actions";
import type { ChatAttachmentRef, ChatScopeType } from "./chat-types";

export type ChatActionResult<T = void> =
  | { error: null; data: T }
  | { error: string; data?: undefined };

export async function getOrCreateChatRoomAction(input: {
  scopeType: ChatScopeType;
  organizationId: string;
  projectId?: string | null;
  virtualRowId?: string | null;
  virtualTableId?: string | null;
}): Promise<ChatActionResult<{ roomId: string }>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const { data, error } = await supabase.schema("core_pm").rpc("get_or_create_chat_room", {
    p_scope_type: input.scopeType,
    p_organization_id: input.organizationId,
    p_project_id: input.projectId ?? null,
    p_virtual_row_id: input.virtualRowId ?? null,
    p_virtual_table_id: input.virtualTableId ?? null,
  });

  if (error) return { error: error.message };
  if (!data) return { error: "Room tidak dibuat" };
  return { error: null, data: { roomId: String(data) } };
}

export async function sendChatMessageAction(input: {
  roomId: string;
  body: string;
  attachmentRefs?: ChatAttachmentRef[];
}): Promise<ChatActionResult<{ messageId: string }>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const body = input.body.trim();
  if (!body) return { error: "Pesan tidak boleh kosong" };

  const { data, error } = await supabase.schema("core_pm").rpc("send_chat_message", {
    p_room_id: input.roomId,
    p_body: body,
    p_attachment_refs: input.attachmentRefs ?? [],
  });

  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null, data: { messageId: String(data) } };
}

export async function markChatRoomReadAction(
  roomId: string
): Promise<ChatActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const { error } = await supabase.schema("core_pm").rpc("mark_chat_room_read", {
    p_room_id: roomId,
  });
  if (error) return { error: error.message };
  return { error: null, data: undefined };
}

export async function deleteChatMessageAction(
  messageId: string
): Promise<ChatActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const { error } = await supabase.schema("core_pm").rpc("delete_chat_message", {
    p_message_id: messageId,
  });
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { error: null, data: undefined };
}

/** Judul breadcrumb chat baris (project › tabel › label) untuk dialog / notifikasi. */
export async function resolveVirtualRowChatContextAction(
  virtualRowId: string
): Promise<ChatActionResult<{ pathSegments: string[] }>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const { data: row, error: rowErr } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, table_id, payload")
    .eq("id", virtualRowId)
    .is("deleted_at", null)
    .maybeSingle();

  if (rowErr) return { error: rowErr.message };
  if (!row) return { error: "Baris tidak ditemukan" };

  const tableId = String(row.table_id);
  const payload = (row.payload ?? {}) as Record<string, unknown>;

  const { data: table, error: tableErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("id, display_name, project_id, organization_id")
    .eq("id", tableId)
    .is("deleted_at", null)
    .maybeSingle();

  if (tableErr) return { error: tableErr.message };
  if (!table) return { error: "Tabel tidak ditemukan" };

  const { data: columns, error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("slug, display_name, data_type, position")
    .eq("table_id", tableId)
    .order("position");

  if (colErr) return { error: colErr.message };

  const tableCols: VirtualColumnForMapPopup[] = (columns ?? []).map((c) => ({
    slug: String(c.slug),
    display_name: String(c.display_name),
    data_type: String(c.data_type) as VirtualColumnDataType,
    position: Number(c.position),
  }));

  const relationIds: string[] = [];
  for (const col of tableCols) {
    if (col.data_type !== "relation") continue;
    const val = payload[col.slug];
    if (typeof val === "string" && val) relationIds.push(val);
    else if (Array.isArray(val)) {
      for (const item of val) {
        if (typeof item === "string" && item) relationIds.push(item);
      }
    }
  }

  let relationLabels: Record<string, string> = {};
  if (relationIds.length > 0) {
    const resolved = await resolveRelationLabelsAction(relationIds);
    if (resolved.error) return { error: resolved.error };
    relationLabels = resolved.labels;
  }

  let projectName: string | null = null;
  const projectId = table.project_id != null ? String(table.project_id) : null;
  if (projectId) {
    const { data: project, error: projErr } = await supabase
      .schema("core_pm")
      .from("projects")
      .select("name")
      .eq("id", projectId)
      .maybeSingle();
    if (projErr) return { error: projErr.message };
    projectName = project?.name != null ? String(project.name) : null;
  }

  const rowLabel = pickMapRowTitle(
    payload,
    tableCols,
    relationLabels,
    virtualRowId
  );

  return {
    error: null,
    data: {
      pathSegments: buildChatRowPathSegments({
        projectName,
        tableDisplayName: String(table.display_name),
        rowLabel,
      }),
    },
  };
}

export type VirtualTableChatUnreadCounts = {
  /** Room tabel + semua baris (badge sidebar). */
  totalByTableId: Record<string, number>;
  /** Hanya room chat tingkat tabel (tombol Chat tabel). */
  tableRoomByTableId: Record<string, number>;
};

/** Unread chat per virtual_table (baris + room tabel). */
export async function fetchVirtualTableChatUnreadCountsAction(
  tableIds: string[]
): Promise<ChatActionResult<VirtualTableChatUnreadCounts>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const ids = [...new Set(tableIds.filter(Boolean))];
  if (ids.length === 0) {
    return {
      error: null,
      data: { totalByTableId: {}, tableRoomByTableId: {} },
    };
  }

  const { data, error } = await supabase.schema("core_pm").rpc(
    "get_virtual_table_chat_unread_counts",
    { p_table_ids: ids }
  );

  if (error) return { error: error.message };

  const totalByTableId: Record<string, number> = {};
  const tableRoomByTableId: Record<string, number> = {};
  for (const row of data ?? []) {
    const r = row as {
      virtual_table_id: string;
      unread_count: number;
      table_room_unread_count: number;
    };
    const tid = String(r.virtual_table_id);
    const total = Number(r.unread_count);
    const tableOnly = Number(r.table_room_unread_count);
    if (tid && total > 0) totalByTableId[tid] = total;
    if (tid && tableOnly > 0) tableRoomByTableId[tid] = tableOnly;
  }
  return { error: null, data: { totalByTableId, tableRoomByTableId } };
}

export type VirtualTableChatUnreadRow = {
  virtualRowId: string;
  unreadCount: number;
  latestMessageAt: string;
};

/** Baris dengan chat belum dibaca dalam satu virtual_table. */
export async function fetchVirtualTableChatUnreadRowsAction(
  tableId: string
): Promise<ChatActionResult<VirtualTableChatUnreadRow[]>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  if (!tableId) {
    return { error: null, data: [] };
  }

  const { data, error } = await supabase.schema("core_pm").rpc(
    "get_virtual_table_chat_unread_rows",
    { p_table_id: tableId }
  );

  if (error) return { error: error.message };

  const out: VirtualTableChatUnreadRow[] = (data ?? []).map((row: unknown) => {
    const r = row as {
      virtual_row_id: string;
      unread_count: number;
      latest_message_at: string;
    };
    return {
      virtualRowId: String(r.virtual_row_id),
      unreadCount: Number(r.unread_count),
      latestMessageAt: String(r.latest_message_at),
    };
  });
  return { error: null, data: out };
}
