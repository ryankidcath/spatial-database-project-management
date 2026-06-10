"use client";

import { useState } from "react";
import { ChevronDown, LogOut, MoreHorizontal, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { NotificationsBell } from "./notifications-bell";
import type { UserNotificationRow } from "./user-notification-types";

type MemberPresenceRow = {
  userId: string;
  name: string;
  isOnline: boolean;
  lastSeenAt: string | null;
};

type Props = {
  scopeTitle: string;
  showOrgSwitcher: boolean;
  onOpenProjectPicker: () => void;
  onOpenOrgPicker: () => void;
  userEmail: string | null;
  userId: string | null;
  notifications: UserNotificationRow[];
  onNavigate: (n: UserNotificationRow) => void;
  memberPresenceRows: MemberPresenceRow[];
  selectedProjectId: string | null;
  formatDateTime: (value: string | null) => string;
  signOutAction: () => void;
  disabled?: boolean;
};

export function WorkspaceMobileCompactHeader({
  scopeTitle,
  showOrgSwitcher,
  onOpenProjectPicker,
  onOpenOrgPicker,
  userEmail,
  userId,
  notifications,
  onNavigate,
  memberPresenceRows,
  selectedProjectId,
  formatDateTime,
  signOutAction,
  disabled = false,
}: Props) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const openProject = () => {
    setScopeOpen(false);
    onOpenProjectPicker();
  };

  const openOrg = () => {
    setScopeOpen(false);
    onOpenOrgPicker();
  };

  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        className={cn(
          "flex min-h-11 min-w-0 flex-1 items-center gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2 text-left",
          "transition-colors active:bg-muted/60"
        )}
        aria-label="Buka menu scope"
        disabled={disabled}
        onClick={() => setScopeOpen(true)}
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
          {scopeTitle}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>

      <NotificationsBell
        userId={userId}
        notifications={notifications}
        onNavigate={onNavigate}
        compact
      />

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Menu lainnya"
              disabled={disabled}
            >
              <MoreHorizontal className="size-5" aria-hidden />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-[min(18rem,calc(100vw-2rem))] p-2">
          {selectedProjectId ? (
            <div className="mb-2 rounded-lg border border-border bg-muted/20 p-3">
              <p className="flex items-center gap-2 text-xs font-medium text-foreground">
                <Users className="size-3.5 shrink-0 text-muted-foreground" />
                Online{" "}
                {memberPresenceRows.filter((m) => m.isOnline).length}
              </p>
              {memberPresenceRows.length === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Belum ada anggota project.
                </p>
              ) : (
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-auto">
                  {memberPresenceRows.slice(0, 12).map((u) => (
                    <li
                      key={u.userId}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-foreground">
                          {u.name}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {u.lastSeenAt
                            ? `terakhir aktif ${formatDateTime(u.lastSeenAt)}`
                            : "belum terdeteksi aktif"}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          u.isOnline
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/40"
                        )}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2 rounded-md px-2 py-2">
            <span className="text-sm text-foreground">Tema</span>
            <ThemeToggle iconOnly />
          </div>

          {userEmail ? (
            <p className="truncate px-2 py-1 text-xs text-muted-foreground">
              {userEmail}
            </p>
          ) : null}

          <form
            action={signOutAction}
            className="mt-1 border-t border-border pt-2"
          >
            <button
              type="submit"
              className="flex w-full min-h-11 items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
            >
              <LogOut className="size-4 shrink-0" />
              Keluar
            </button>
          </form>
        </PopoverContent>
      </Popover>

      <Sheet open={scopeOpen} onOpenChange={setScopeOpen} side="bottom">
        <SheetContent side="bottom" className="gap-0 p-0 pb-[env(safe-area-inset-bottom)]">
          <div className="border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Scope workspace</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {scopeTitle}
            </p>
          </div>
          <div className="space-y-1 p-3">
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full justify-start"
              onClick={openProject}
            >
              Ganti proyek
            </Button>
            {showOrgSwitcher ? (
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full justify-start text-muted-foreground"
                onClick={openOrg}
              >
                Ganti organisasi
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
