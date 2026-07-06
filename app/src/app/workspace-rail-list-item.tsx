"use client";

import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkspaceRailListItemProps = {
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  title: string;
  titleExtra?: ReactNode;
  subtitle?: string | null;
  /** Label kanan atas (mis. ruang kerja / scope). */
  meta?: string | null;
  badge?: ReactNode;
  expanded?: boolean;
  showExpandChevron?: boolean;
  className?: string;
  testId?: string;
  disabled?: boolean;
};

/** Baris daftar seragam rail Tabel / Obrolan / Spasial. */
export function WorkspaceRailListItem({
  active = false,
  onClick,
  icon,
  title,
  titleExtra,
  subtitle,
  meta,
  badge,
  expanded = false,
  showExpandChevron = false,
  className,
  testId,
  disabled = false,
}: WorkspaceRailListItemProps) {
  const interactive = Boolean(onClick) && !disabled;

  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled || !onClick}
      className={cn(
        "flex w-full min-h-[3.25rem] min-w-0 max-w-full items-start gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-left transition-colors",
        interactive && (active ? "bg-primary/10" : "hover:bg-muted/60"),
        !interactive && active && "bg-primary/10",
        disabled && "cursor-default opacity-60",
        className
      )}
    >
      {icon ? (
        <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-muted-foreground">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 basis-0 overflow-hidden">
        <span className="flex min-w-0 items-baseline justify-between gap-2 overflow-hidden">
          <span className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <span className="truncate text-sm font-medium text-foreground">
              {title}
            </span>
            {titleExtra}
          </span>
          {meta ? (
            <span className="max-w-[42%] shrink-0 truncate text-[11px] text-muted-foreground">
              {meta}
            </span>
          ) : null}
        </span>
        {subtitle ? (
          <p
            className="mt-0.5 min-w-0 max-w-full truncate break-all text-xs text-muted-foreground"
            title={subtitle}
          >
            {subtitle}
          </p>
        ) : null}
      </span>
      {badge ? <span className="shrink-0">{badge}</span> : null}
      {showExpandChevron ? (
        <ChevronRight
          className={cn(
            "mt-1 size-4 shrink-0 text-muted-foreground transition-transform",
            expanded && "rotate-90"
          )}
          aria-hidden
        />
      ) : null}
    </button>
  );
}
