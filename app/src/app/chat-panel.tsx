"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Trash2 } from "lucide-react";
import { RowChatContextPath } from "@/components/row-chat-context-path";
import { Button } from "@/components/ui/button";
import { ChatMentionSuggestions } from "@/components/chat-mention-suggestions";
import { useChatMentionAutocomplete } from "@/hooks/use-chat-mention-autocomplete";
import { dispatchChatUnreadInvalidate } from "@/lib/chat-unread-invalidate";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  formatChatBodyForDisplay,
  formatMentionToken,
  messageMentionsUser,
} from "@/lib/chat-mention";
import { getMentionTriggerAtCursor } from "@/lib/chat-mention-autocomplete";
import { escapeHtml } from "@/lib/chat-mention";
import {
  deleteChatMessageAction,
  getOrCreateChatRoomAction,
  markChatRoomReadAction,
  sendChatMessageAction,
} from "./chat-actions";
import type {
  ChatAttachmentRef,
  ChatMessageRow,
  ChatMentionOption,
  ChatScopeType,
} from "./chat-types";

const PAGE_SIZE = 50;

type Props = {
  scopeType: ChatScopeType;
  organizationId: string;
  projectId?: string | null;
  virtualRowId?: string | null;
  virtualTableId?: string | null;
  title: string;
  /** Breadcrumb project › tabel › baris (menggantikan title di header jika ada). */
  contextPathSegments?: string[];
  subtitle?: string;
  userId: string;
  /** Untuk deteksi mention @email di body. */
  userEmail?: string | null;
  authorNameByUserId: Map<string, string>;
  mentionOptions?: ChatMentionOption[];
  fileAttachmentOptions?: ChatAttachmentRef[];
  isOrgAdmin?: boolean;
  /** Di dialog chat baris: tanpa kartu/border dan tanpa header (breadcrumb di dialog). */
  embedded?: boolean;
  onUnreadCountChange?: (count: number) => void;
  /** Setelah mark read (chat baris) — refresh badge unread di sidebar tabel. */
  onInvalidateTableUnread?: () => void;
  className?: string;
};

function parseAttachmentRefs(raw: unknown): ChatAttachmentRef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const o = x as Record<string, unknown>;
      const label = String(o.label ?? "").trim();
      const url = String(o.url ?? "").trim();
      if (!label || !url) return null;
      return { label, url };
    })
    .filter((x): x is ChatAttachmentRef => x !== null);
}

export function ChatPanel({
  scopeType,
  organizationId,
  projectId,
  virtualRowId,
  virtualTableId,
  title,
  contextPathSegments,
  subtitle,
  userId,
  userEmail = null,
  authorNameByUserId,
  mentionOptions = [],
  fileAttachmentOptions = [],
  isOrgAdmin = false,
  embedded = false,
  onUnreadCountChange,
  onInvalidateTableUnread,
  className = "",
}: Props) {
  const invalidateTableUnreadIfRow = useCallback(() => {
    if (scopeType === "virtual_row" || scopeType === "virtual_table") {
      onInvalidateTableUnread?.();
    }
  }, [scopeType, onInvalidateTableUnread]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [selectedFileUrl, setSelectedFileUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasOlder, setHasOlder] = useState(false);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const dedupedMentionOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: ChatMentionOption[] = [];
    for (const opt of mentionOptions) {
      const key = `${opt.kind}:${opt.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(opt);
    }
    return out;
  }, [mentionOptions]);

  const mentionAutocomplete = useChatMentionAutocomplete({
    draft,
    setDraft,
    options: dedupedMentionOptions,
    textareaRef,
    enabled: dedupedMentionOptions.length > 0,
  });

  const mentionLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const opt of dedupedMentionOptions) {
      m.set(formatMentionToken(opt), opt.label);
    }
    return m;
  }, [dedupedMentionOptions]);

  const unreadCount = useMemo(() => {
    if (!lastReadAt) {
      return messages.filter((msg) => msg.author_id !== userId).length;
    }
    return messages.filter(
      (msg) =>
        msg.author_id !== userId &&
        new Date(msg.created_at) > new Date(lastReadAt)
    ).length;
  }, [messages, lastReadAt, userId]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const ensureRoom = useCallback(async () => {
    const res = await getOrCreateChatRoomAction({
      scopeType,
      organizationId,
      projectId,
      virtualRowId,
      virtualTableId,
    });
    if (res.error || !res.data) {
      setError(res.error ?? "Room tidak dibuat");
      return null;
    }
    setRoomId(res.data.roomId);
    return res.data.roomId;
  }, [scopeType, organizationId, projectId, virtualRowId, virtualTableId]);

  const loadMessages = useCallback(
    async (rid: string, before?: string) => {
      const supabase = getBrowserSupabaseClient();
      if (!supabase) return;

      let q = supabase
        .schema("core_pm")
        .from("chat_messages")
        .select("id, room_id, author_id, body, attachment_refs, created_at")
        .eq("room_id", rid)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (before) {
        q = q.lt("created_at", before);
      }

      const { data, error: qErr } = await q;
      if (qErr) {
        setError(qErr.message);
        return;
      }

      const rows: ChatMessageRow[] = (data ?? []).map((row) => ({
        id: row.id,
        room_id: row.room_id,
        author_id: row.author_id,
        body: row.body,
        attachment_refs: parseAttachmentRefs(row.attachment_refs),
        created_at: row.created_at,
      }));

      if (before) {
        setMessages((prev) => [...rows.reverse(), ...prev]);
        setHasOlder(rows.length >= PAGE_SIZE);
      } else {
        setMessages(rows.reverse());
        setHasOlder(rows.length >= PAGE_SIZE);
      }
    },
    []
  );

  const loadReadState = useCallback(
    async (rid: string) => {
      const supabase = getBrowserSupabaseClient();
      if (!supabase) return;
      const { data } = await supabase
        .schema("core_pm")
        .from("chat_room_reads")
        .select("last_read_at")
        .eq("room_id", rid)
        .eq("user_id", userId)
        .maybeSingle();
      setLastReadAt(data?.last_read_at ?? null);
    },
    [userId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const rid = await ensureRoom();
      if (!rid || cancelled) {
        setLoading(false);
        return;
      }
      await Promise.all([loadMessages(rid), loadReadState(rid)]);
      await markChatRoomReadAction(rid);
      setLastReadAt(new Date().toISOString());
      invalidateTableUnreadIfRow();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [ensureRoom, loadMessages, loadReadState, invalidateTableUnreadIfRow]);

  useEffect(() => {
    if (!roomId) return;
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const channel = supabase
      .channel(`chat:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "core_pm",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const msg: ChatMessageRow = {
            id: String(row.id),
            room_id: String(row.room_id),
            author_id: String(row.author_id),
            body: String(row.body),
            attachment_refs: parseAttachmentRefs(row.attachment_refs),
            created_at: String(row.created_at),
          };
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
          if (msg.author_id !== userId) {
            dispatchChatUnreadInvalidate();
            void markChatRoomReadAction(roomId).then(() => {
              setLastReadAt(new Date().toISOString());
              invalidateTableUnreadIfRow();
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "core_pm",
          table: "chat_messages",
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const old = payload.old as { id?: string };
          if (old.id) {
            setMessages((prev) => prev.filter((m) => m.id !== old.id));
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, userId, invalidateTableUnreadIfRow]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const insertMention = (opt: ChatMentionOption) => {
    const trigger = getMentionTriggerAtCursor(
      draft,
      textareaRef.current?.selectionStart ?? draft.length
    );
    if (trigger) {
      mentionAutocomplete.onSelect(opt, trigger);
    } else {
      const token = formatMentionToken(opt);
      setDraft((d) => (d ? `${d} ${token} ` : `${token} `));
    }
  };

  const handleSend = () => {
    if (!roomId || !draft.trim()) return;
    const body = draft.trim();
    const attachmentRefs: ChatAttachmentRef[] = [];
    if (selectedFileUrl) {
      const f = fileAttachmentOptions.find((x) => x.url === selectedFileUrl);
      if (f) attachmentRefs.push(f);
    }
    startTransition(async () => {
      const res = await sendChatMessageAction({
        roomId,
        body,
        attachmentRefs,
      });
      if (res.error) {
        setError(res.error);
        return;
      }
      setDraft("");
      setSelectedFileUrl("");
      mentionAutocomplete.onClose();
      setError(null);
      await markChatRoomReadAction(roomId);
      setLastReadAt(new Date().toISOString());
      dispatchChatUnreadInvalidate();
      invalidateTableUnreadIfRow();
    });
  };

  const handleDelete = (messageId: string) => {
    startTransition(async () => {
      const res = await deleteChatMessageAction(messageId);
      if (res.error) setError(res.error);
    });
  };

  const loadOlder = () => {
    if (!roomId || messages.length === 0) return;
    void loadMessages(roomId, messages[0]?.created_at);
  };

  const showPanelHeader = !embedded;

  return (
    <div
      className={
        embedded
          ? `flex min-h-0 flex-1 flex-col ${className}`
          : `flex min-h-[320px] flex-col rounded-xl border border-border bg-card shadow-sm ${className}`
      }
    >
      {showPanelHeader ? (
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {contextPathSegments && contextPathSegments.length > 0 ? (
                <RowChatContextPath segments={contextPathSegments} />
              ) : (
                <h3 className="text-sm font-semibold text-foreground">{title}</h3>
              )}
              {subtitle ? (
                <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {unreadCount > 0 ? (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
                {unreadCount} baru
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div
        ref={listRef}
        className={
          embedded
            ? "min-h-0 flex-1 space-y-3 overflow-y-auto py-2"
            : "min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3"
        }
        style={embedded ? undefined : { maxHeight: "min(50vh, 420px)" }}
      >
        {hasOlder ? (
          <button
            type="button"
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={loadOlder}
          >
            Muat pesan lebih lama
          </button>
        ) : null}
        {loading ? (
          <p className="text-sm text-muted-foreground">Memuat obrolan…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Belum ada pesan. Mulai diskusi di sini.
          </p>
        ) : (
          messages.map((msg) => {
            const isOwn = msg.author_id === userId;
            const canDelete = isOwn || isOrgAdmin;
            const mentionsMe =
              !isOwn && messageMentionsUser(msg.body, userId, userEmail);
            const displayBody = formatChatBodyForDisplay(
              msg.body,
              mentionLabelMap
            );
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {mentionsMe ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
                      Menyebut Anda
                    </span>
                  ) : null}
                  <span>
                    {authorNameByUserId.get(msg.author_id) ??
                      msg.author_id.slice(0, 8)}
                  </span>
                  <span>
                    {new Date(msg.created_at).toLocaleString("id-ID", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  {canDelete ? (
                    <button
                      type="button"
                      title="Hapus pesan"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={pending}
                      onClick={() => handleDelete(msg.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
                <div
                  className={`max-w-[92%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                    isOwn
                      ? "bg-primary text-primary-foreground"
                      : mentionsMe
                        ? "border-l-4 border-amber-500 bg-amber-50 text-foreground"
                        : "bg-muted text-foreground"
                  }`}
                >
                  {displayBody}
                  {msg.attachment_refs.length > 0 ? (
                    <ul className="mt-2 space-y-1 border-t border-white/20 pt-2 text-xs">
                      {msg.attachment_refs.map((a) => (
                        <li key={a.url}>
                          <a
                            href={a.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline"
                          >
                            {escapeHtml(a.label)}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div
        className={
          embedded
            ? "shrink-0 space-y-2 border-t border-border pt-3"
            : "border-t border-border px-4 py-3 space-y-2"
        }
      >
        {dedupedMentionOptions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            <span className="text-[10px] text-muted-foreground self-center">
              Sebut (@nama):
            </span>
            {dedupedMentionOptions.slice(0, 8).map((opt) => (
              <Button
                key={`${opt.kind}-${opt.id}`}
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[10px]"
                onClick={() => insertMention(opt)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        ) : null}
        {fileAttachmentOptions.length > 0 ? (
          <select
            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
            value={selectedFileUrl}
            onChange={(e) => setSelectedFileUrl(e.target.value)}
          >
            <option value="">Lampirkan file (opsional)</option>
            {fileAttachmentOptions.map((f) => (
              <option key={f.url} value={f.url}>
                {f.label}
              </option>
            ))}
          </select>
        ) : null}
        <div className="relative">
          {mentionAutocomplete.isOpen ? (
            <ChatMentionSuggestions
              suggestions={mentionAutocomplete.suggestions}
              activeIndex={mentionAutocomplete.activeIndex}
              query={mentionAutocomplete.trigger?.query ?? ""}
              onSelect={mentionAutocomplete.onSelect}
              onHover={mentionAutocomplete.setActiveIndex}
            />
          ) : null}
          <textarea
            ref={textareaRef}
            className="min-h-[72px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm"
            placeholder="Tulis pesan… ketik @ lalu nama untuk menyebut"
            value={draft}
            onChange={(e) =>
              mentionAutocomplete.onDraftChange(
                e.target.value,
                e.target.selectionStart
              )
            }
            onClick={mentionAutocomplete.syncCursorFromTextarea}
            onKeyUp={mentionAutocomplete.syncCursorFromTextarea}
            onSelect={mentionAutocomplete.syncCursorFromTextarea}
            onKeyDown={(e) => {
              if (mentionAutocomplete.onKeyDown(e)) return;
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground">
            Ctrl+Enter untuk kirim
          </span>
          <Button type="button" size="sm" disabled={pending || !draft.trim()} onClick={handleSend}>
            Kirim
          </Button>
        </div>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
