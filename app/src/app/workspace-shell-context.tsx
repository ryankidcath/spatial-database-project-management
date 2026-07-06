"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { WorkspaceShellPayload } from "@/lib/workspace-shell-types";

type WorkspaceShellContextValue = {
  /** Muat ulang shell (tabel, kolom, proyek, dll.) dari server. */
  refreshWorkspaceShell: () => Promise<WorkspaceShellPayload | null>;
};

const WorkspaceShellContext = createContext<WorkspaceShellContextValue | null>(
  null
);

export function WorkspaceShellProvider({
  refreshWorkspaceShell,
  children,
}: {
  refreshWorkspaceShell: () => Promise<WorkspaceShellPayload | null>;
  children: ReactNode;
}) {
  return (
    <WorkspaceShellContext.Provider value={{ refreshWorkspaceShell }}>
      {children}
    </WorkspaceShellContext.Provider>
  );
}

export function useWorkspaceShellRefresh() {
  const ctx = useContext(WorkspaceShellContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceShellRefresh harus dipakai di dalam WorkspaceShellProvider"
    );
  }
  return ctx.refreshWorkspaceShell;
}
