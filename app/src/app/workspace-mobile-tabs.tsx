"use client";

import {
  Calendar,
  FolderOpen,
  GanttChart,
  LayoutDashboard,
  History,
  Map,
  MessageSquare,
  Table2,
  Wallet,
  BarChart3,
  Columns3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewId } from "./workspace-views";
import { ChatInboxScopeUnreadBadge } from "./virtual-table-chat-unread-context";

/** Urutan tab di bottom bar mobile (tanpa menu «Lainnya»). */
const MOBILE_BAR_VIEWS: ViewId[] = [
  "Dashboard",
  "Tabel",
  "Chat",
  "Map",
  "Aktivitas",
];

const VIEW_META: Record<
  ViewId,
  { label: string; shortLabel: string; icon: LucideIcon }
> = {
  Dashboard: { label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
  Aktivitas: { label: "Aktivitas", shortLabel: "Aktivitas", icon: History },
  Tabel: { label: "Tabel", shortLabel: "Tabel", icon: Table2 },
  Chat: { label: "Obrolan", shortLabel: "Obrolan", icon: MessageSquare },
  Berkas: { label: "Berkas", shortLabel: "Berkas", icon: FolderOpen },
  Laporan: { label: "Laporan", shortLabel: "Laporan", icon: BarChart3 },
  Keuangan: { label: "Keuangan", shortLabel: "Keuangan", icon: Wallet },
  Map: { label: "Peta", shortLabel: "Peta", icon: Map },
  Kanban: { label: "Kanban", shortLabel: "Kanban", icon: Columns3 },
  Kalender: { label: "Kalender", shortLabel: "Kalender", icon: Calendar },
  Gantt: { label: "Gantt", shortLabel: "Gantt", icon: GanttChart },
};

function mobileBarViews(visibleViews: ViewId[]): ViewId[] {
  const allowed = new Set(visibleViews);
  return MOBILE_BAR_VIEWS.filter((v) => allowed.has(v));
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
      <span className="relative inline-flex shrink-0">
        <Icon className={cn("size-5", active && "stroke-[2.5]")} />
        {view === "Chat" ? (
          <ChatInboxScopeUnreadBadge position="tab" />
        ) : null}
      </span>
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
  const barViews = mobileBarViews(visibleViews);

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
          onSelect={() => {
            if (activeView !== view) onViewChange(view);
          }}
        />
      ))}
    </nav>
  );
}

/** Padding bawah konten utama agar tidak tertutup bottom bar. */
export const WORKSPACE_MOBILE_TAB_BAR_PADDING =
  "pb-[calc(3.75rem+env(safe-area-inset-bottom))] md:pb-0";

/** Padding bawah composer obrolan mobile (area di atas bottom bar). */
export const WORKSPACE_MOBILE_TAB_BAR_COMPOSER_PADDING =
  "pb-[calc(3.75rem+env(safe-area-inset-bottom))]";

/** Nilai CSS untuk inset composer di atas bottom bar (tanpa class pb-). */
export const WORKSPACE_MOBILE_TAB_BAR_INSET =
  "calc(3.75rem + env(safe-area-inset-bottom))";
