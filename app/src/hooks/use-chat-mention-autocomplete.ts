"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { ChatMentionOption } from "@/app/chat-types";
import {
  applyMentionToText,
  filterMentionOptions,
  getMentionTriggerAtCursor,
  type MentionTrigger,
} from "@/lib/chat-mention-autocomplete";

type Params = {
  draft: string;
  setDraft: (value: string) => void;
  options: ChatMentionOption[];
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  enabled?: boolean;
};

export function useChatMentionAutocomplete({
  draft,
  setDraft,
  options,
  textareaRef,
  enabled = true,
}: Params) {
  const [cursor, setCursor] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const trigger = useMemo(() => {
    if (!enabled || dismissed) return null;
    return getMentionTriggerAtCursor(draft, cursor);
  }, [draft, cursor, enabled, dismissed]);

  const suggestions = useMemo(() => {
    if (!trigger) return [];
    return filterMentionOptions(options, trigger.query);
  }, [options, trigger]);

  const isOpen = Boolean(trigger && suggestions.length > 0);

  useEffect(() => {
    setActiveIndex(0);
  }, [trigger?.start, trigger?.query, suggestions.length]);

  useEffect(() => {
    if (!trigger) setDismissed(false);
  }, [trigger]);

  const syncCursorFromTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    setCursor(el.selectionStart ?? 0);
  }, [textareaRef]);

  const close = useCallback(() => {
    setDismissed(true);
  }, []);

  const selectOption = useCallback(
    (opt: ChatMentionOption, currentTrigger?: MentionTrigger | null) => {
      const t = currentTrigger ?? trigger;
      if (!t) return;
      const { text, cursor: nextCursor } = applyMentionToText(draft, t, opt);
      setDraft(text);
      setDismissed(true);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
        setCursor(nextCursor);
      });
    },
    [draft, setDraft, trigger, textareaRef]
  );

  const onDraftChange = useCallback(
    (value: string, selectionStart?: number) => {
      setDraft(value);
      if (typeof selectionStart === "number") {
        setCursor(selectionStart);
      } else {
        requestAnimationFrame(syncCursorFromTextarea);
      }
      setDismissed(false);
    },
    [setDraft, syncCursorFromTextarea]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (!isOpen) return false;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % suggestions.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const opt = suggestions[activeIndex];
        if (opt) selectOption(opt);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return true;
      }
      return false;
    },
    [isOpen, suggestions, activeIndex, selectOption, close]
  );

  return {
    isOpen,
    suggestions,
    activeIndex,
    setActiveIndex,
    trigger,
    onDraftChange,
    onKeyDown,
    onSelect: selectOption,
    onClose: close,
    syncCursorFromTextarea,
  };
}
