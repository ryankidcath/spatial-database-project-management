"use client";

import { useState } from "react";
import {
  Calendar,
  FolderOpen,
  GanttChart,
  LayoutDashboard,
  Map,
  MoreHorizontal,
  Table2,
  Wallet,
  BarChart3,
  Columns3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ViewId } from "./workspace-views";

/** Urutan prioritas tab di bottom bar mobile (maks. 4 + Lainnya). */
const MOBILE_TAB_ORDER: ViewId[] = [
  "Dashboard",
  "Map",
  "Tabel",
  "Berkas",
  "Laporan",
  "Keuangan",
  "Kanban",
  "Kalender",
  "Gantt",
];

const MOBILE_BAR_SLOT_COUNT = 4;

const VIEW_META: Record<
  ViewId,
  { label: string; shortLabel: string; icon: LucideIcon }
> = {
  Dashboard: { label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
  Tabel: { label: "Tabel", shortLabel: "Tabel", icon: Table2 },
  Berkas: { label: "Berkas", shortLabel: "Berkas", icon: FolderOpen },
  Laporan: { label: "Laporan", shortLabel: "Laporan", icon: BarChart3 },
  Keuangan: { label: "Keuangan", shortLabel: "Keuangan", icon: Wallet },
  Map: { label: "Map", shortLabel: "Peta", icon: Map },
  Kanban: { label: "Kanban", shortLabel: "Kanban", icon: Columns3 },
  Kalender: { label: "Kalender", shortLabel: "Kalender", icon: Calendar },
  Gantt: { label: "Gantt", shortLabel: "Gantt", icon: GanttChart },
};

function partitionMobileViews(visibleViews: ViewId[]): {
  barViews: ViewId[];
  overflowViews: ViewId[];
} {
  const allowed = new Set(visibleViews);
  const ordered = MOBILE_TAB_ORDER.filter((v) => allowed.has(v));
  return {
    barViews: ordered.slice(0, MOBILE_BAR_SLOT_COUNT),
    overflowViews: ordered.slice(MOBILE_BAR_SLOT_COUNT),
  };
}

type Props = {
  activeView: ViewId;
  visibleViews: ViewId[];
  onViewChange: (view: ViewId) => void;
  className?: string;
};

function MobileTabButton({
  view,
  active,
  onSelect,
}: {
  view: ViewId;
  active: boolean;
  onSelect: () => void;
}) {
  const meta = VIEW_META[view];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={meta.label}
      onClick={onSelect}
      className={cn(
        "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] font-medium transition-colors",
        active
          ? "text-primary"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className={cn("size-5 shrink-0", active && "stroke-[2.5]")} />
      <span className="max-w-full truncate">{meta.shortLabel}</span>
    </button>
  );
}

export function WorkspaceMobileTabBar({
  activeView,
  visibleViews,
  onViewChange,
  className,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const { barViews, overflowViews } = partitionMobileViews(visibleViews);
  const hasOverflow = overflowViews.length > 0;
  const overflowActive = overflowViews.includes(activeView);

  if (barViews.length === 0) return null;

  return (
    <nav
      className={cn(
        "flex shrink-0 items-stretch border-t border-border bg-card/95 backdrop-blur-sm",
        "pb-[env(safe-area-inset-bottom)]",
        className
      )}
      aria-label="Navigasi tab utama"
      role="tablist"
    >
      {barViews.map((view) => (
        <MobileTabButton
          key={view}
          view={view}
          active={activeView === view}
          onSelect={() => onViewChange(view)}
        />
      ))}

      {hasOverflow ? (
        <Popover open={moreOpen} onOpenChange={setMoreOpen}>
          <PopoverTrigger
            render={
              <button
                type="button"
                role="tab"
                aria-selected={overflowActive}
                aria-haspopup="menu"
                aria-label="Tab lainnya"
                className={cn(
                  "flex min-h-11 min-w-[4.5rem] shrink-0 flex-col items-center justify-center gap-0.5 px-2 py-1.5 text-[10px] font-medium transition-colors",
                  overflowActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <MoreHorizontal
                  className={cn("size-5", overflowActive && "stroke-[2.5]")}
                />
                <span>Lainnya</span>
              </button>
            }
          />
          <PopoverContent
            side="top"
            align="end"
            className="w-[min(14rem,calc(100vw-2rem))] p-1"
          >
            <ul className="flex flex-col gap-0.5">
              {overflowViews.map((view) => {
                const meta = VIEW_META[view];
                const Icon = meta.icon;
                const active = activeView === view;
                return (
                  <li key={view}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm",
                        active
                          ? "bg-primary/10 font-medium text-primary"
                          : "text-foreground hover:bg-muted"
                      )}
                      onClick={() => {
                        onViewChange(view);
                        setMoreOpen(false);
                      }}
                    >
                      <Icon className="size-4 shrink-0" />
                      {meta.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      ) : null}
    </nav>
  );
}

/** Padding bawah konten utama agar tidak tertutup bottom bar. */
export const WORKSPACE_MOBILE_TAB_BAR_PADDING =
  "pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0";
