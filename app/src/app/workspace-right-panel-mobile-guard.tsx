"use client";

import { useEffect } from "react";
import type { MobileScopePhase } from "./workspace-mobile-scope";
import { useWorkspaceRightPanel } from "./workspace-right-panel-context";

/** Tutup panel chat yang tidak valid di mobile v2 (fase wizard / tanpa akses org). */
export function WorkspaceRightPanelMobileChatGuard({
  isBelowMd,
  mobileScopePhase,
  hasOrgStaffAccess,
}: {
  isBelowMd: boolean;
  mobileScopePhase: MobileScopePhase | null;
  hasOrgStaffAccess: boolean;
}) {
  const { panel, closePanel } = useWorkspaceRightPanel();

  useEffect(() => {
    if (!panel) return;

    if (panel.kind === "organization-chat" && !hasOrgStaffAccess) {
      closePanel();
      return;
    }

    if (!isBelowMd) return;

    if (mobileScopePhase !== "workspace") {
      closePanel();
    }
  }, [
    isBelowMd,
    mobileScopePhase,
    hasOrgStaffAccess,
    panel,
    closePanel,
  ]);

  return null;
}
