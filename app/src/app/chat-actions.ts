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
): Promise<
  ChatActionResult<{
    tableId: string;
    pathSegments: string[];
    rowPayload: Record<string, unknown>;
    relationLabels: Record<string, string>;
  }>
> {
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
      tableId,
      rowPayload: payload,
      relationLabels,
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

export type ChatStaticRoomsUnread = {
  organizationUnread: number;
  projectUnread: number;
};

/** Unread room organisasi + proyek (bukan tabel/baris). */
export async function fetchChatStaticRoomsUnreadCountAction(input: {
  organizationId: string;
  projectId?: string | null;
}): Promise<ChatActionResult<ChatStaticRoomsUnread>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  if (!input.organizationId) {
    return {
      error: null,
      data: { organizationUnread: 0, projectUnread: 0 },
    };
  }

  const { data, error } = await supabase.schema("core_pm").rpc(
    "get_chat_static_rooms_unread_count",
    {
      p_organization_id: input.organizationId,
      p_project_id: input.projectId ?? null,
    }
  );

  if (error) return { error: error.message };

  const row = (data ?? [])[0] as
    | {
        organization_unread: number;
        project_unread: number;
      }
    | undefined;

  return {
    error: null,
    data: {
      organizationUnread: Number(row?.organization_unread ?? 0),
      projectUnread: Number(row?.project_unread ?? 0),
    },
  };
}

export type VirtualTableChatUnreadRow = {
  virtualRowId: string;
  unreadCount: number;
  latestMessageAt: string;
};

export type ChatInboxActiveRowRoom = {
  virtualRowId: string;
  virtualTableId: string;
  tableDisplayName: string;
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  rowPayload: Record<string, unknown>;
};

export type ChatInboxActiveRowRoomsPage = {
  rows: ChatInboxActiveRowRoom[];
  totalCount: number;
};

const INBOX_ROW_PAGE_SIZE = 25;

/** Obrolan baris aktif (punya pesan) dalam scope tabel, paginated. */
export async function fetchChatInboxActiveRowRoomsAction(input: {
  tableIds: string[];
  limit?: number;
  offset?: number;
}): Promise<ChatActionResult<ChatInboxActiveRowRoomsPage>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const ids = [...new Set(input.tableIds.filter(Boolean))];
  if (ids.length === 0) {
    return { error: null, data: { rows: [], totalCount: 0 } };
  }

  const limit = input.limit ?? INBOX_ROW_PAGE_SIZE;
  const offset = input.offset ?? 0;

  const { data, error } = await supabase.schema("core_pm").rpc(
    "get_chat_inbox_active_row_rooms",
    { p_table_ids: ids, p_limit: limit, p_offset: offset }
  );

  if (error) return { error: error.message };

  let totalCount = 0;
  const rows: ChatInboxActiveRowRoom[] = (data ?? []).map((row: unknown) => {
    const r = row as {
      virtual_row_id: string;
      virtual_table_id: string;
      table_display_name: string;
      unread_count: number;
      last_message_at: string;
      last_message_body: string | null;
      row_payload: Record<string, unknown>;
      total_count: number;
    };
    totalCount = Number(r.total_count);
    return {
      virtualRowId: String(r.virtual_row_id),
      virtualTableId: String(r.virtual_table_id),
      tableDisplayName: String(r.table_display_name),
      unreadCount: Number(r.unread_count),
      lastMessageAt: String(r.last_message_at),
      lastMessagePreview:
        typeof r.last_message_body === "string" && r.last_message_body.trim()
          ? r.last_message_body.trim()
          : null,
      rowPayload: (r.row_payload ?? {}) as Record<string, unknown>,
    };
  });

  return { error: null, data: { rows, totalCount } };
}

export type VirtualRowChatContext = {
  tableId: string;
  pathSegments: string[];
  rowPayload: Record<string, unknown>;
  relationLabels: Record<string, string>;
};

/** Judul breadcrumb untuk banyak baris sekaligus (inbox). */
export async function resolveVirtualRowChatContextsBatchAction(
  virtualRowIds: string[]
): Promise<ChatActionResult<Record<string, VirtualRowChatContext>>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const ids = [...new Set(virtualRowIds.filter(Boolean))];
  if (ids.length === 0) {
    return { error: null, data: {} };
  }

  const { data: rowRows, error: rowErr } = await supabase
    .schema("core_pm")
    .from("virtual_rows")
    .select("id, table_id, payload")
    .in("id", ids)
    .is("deleted_at", null);

  if (rowErr) return { error: rowErr.message };
  if (!rowRows?.length) return { error: null, data: {} };

  const tableIds = [...new Set(rowRows.map((r) => String(r.table_id)))];

  const { data: tables, error: tableErr } = await supabase
    .schema("core_pm")
    .from("virtual_tables")
    .select("id, display_name, project_id, organization_id")
    .in("id", tableIds)
    .is("deleted_at", null);

  if (tableErr) return { error: tableErr.message };

  const tableById = new Map(
    (tables ?? []).map((t) => [String(t.id), t])
  );

  const { data: columns, error: colErr } = await supabase
    .schema("core_pm")
    .from("virtual_columns")
    .select("table_id, slug, display_name, data_type, position")
    .in("table_id", tableIds)
    .order("position");

  if (colErr) return { error: colErr.message };

  const colsByTableId = new Map<string, VirtualColumnForMapPopup[]>();
  for (const c of columns ?? []) {
    const tid = String(c.table_id);
    const list = colsByTableId.get(tid) ?? [];
    list.push({
      slug: String(c.slug),
      display_name: String(c.display_name),
      data_type: String(c.data_type) as VirtualColumnDataType,
      position: Number(c.position),
    });
    colsByTableId.set(tid, list);
  }

  const relationIds: string[] = [];
  for (const row of rowRows) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const tableCols = colsByTableId.get(String(row.table_id)) ?? [];
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
  }

  let relationLabels: Record<string, string> = {};
  if (relationIds.length > 0) {
    const resolved = await resolveRelationLabelsAction(relationIds);
    if (resolved.error) return { error: resolved.error };
    relationLabels = resolved.labels;
  }

  const projectIds = [
    ...new Set(
      (tables ?? [])
        .map((t) => (t.project_id != null ? String(t.project_id) : null))
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const projectNameById = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: projects, error: projErr } = await supabase
      .schema("core_pm")
      .from("projects")
      .select("id, name")
      .in("id", projectIds);
    if (projErr) return { error: projErr.message };
    for (const p of projects ?? []) {
      projectNameById.set(String(p.id), String(p.name));
    }
  }

  const out: Record<string, VirtualRowChatContext> = {};
  for (const row of rowRows) {
    const rowId = String(row.id);
    const tableId = String(row.table_id);
    const table = tableById.get(tableId);
    if (!table) continue;

    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const tableCols = colsByTableId.get(tableId) ?? [];
    const projectId =
      table.project_id != null ? String(table.project_id) : null;
    const projectName = projectId
      ? (projectNameById.get(projectId) ?? null)
      : null;

    const rowLabel = pickMapRowTitle(
      payload,
      tableCols,
      relationLabels,
      rowId
    );

    out[rowId] = {
      tableId,
      rowPayload: payload,
      relationLabels,
      pathSegments: buildChatRowPathSegments({
        projectName,
        tableDisplayName: String(table.display_name),
        rowLabel,
      }),
    };
  }

  return { error: null, data: out };
}

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

function inboxKeyForChatRoom(row: {
  scope_type: string;
  project_id: string | null;
  virtual_row_id: string | null;
  virtual_table_id: string | null;
}): string | null {
  if (row.scope_type === "organization") return "org";
  if (row.scope_type === "project" && row.project_id) {
    return `project:${row.project_id}`;
  }
  if (row.scope_type === "virtual_table" && row.virtual_table_id) {
    return `table:${row.virtual_table_id}`;
  }
  if (row.scope_type === "virtual_row" && row.virtual_row_id) {
    return `row:${row.virtual_row_id}`;
  }
  return null;
}

export type ChatInboxRoomMeta = {
  lastActivityAt: string;
  lastMessagePreview: string | null;
};

/** Metadata inbox per entry (key → waktu + preview pesan terakhir). */
export async function fetchChatInboxRoomMetaAction(input: {
  organizationId: string;
}): Promise<ChatActionResult<Record<string, ChatInboxRoomMeta>>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const { data: rooms, error: roomsError } = await supabase
    .schema("core_pm")
    .from("chat_rooms")
    .select(
      "scope_type, project_id, virtual_row_id, virtual_table_id, created_at, last_message_at, last_message_body"
    )
    .eq("organization_id", input.organizationId);

  if (roomsError) return { error: roomsError.message };

  const out: Record<string, ChatInboxRoomMeta> = {};
  for (const room of rooms ?? []) {
    const key = inboxKeyForChatRoom({
      scope_type: String(room.scope_type),
      project_id: room.project_id != null ? String(room.project_id) : null,
      virtual_row_id:
        room.virtual_row_id != null ? String(room.virtual_row_id) : null,
      virtual_table_id:
        room.virtual_table_id != null ? String(room.virtual_table_id) : null,
    });
    if (!key) continue;
    const body =
      typeof room.last_message_body === "string" && room.last_message_body.trim()
        ? room.last_message_body.trim()
        : null;
    out[key] = {
      lastActivityAt:
        room.last_message_at != null
          ? String(room.last_message_at)
          : String(room.created_at),
      lastMessagePreview: body,
    };
  }

  return { error: null, data: out };
}

/** @deprecated Gunakan fetchChatInboxRoomMetaAction */
export async function fetchChatInboxActivityAtAction(input: {
  organizationId: string;
}): Promise<ChatActionResult<Record<string, string>>> {
  const res = await fetchChatInboxRoomMetaAction(input);
  if (res.error || !res.data) return { error: res.error, data: undefined };
  const out: Record<string, string> = {};
  for (const [key, meta] of Object.entries(res.data)) {
    out[key] = meta.lastActivityAt;
  }
  return { error: null, data: out };
}

/** Kunci inbox (`org`, `project:…`, `table:…`, `row:…`) dengan mention belum dibaca. */
export async function fetchChatInboxUnreadMentionKeysAction(input: {
  organizationId: string;
}): Promise<ChatActionResult<string[]>> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const { data, error } = await supabase.schema("core_pm").rpc(
    "get_chat_inbox_unread_mention_keys",
    { p_organization_id: input.organizationId }
  );

  if (error) return { error: error.message };

  const keys = ((data ?? []) as { inbox_key?: string }[])
    .map((row) =>
      typeof row.inbox_key === "string" ? row.inbox_key : null
    )
    .filter((k): k is string => Boolean(k));

  return { error: null, data: keys };
}
