import type { ChatAttachmentRef, ChatScopeType } from "@/app/chat-types";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";

export type ChatClientResult<T> =
  | { error: null; data: T }
  | { error: string; data?: undefined };

/** Kirim pesan langsung ke Supabase (tanpa round-trip server action Vercel). */
export async function sendChatMessageClient(input: {
  roomId: string;
  body: string;
  attachmentRefs?: ChatAttachmentRef[];
}): Promise<ChatClientResult<{ messageId: string }>> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const body = input.body.trim();
  if (!body) return { error: "Pesan tidak boleh kosong" };

  const { data, error } = await supabase.schema("core_pm").rpc("send_chat_message", {
    p_room_id: input.roomId,
    p_body: body,
    p_attachment_refs: input.attachmentRefs ?? [],
  });

  if (error) return { error: error.message };
  return { error: null, data: { messageId: String(data) } };
}

export async function markChatRoomReadClient(
  roomId: string
): Promise<ChatClientResult<void>> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const { error } = await supabase.schema("core_pm").rpc("mark_chat_room_read", {
    p_room_id: roomId,
  });
  if (error) return { error: error.message };
  return { error: null, data: undefined };
}

export async function getOrCreateChatRoomClient(input: {
  scopeType: ChatScopeType;
  organizationId: string;
  projectId?: string | null;
  virtualRowId?: string | null;
  virtualTableId?: string | null;
}): Promise<ChatClientResult<{ roomId: string }>> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

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

export type VirtualTableChatUnreadCountsClient = {
  totalByTableId: Record<string, number>;
  tableRoomByTableId: Record<string, number>;
};

/** Badge unread per tabel (browser → Supabase, sama jalur auth dengan kirim pesan). */
export async function fetchVirtualTableChatUnreadCountsClient(
  tableIds: string[]
): Promise<ChatClientResult<VirtualTableChatUnreadCountsClient>> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

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

export type ChatStaticRoomsUnreadClient = {
  organizationUnread: number;
  projectUnread: number;
};

export async function fetchChatStaticRoomsUnreadCountClient(input: {
  organizationId: string;
  projectId?: string | null;
}): Promise<ChatClientResult<ChatStaticRoomsUnreadClient>> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

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
    | { organization_unread: number; project_unread: number }
    | undefined;

  return {
    error: null,
    data: {
      organizationUnread: Number(row?.organization_unread ?? 0),
      projectUnread: Number(row?.project_unread ?? 0),
    },
  };
}

export type VirtualTableChatUnreadRowClient = {
  virtualRowId: string;
  unreadCount: number;
  latestMessageAt: string;
};

export async function fetchVirtualTableChatUnreadRowsClient(
  tableId: string
): Promise<ChatClientResult<VirtualTableChatUnreadRowClient[]>> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };
  if (!tableId) return { error: null, data: [] };

  const { data, error } = await supabase.schema("core_pm").rpc(
    "get_virtual_table_chat_unread_rows",
    { p_table_id: tableId }
  );
  if (error) return { error: error.message };

  const out: VirtualTableChatUnreadRowClient[] = (data ?? []).map(
    (row: unknown) => {
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
    }
  );
  return { error: null, data: out };
}

export type ChatInboxActiveRowRoomClient = {
  virtualRowId: string;
  virtualTableId: string;
  tableDisplayName: string;
  unreadCount: number;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  rowPayload: Record<string, unknown>;
};

export async function fetchChatInboxActiveRowRoomsClient(input: {
  tableIds: string[];
  limit?: number;
  offset?: number;
}): Promise<
  ChatClientResult<{ rows: ChatInboxActiveRowRoomClient[]; totalCount: number }>
> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const ids = [...new Set(input.tableIds.filter(Boolean))];
  if (ids.length === 0) {
    return { error: null, data: { rows: [], totalCount: 0 } };
  }

  const limit = input.limit ?? 25;
  const offset = input.offset ?? 0;

  const { data, error } = await supabase.schema("core_pm").rpc(
    "get_chat_inbox_active_row_rooms",
    { p_table_ids: ids, p_limit: limit, p_offset: offset }
  );
  if (error) return { error: error.message };

  let totalCount = 0;
  const rows: ChatInboxActiveRowRoomClient[] = (data ?? []).map(
    (row: unknown) => {
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
    }
  );

  return { error: null, data: { rows, totalCount } };
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

export type ChatInboxRoomMetaClient = {
  lastActivityAt: string;
  lastMessagePreview: string | null;
};

export async function fetchChatInboxRoomMetaClient(input: {
  organizationId: string;
}): Promise<ChatClientResult<Record<string, ChatInboxRoomMetaClient>>> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const { data: rooms, error: roomsError } = await supabase
    .schema("core_pm")
    .from("chat_rooms")
    .select(
      "scope_type, project_id, virtual_row_id, virtual_table_id, created_at, last_message_at, last_message_body"
    )
    .eq("organization_id", input.organizationId);

  if (roomsError) return { error: roomsError.message };

  const out: Record<string, ChatInboxRoomMetaClient> = {};
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

export async function fetchChatInboxUnreadMentionKeysClient(input: {
  organizationId: string;
}): Promise<ChatClientResult<string[]>> {
  const supabase = getBrowserSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

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
