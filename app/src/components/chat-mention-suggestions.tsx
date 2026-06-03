"use client";

import { mentionKindLabel } from "@/lib/chat-mention-autocomplete";
import type { ChatMentionOption } from "@/app/chat-types";
import { cn } from "@/lib/utils";

type Props = {
  suggestions: ChatMentionOption[];
  activeIndex: number;
  onSelect: (opt: ChatMentionOption) => void;
  onHover: (index: number) => void;
  query: string;
};

export function ChatMentionSuggestions({
  suggestions,
  activeIndex,
  onSelect,
  onHover,
  query,
}: Props) {
  return (
    <ul
      className="absolute bottom-full left-0 z-50 mb-1 max-h-48 w-full min-w-[220px] overflow-y-auto rounded-md border border-border bg-popover py-1 text-popover-foreground shadow-md"
      role="listbox"
      aria-label="Saran mention"
    >
      {suggestions.map((opt, idx) => (
        <li key={`${opt.kind}-${opt.id}`} role="option" aria-selected={idx === activeIndex}>
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
              idx === activeIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(opt);
            }}
            onMouseEnter={() => onHover(idx)}
          >
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
              {mentionKindLabel(opt.kind)}
            </span>
            <span className="min-w-0 truncate font-medium">{opt.label}</span>
          </button>
        </li>
      ))}
      {query ? (
        <li className="border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
          Filter: @{query}
        </li>
      ) : null}
    </ul>
  );
}
