"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { Send, Trash2 } from "lucide-react";
import { RowChatContextPath } from "@/components/row-chat-context-path";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMentionSuggestions } from "@/components/chat-mention-suggestions";
import { useChatMentionAutocomplete } from "@/hooks/use-chat-mention-autocomplete";
import { dispatchChatUnreadInvalidate } from "@/lib/chat-unread-invalidate";
import {
  getOrCreateChatRoomClient,
  markChatRoomReadClient,
  sendChatMessageClient,
} from "@/lib/chat-client";
import {
  OFFLINE_OUTBOX_CHAT_SENT_EVENT,
  isRetryableNetworkError,
  type OfflineOutboxChatSentDetail,
} from "@/lib/client-offline-outbox-contract";
import {
  enqueueOfflineChatSend,
  listOfflineOutboxChatItemsForRoom,
} from "@/lib/client-offline-outbox";
import { registerOfflineOutboxBackgroundSync } from "@/lib/client-offline-outbox-drain";
import {
  buildChatRoomCacheKey,
  getChatRoomCache,
  hydrateChatRoomCache,
  mergeChatMessageTail,
  setChatRoomCache,
} from "@/lib/chat-room-cache";
import {
  PUSH_CACHE_APPLIED_EVENT,
  type PushCacheAppliedDetail,
} from "@/lib/push-cache-contract";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  formatChatBodyForDisplay,
  formatMentionToken,
  messageMentionsUser,
} from "@/lib/chat-mention";
import { getMentionTriggerAtCursor } from "@/lib/chat-mention-autocomplete";
import { escapeHtml } from "@/lib/chat-mention";
import { useIsBelowMd } from "@/lib/use-media-query";
import { useVisualViewportLayout } from "@/lib/use-visual-viewport-layout";
import { cn } from "@/lib/utils";
import { useWorkspaceSpatialDataSyncOptional } from "./workspace-spatial-data-sync-context";
import { WORKSPACE_MOBILE_TAB_BAR_COMPOSER_PADDING } from "./workspace-mobile-tabs";
import {
  deleteChatMessageAction,
} from "./chat-actions";
import type {
  ChatAttachmentRef,
  ChatMessageRow,
  ChatMentionOption,
  ChatScopeType,
} from "./chat-types";

const PAGE_SIZE = 50;
const PENDING_MSG_PREFIX = "pending:";
const ROOM_POLL_MS = 20_000;
const SEND_CONFIRM_MS = 1_000;
const MARK_READ_RETRIES = 3;

/** Padding horizontal chat mobile — selaras header workspace (`px-4`). */
const MOBILE_CHAT_X = "px-4";

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
  /** Kunci cache inbox (`org`, `project:…`, `table:…`, `row:…`); default dari scope. */
  roomCacheKey?: string;
  /** Hanya mark-read + clear badge saat percakapan benar-benar terbuka (bukan panel tersembunyi). */
  conversationActive?: boolean;
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
  roomCacheKey: roomCacheKeyProp,
  conversationActive = true,
  className = "",
}: Props) {
  const cacheKey =
    roomCacheKeyProp ??
    buildChatRoomCacheKey({
      scopeType,
      projectId,
      virtualTableId,
      virtualRowId,
    });
  const initialCache = getChatRoomCache(cacheKey);

  const onInvalidateTableUnreadRef = useRef(onInvalidateTableUnread);
  onInvalidateTableUnreadRef.current = onInvalidateTableUnread;
  const conversationActiveRef = useRef(conversationActive);
  conversationActiveRef.current = conversationActive;

  const markRoomRead = useCallback(
    async (
      rid: string,
      options?: { notifyBadges?: boolean }
    ): Promise<boolean> => {
      const notifyBadges = options?.notifyBadges ?? conversationActiveRef.current;
      for (let attempt = 0; attempt < MARK_READ_RETRIES; attempt++) {
        const res = await markChatRoomReadClient(rid);
        if (!res.error) {
          setLastReadAt(new Date().toISOString());
          if (notifyBadges) {
            dispatchChatUnreadInvalidate();
            onInvalidateTableUnreadRef.current?.();
          }
          return true;
        }
        if (attempt < MARK_READ_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }
      return false;
    },
    []
  );
  const [roomId, setRoomId] = useState<string | null>(
    initialCache?.roomId ?? null
  );
  const [messages, setMessages] = useState<ChatMessageRow[]>(
    initialCache?.messages ?? []
  );
  const [lastReadAt, setLastReadAt] = useState<string | null>(
    initialCache?.lastReadAt ?? null
  );
  const [draft, setDraft] = useState("");
  const spatialSync = useWorkspaceSpatialDataSyncOptional();
  const [selectedFileUrl, setSelectedFileUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    (initialCache?.messages.length ?? 0) === 0
  );
  const [hasOlder, setHasOlder] = useState(initialCache?.hasOlder ?? false);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isBelowMd = useIsBelowMd();
  const { keyboardOpen: mobileKeyboardOpen } = useVisualViewportLayout();
  const mobileStickyComposer = embedded && isBelowMd;

  useLayoutEffect(() => {
    if (!mobileStickyComposer) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const minH = 44;
    const maxH = 160;
    const next = Math.min(Math.max(el.scrollHeight, minH), maxH);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxH ? "auto" : "hidden";
  }, [draft, mobileStickyComposer]);

  useEffect(() => {
    if (!conversationActive || !spatialSync?.pendingChatContext) return;
    setDraft((prev) =>
      prev.trim().length > 0 ? prev : spatialSync.pendingChatContext!
    );
    spatialSync.setPendingChatContext(null);
  }, [conversationActive, spatialSync]);

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

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const hasOlderRef = useRef(hasOlder);
  hasOlderRef.current = hasOlder;
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;
  const lastReadAtRef = useRef(lastReadAt);
  lastReadAtRef.current = lastReadAt;

  useLayoutEffect(() => {
    let cancelled = false;
    void hydrateChatRoomCache(cacheKey).then((cached) => {
      if (cancelled || !cached?.messages.length) return;
      setRoomId(cached.roomId);
      setMessages(cached.messages);
      setLastReadAt(cached.lastReadAt);
      setHasOlder(cached.hasOlder);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  useEffect(() => {
    const onPushCache = (event: Event) => {
      const detail = (event as CustomEvent<PushCacheAppliedDetail>).detail;
      if (detail.roomCacheKey !== cacheKey) return;
      void hydrateChatRoomCache(cacheKey).then((cached) => {
        if (!cached?.messages.length) return;
        setRoomId(cached.roomId);
        setMessages(cached.messages);
        setLastReadAt(cached.lastReadAt);
        setHasOlder(cached.hasOlder);
        setLoading(false);
      });
    };
    window.addEventListener(PUSH_CACHE_APPLIED_EVENT, onPushCache);
    return () =>
      window.removeEventListener(PUSH_CACHE_APPLIED_EVENT, onPushCache);
  }, [cacheKey]);

  useEffect(() => {
    if (!roomId) return;
    let cancelled = false;
    void listOfflineOutboxChatItemsForRoom(roomId).then((items) => {
      if (cancelled || items.length === 0) return;
      setMessages((prev) => {
        const next = [...prev];
        for (const item of items) {
          if (next.some((m) => m.id === item.clientMessageId)) continue;
          next.push({
            id: item.clientMessageId,
            room_id: item.roomId,
            author_id: userId,
            body: item.body,
            attachment_refs: item.attachmentRefs,
            created_at: new Date(item.createdAt).toISOString(),
          });
        }
        return next.sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
    });
    return () => {
      cancelled = true;
    };
  }, [roomId, userId]);

  useEffect(() => {
    const onChatSent = (event: Event) => {
      const detail = (event as CustomEvent<OfflineOutboxChatSentDetail>).detail;
      if (detail.roomId !== roomIdRef.current) return;
      setMessages((prev) =>
        prev.map((m) =>
          m.id === detail.clientMessageId ? { ...m, id: detail.messageId } : m
        )
      );
      setError(null);
      void markRoomRead(detail.roomId, { notifyBadges: true });
    };
    window.addEventListener(OFFLINE_OUTBOX_CHAT_SENT_EVENT, onChatSent);
    return () =>
      window.removeEventListener(OFFLINE_OUTBOX_CHAT_SENT_EVENT, onChatSent);
  }, [markRoomRead]);

  useEffect(() => {
    setChatRoomCache(cacheKey, {
      roomId: roomIdRef.current,
      messages: messagesRef.current,
      hasOlder: hasOlderRef.current,
      lastReadAt: lastReadAtRef.current,
    });
  }, [cacheKey, messages, hasOlder, roomId, lastReadAt]);

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  const ensureRoom = useCallback(async () => {
    const res = await getOrCreateChatRoomClient({
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

  const fetchMessagesPage = useCallback(
    async (
      rid: string,
      before?: string
    ): Promise<{ rows: ChatMessageRow[]; error?: string }> => {
      const supabase = getBrowserSupabaseClient();
      if (!supabase) return { rows: [] };

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
      if (qErr) return { rows: [], error: qErr.message };

      const rows: ChatMessageRow[] = (data ?? []).map((row) => ({
        id: row.id,
        room_id: row.room_id,
        author_id: row.author_id,
        body: row.body,
        attachment_refs: parseAttachmentRefs(row.attachment_refs),
        created_at: row.created_at,
      }));

      return { rows: rows.reverse() };
    },
    []
  );

  const loadMessages = useCallback(
    async (rid: string, before?: string) => {
      const { rows, error: fetchError } = await fetchMessagesPage(rid, before);
      if (fetchError) {
        setError(fetchError);
        return;
      }

      if (before) {
        setMessages((prev) => [...rows, ...prev]);
        setHasOlder(rows.length >= PAGE_SIZE);
      } else {
        setMessages((prev) =>
          prev.length > 0 ? mergeChatMessageTail(prev, rows) : rows
        );
        setHasOlder((prev) => rows.length >= PAGE_SIZE || prev);
      }
    },
    [fetchMessagesPage]
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
    const cached = getChatRoomCache(cacheKey);
    const hadCachedMessages = (cached?.messages.length ?? 0) > 0;

    (async () => {
      if (!hadCachedMessages) setLoading(true);
      setError(null);
      const rid = await ensureRoom();
      if (!rid || cancelled) {
        setLoading(false);
        return;
      }

      await loadMessages(rid);
      if (cancelled) return;

      await loadReadState(rid);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [cacheKey, ensureRoom, loadMessages, loadReadState]);

  useEffect(() => {
    if (!conversationActive || !roomId) return;
    void markRoomRead(roomId, { notifyBadges: true });
  }, [conversationActive, roomId, markRoomRead]);

  useEffect(() => {
    if (!roomId) return;
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    const ingestMessage = (msg: ChatMessageRow) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        const next = prev.filter(
          (m) =>
            !(
              m.id.startsWith(PENDING_MSG_PREFIX) &&
              m.author_id === msg.author_id &&
              m.body === msg.body
            )
        );
        return [...next, msg];
      });
    };

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
          ingestMessage(msg);
          if (msg.author_id !== userId && conversationActiveRef.current) {
            void markRoomRead(roomId, { notifyBadges: true });
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
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void loadMessages(roomId);
        }
      });

    const pollId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void loadMessages(roomId);
      }
    }, ROOM_POLL_MS);

    return () => {
      window.clearInterval(pollId);
      void supabase.removeChannel(channel);
    };
  }, [roomId, userId, loadMessages, markRoomRead]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
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
    const savedDraft = draft;
    const savedFileUrl = selectedFileUrl;
    const sendRoomId = roomId;
    const optimisticId = `${PENDING_MSG_PREFIX}${crypto.randomUUID()}`;
    const optimisticMsg: ChatMessageRow = {
      id: optimisticId,
      room_id: sendRoomId,
      author_id: userId,
      body,
      attachment_refs: attachmentRefs,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setDraft("");
    setSelectedFileUrl("");
    mentionAutocomplete.onClose();
    setError(null);

    void (async () => {
      const queueForRetry = async () => {
        await enqueueOfflineChatSend({
          roomId: sendRoomId,
          roomCacheKey: cacheKey,
          clientMessageId: optimisticId,
          body,
          attachmentRefs,
        });
        await registerOfflineOutboxBackgroundSync();
        setError("Pesan disimpan. Akan dikirim saat online.");
      };

      if (!navigator.onLine) {
        await queueForRetry();
        return;
      }

      const res = await sendChatMessageClient({
        roomId: sendRoomId,
        body,
        attachmentRefs,
      });
      if (res.error) {
        if (isRetryableNetworkError(res.error)) {
          await queueForRetry();
          return;
        }
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        setDraft(savedDraft);
        setSelectedFileUrl(savedFileUrl);
        setError(res.error);
        return;
      }

      const realId = res.data!.messageId;
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? { ...m, id: realId } : m))
      );

      await markRoomRead(sendRoomId, { notifyBadges: true });

      window.setTimeout(() => {
        const hasMsg = messagesRef.current.some((m) => m.id === realId);
        if (!hasMsg) void loadMessages(sendRoomId);
      }, SEND_CONFIRM_MS);
    })();
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

  const messageListInner = (
    <>
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
          const isPending = msg.id.startsWith(PENDING_MSG_PREFIX);
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
              className={`flex w-full min-w-0 max-w-full flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}
            >
              <div className="flex max-w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
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
                className={`max-w-[min(85%,20rem)] min-w-0 rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-all [overflow-wrap:anywhere] ${
                  isOwn
                    ? `bg-primary text-primary-foreground${isPending ? " opacity-80" : ""}`
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
              {isPending ? (
                <span className="text-[10px] text-muted-foreground">
                  Menunggu jaringan…
                </span>
              ) : null}
            </div>
          );
        })
      )}
      <div ref={bottomRef} />
    </>
  );

  return (
    <div
      className={
        embedded
          ? cn(
              "flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden",
              className
            )
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

      {embedded && !mobileStickyComposer ? (
        <ScrollArea className="min-h-0 min-w-0 flex-1" type="scroll">
          <div className="min-w-0 space-y-3 px-4 py-2">{messageListInner}</div>
        </ScrollArea>
      ) : (
        <div
          ref={listRef}
          className={
            mobileStickyComposer
              ? cn(
                  "pm-mobile-scroll min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-y-contain py-2",
                  "[-webkit-overflow-scrolling:touch]",
                  MOBILE_CHAT_X
                )
              : "pm-mobile-scroll min-h-0 min-w-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-y-contain px-4 py-3"
          }
          style={embedded ? undefined : { maxHeight: "min(50vh, 420px)" }}
        >
          {messageListInner}
        </div>
      )}
      <div
        className={cn(
          mobileStickyComposer
            ? cn(
                "z-10 w-full min-w-0 shrink-0 touch-none overscroll-none border-t border-border bg-card/95 backdrop-blur-sm",
                !mobileKeyboardOpen && WORKSPACE_MOBILE_TAB_BAR_COMPOSER_PADDING
              )
            : embedded
              ? "shrink-0 space-y-2 border-t border-border px-4 pt-3"
              : "border-t border-border px-4 py-3 space-y-2"
        )}
        onTouchMove={
          mobileStickyComposer
            ? (e) => {
                e.stopPropagation();
              }
            : undefined
        }
      >
        {dedupedMentionOptions.length > 0 && !mobileStickyComposer ? (
          <div className="flex flex-wrap gap-1">
            <span className="shrink-0 self-center text-[10px] text-muted-foreground">
              Sebut (@nama):
            </span>
            {dedupedMentionOptions.slice(0, 8).map((opt) => (
              <Button
                key={`${opt.kind}-${opt.id}`}
                type="button"
                variant="outline"
                size="sm"
                className="h-6 shrink-0 px-2 text-[10px]"
                onClick={() => insertMention(opt)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        ) : null}
        {fileAttachmentOptions.length > 0 && !mobileStickyComposer ? (
          <select
            className={cn(
              "w-full rounded-md border border-input bg-background px-2 py-1 text-xs",
              mobileStickyComposer ? cn("mb-1", MOBILE_CHAT_X) : ""
            )}
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
        <div
          className={cn(
            "relative",
            mobileStickyComposer
              ? cn("flex items-end gap-2 py-2", MOBILE_CHAT_X)
              : ""
          )}
        >
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
            rows={mobileStickyComposer ? 1 : undefined}
            className={cn(
              "w-full rounded-md border border-input bg-background text-sm",
              mobileStickyComposer
                ? "max-h-40 min-h-11 flex-1 resize-none touch-manipulation rounded-2xl px-4 py-2.5 leading-snug"
                : "min-h-[72px] resize-y px-3 py-2"
            )}
            placeholder={
              mobileStickyComposer
                ? "Tulis pesan…"
                : "Tulis pesan… ketik @ lalu nama untuk menyebut"
            }
            value={draft}
            onFocus={() => {
              if (!mobileStickyComposer) return;
              bottomRef.current?.scrollIntoView({ block: "end" });
              window.setTimeout(() => {
                bottomRef.current?.scrollIntoView({ block: "end" });
              }, mobileKeyboardOpen ? 80 : 280);
            }}
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
          {mobileStickyComposer ? (
            <Button
              type="button"
              size="icon"
              className="size-11 shrink-0 rounded-full"
              disabled={!draft.trim()}
              aria-label="Kirim pesan"
              onClick={handleSend}
            >
              <Send className="size-5" aria-hidden />
            </Button>
          ) : null}
        </div>
        {!mobileStickyComposer ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">
              Ctrl+Enter untuk kirim
            </span>
            <Button
              type="button"
              size="sm"
              disabled={!draft.trim()}
              onClick={handleSend}
            >
              Kirim
            </Button>
          </div>
        ) : null}
        {error ? (
          <p
            className={cn(
              "text-xs text-destructive",
              mobileStickyComposer ? cn("pb-1", MOBILE_CHAT_X) : ""
            )}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
