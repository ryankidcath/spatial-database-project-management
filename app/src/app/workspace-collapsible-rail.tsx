"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  loadWorkspaceRailCollapsed,
  saveWorkspaceRailCollapsed,
  type WorkspaceRailTabId,
} from "@/lib/workspace-rail-preference";
import { useIsBelowMd } from "@/lib/use-media-query";

export function useWorkspaceCollapsibleRail(tabId: WorkspaceRailTabId) {
  const isBelowMd = useIsBelowMd();
  const [collapsed, setCollapsed] = useState(() =>
    loadWorkspaceRailCollapsed(tabId)
  );

  useEffect(() => {
    if (!isBelowMd) {
      saveWorkspaceRailCollapsed(tabId, collapsed);
    }
  }, [tabId, collapsed, isBelowMd]);

  const railEnabled = !isBelowMd;
  const isOpen = railEnabled && !collapsed;

  const toggle = useCallback(() => {
    setCollapsed((v) => !v);
  }, []);

  return {
    railEnabled,
    isOpen,
    collapsed,
    setCollapsed,
    toggle,
  };
}

type ShellProps = {
  isOpen: boolean;
  children: ReactNode;
  className?: string;
  /** Lebar rail saat terbuka — default 22rem (selaras daftar Tabel/Chat). */
  widthClass?: string;
};

export function WorkspaceCollapsibleRailShell({
  isOpen,
  children,
  className,
  widthClass = "w-[22rem] max-w-[22rem]",
}: ShellProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-0 shrink-0 flex-col self-stretch overflow-hidden bg-background transition-[width] duration-300 ease-in-out motion-reduce:transition-none",
        isOpen ? cn(widthClass, "border-r border-border") : "w-0 border-transparent",
        className
      )}
      data-testid="workspace-collapsible-rail"
      data-rail-open={isOpen ? "true" : "false"}
    >
      <div
        className={cn(
          "flex min-h-0 h-full min-w-0 flex-1 flex-col overflow-hidden",
          widthClass
        )}
        aria-hidden={!isOpen}
        inert={!isOpen ? true : undefined}
      >
        {children}
      </div>
    </div>
  );
}

type ToggleProps = {
  isOpen: boolean;
  onToggle: () => void;
  className?: string;
  touchFriendly?: boolean;
};

export function WorkspaceRailToggleButton({
  isOpen,
  onToggle,
  className,
  touchFriendly = false,
}: ToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isOpen ? "Sembunyikan panel navigasi" : "Tampilkan panel navigasi"}
      aria-label={
        isOpen ? "Sembunyikan panel navigasi" : "Tampilkan panel navigasi"
      }
      aria-expanded={isOpen}
      data-testid="workspace-rail-toggle"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted hover:opacity-100",
        touchFriendly ? "h-11 w-11 touch-manipulation" : "h-8 w-8",
        className
      )}
    >
      {isOpen ? (
        <PanelLeftClose className={touchFriendly ? "size-5" : "size-4"} aria-hidden />
      ) : (
        <PanelLeft className={touchFriendly ? "size-5" : "size-4"} aria-hidden />
      )}
    </button>
  );
}
