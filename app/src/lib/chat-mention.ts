import type { ChatMentionOption } from "@/app/chat-types";

/** Token disimpan di body pesan (plain text). */
export function formatMentionToken(opt: ChatMentionOption): string {
  if (opt.kind === "user") return `@[user:${opt.id}]`;
  if (opt.kind === "project") return `@[project:${opt.id}]`;
  if (opt.kind === "table") return `@[table:${opt.id}]`;
  return `@[row:${opt.id}]`;
}

/** Tampilan: ganti token dengan label singkat. */
export function formatChatBodyForDisplay(
  body: string,
  labelByToken: Map<string, string>
): string {
  let out = body;
  for (const [token, label] of labelByToken) {
    out = out.split(token).join(`@${label}`);
  }
  out = out.replace(
    /@\[user:([0-9a-f-]{36})\]/gi,
    (_, id) => `@${labelByToken.get(`@[user:${id}]`) ?? id.slice(0, 8)}`
  );
  out = out.replace(
    /@\[project:([0-9a-f-]{36})\]/gi,
    (_, id) => `@${labelByToken.get(`@[project:${id}]`) ?? id.slice(0, 8)}`
  );
  out = out.replace(
    /@\[row:([0-9a-f-]{36})\]/gi,
    (_, id) => `@${labelByToken.get(`@[row:${id}]`) ?? id.slice(0, 8)}`
  );
  out = out.replace(
    /@\[table:([0-9a-f-]{36})\]/gi,
    (_, id) => `@${labelByToken.get(`@[table:${id}]`) ?? id.slice(0, 8)}`
  );
  return out;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const USER_MENTION_TOKEN_RE =
  /@\[user:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

const EMAIL_MENTION_RE =
  /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;

/** Pesan menyebut user ini (token @[user:uuid] atau @email). Bukan project/row. */
export function messageMentionsUser(
  body: string,
  userId: string,
  userEmail?: string | null
): boolean {
  for (const m of body.matchAll(new RegExp(USER_MENTION_TOKEN_RE.source, "gi"))) {
    if (m[1]?.toLowerCase() === userId.toLowerCase()) return true;
  }
  if (userEmail) {
    const needle = userEmail.toLowerCase();
    for (const m of body.matchAll(new RegExp(EMAIL_MENTION_RE.source, "gi"))) {
      if (m[1]?.toLowerCase() === needle) return true;
    }
  }
  return false;
}
