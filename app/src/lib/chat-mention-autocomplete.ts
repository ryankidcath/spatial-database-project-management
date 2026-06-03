import type { ChatMentionOption } from "@/app/chat-types";
import { formatMentionToken } from "@/lib/chat-mention";

/** Posisi @mention yang sedang diketik di sekitar kursor. */
export type MentionTrigger = {
  start: number;
  query: string;
  end: number;
};

const MENTION_QUERY_RE = /@([\w.-]*)$/;

/**
 * Deteksi apakah kursor berada pada segmen @query (bukan email seperti user@mail.com).
 */
export function getMentionTriggerAtCursor(
  text: string,
  cursor: number
): MentionTrigger | null {
  const safeCursor = Math.max(0, Math.min(cursor, text.length));
  const before = text.slice(0, safeCursor);
  const match = before.match(MENTION_QUERY_RE);
  if (!match || match.index == null) return null;

  const start = match.index;
  if (start > 0) {
    const charBefore = before[start - 1];
    if (/[\w.]/.test(charBefore)) return null;
  }

  return {
    start,
    query: match[1] ?? "",
    end: safeCursor,
  };
}

const KIND_ORDER: Record<ChatMentionOption["kind"], number> = {
  user: 0,
  project: 1,
  table: 2,
  row: 3,
};

function mentionKindLabel(kind: ChatMentionOption["kind"]): string {
  if (kind === "user") return "Pengguna";
  if (kind === "project") return "Project";
  if (kind === "table") return "Tabel";
  return "Baris";
}

/** Filter & urutkan kandidat mention untuk dropdown. */
export function filterMentionOptions(
  options: ChatMentionOption[],
  query: string,
  limit = 10
): ChatMentionOption[] {
  const q = query.toLowerCase().trim();
  const seen = new Set<string>();

  const scored: { opt: ChatMentionOption; score: number }[] = [];
  for (const opt of options) {
    const key = `${opt.kind}:${opt.id}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const label = opt.label.toLowerCase();
    const searchExtra = (opt.searchText ?? "").toLowerCase();
    let score = 0;

    if (!q) {
      score = 1;
    } else if (label.startsWith(q) || searchExtra.startsWith(q)) {
      score = 4;
    } else if (label.includes(q) || searchExtra.includes(q)) {
      score = 3;
    } else {
      const parts = q.split(/\s+/).filter(Boolean);
      if (
        parts.length > 0 &&
        parts.every((p) => label.includes(p) || searchExtra.includes(p))
      ) {
        score = 2;
      } else {
        continue;
      }
    }

    scored.push({ opt, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ka = KIND_ORDER[a.opt.kind];
    const kb = KIND_ORDER[b.opt.kind];
    if (ka !== kb) return ka - kb;
    return a.opt.label.localeCompare(b.opt.label, "id");
  });

  return scored.slice(0, limit).map((s) => s.opt);
}

export function applyMentionToText(
  text: string,
  trigger: MentionTrigger,
  opt: ChatMentionOption
): { text: string; cursor: number } {
  const token = `${formatMentionToken(opt)} `;
  const nextText =
    text.slice(0, trigger.start) + token + text.slice(trigger.end);
  return { text: nextText, cursor: trigger.start + token.length };
}

export { mentionKindLabel };
