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
