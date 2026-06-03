/** Event lokal untuk refresh badge/highlight unread chat tanpa reload halaman. */
export const CHAT_UNREAD_INVALIDATE_EVENT = "core-pm:chat-unread-invalidate";

export function dispatchChatUnreadInvalidate(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_UNREAD_INVALIDATE_EVENT));
}
