"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { ChatAttachmentRef, ChatMentionOption } from "./chat-types";

export type WorkspaceRightPanelRowTab = "detail" | "chat";

export type WorkspaceRightPanelState =
  | {
      kind: "organization-chat";
      mentionOptions: ChatMentionOption[];
    }
  | {
      kind: "project-chat";
      projectId: string;
      mentionOptions: ChatMentionOption[];
    }
  | {
      kind: "table-chat";
      tableId: string;
      mentionOptions: ChatMentionOption[];
    }
  | {
      kind: "row";
      tableId: string;
      rowId: string;
      tab: WorkspaceRightPanelRowTab;
      pathSegments: string[];
      mentionOptions: ChatMentionOption[];
      fileAttachmentOptions: ChatAttachmentRef[];
      rowPayload?: Record<string, unknown>;
      relationLabels?: Record<string, string>;
      /** Tutup saat overlay tabel ditutup (default). Popup Map = false. */
      closeWhenOverlayCloses: boolean;
    }
  // Kind "data" (bukan chat): dipakai tombol "Buka berdampingan" dari tab Obrolan
  // untuk menampilkan grid tabel / detail baris di panel kanan tanpa chat.
  | {
      kind: "table-data";
      tableId: string;
    }
  | {
      kind: "row-detail";
      tableId: string;
      rowId: string;
      pathSegments: string[];
      rowPayload?: Record<string, unknown>;
      relationLabels?: Record<string, string>;
    };

export type OpenOrganizationChatInput = {
  mentionOptions: ChatMentionOption[];
};

export type OpenProjectChatInput = {
  projectId: string;
  mentionOptions: ChatMentionOption[];
};

export type OpenTableChatInput = {
  tableId: string;
  mentionOptions: ChatMentionOption[];
};

export type OpenRowPanelInput = {
  tableId: string;
  rowId: string;
  pathSegments: string[];
  tab?: WorkspaceRightPanelRowTab;
  mentionOptions: ChatMentionOption[];
  fileAttachmentOptions?: ChatAttachmentRef[];
  rowPayload?: Record<string, unknown>;
  relationLabels?: Record<string, string>;
  /** Default true — dari popup Map set false agar panel tetap terbuka. */
  closeWhenOverlayCloses?: boolean;
};

export type OpenTableDataInput = {
  tableId: string;
};

export type OpenRowDetailInput = {
  tableId: string;
  rowId: string;
  pathSegments: string[];
  rowPayload?: Record<string, unknown>;
  relationLabels?: Record<string, string>;
};

export type PatchRowPanelInput = {
  rowPayload?: Record<string, unknown>;
  relationLabels?: Record<string, string>;
};

export type WorkspaceRightPanelApi = {
  panel: WorkspaceRightPanelState | null;
  openOrganizationChat: (input: OpenOrganizationChatInput) => void;
  openProjectChat: (input: OpenProjectChatInput) => void;
  openTableChat: (input: OpenTableChatInput) => void;
  openRowPanel: (input: OpenRowPanelInput) => void;
  openTableData: (input: OpenTableDataInput) => void;
  openRowDetail: (input: OpenRowDetailInput) => void;
  patchRowPanel: (patch: PatchRowPanelInput) => void;
  closePanel: () => void;
  setRowTab: (tab: WorkspaceRightPanelRowTab) => void;
  isOrganizationChatOpen: () => boolean;
  isProjectChatOpen: (projectId: string) => boolean;
  isTableChatOpen: (tableId: string) => boolean;
  isRowPanelOpen: (rowId: string) => boolean;
  isTableDataOpen: (tableId: string) => boolean;
  isRowDetailOpen: (rowId: string) => boolean;
};

const WorkspaceRightPanelContext = createContext<WorkspaceRightPanelApi | null>(null);

export function WorkspaceRightPanelProvider({
  children,
  apiRef,
}: {
  children: ReactNode;
  apiRef?: MutableRefObject<WorkspaceRightPanelApi | null>;
}) {
  const [panel, setPanel] = useState<WorkspaceRightPanelState | null>(null);

  const openOrganizationChat = useCallback((input: OpenOrganizationChatInput) => {
    setPanel((prev) => (prev?.kind === "organization-chat" ? null : {
      kind: "organization-chat",
      mentionOptions: input.mentionOptions,
    }));
  }, []);

  const openProjectChat = useCallback((input: OpenProjectChatInput) => {
    setPanel((prev) => {
      if (prev?.kind === "project-chat" && prev.projectId === input.projectId) {
        return null;
      }
      return {
        kind: "project-chat",
        projectId: input.projectId,
        mentionOptions: input.mentionOptions,
      };
    });
  }, []);

  const openTableChat = useCallback((input: OpenTableChatInput) => {
    setPanel((prev) => {
      if (prev?.kind === "table-chat" && prev.tableId === input.tableId) {
        return null;
      }
      return {
        kind: "table-chat",
        tableId: input.tableId,
        mentionOptions: input.mentionOptions,
      };
    });
  }, []);

  const openRowPanel = useCallback((input: OpenRowPanelInput) => {
    setPanel({
      kind: "row",
      tableId: input.tableId,
      rowId: input.rowId,
      tab: input.tab ?? "chat",
      pathSegments: input.pathSegments,
      mentionOptions: input.mentionOptions,
      fileAttachmentOptions: input.fileAttachmentOptions ?? [],
      rowPayload: input.rowPayload,
      relationLabels: input.relationLabels,
      closeWhenOverlayCloses: input.closeWhenOverlayCloses ?? true,
    });
  }, []);

  const openTableData = useCallback((input: OpenTableDataInput) => {
    setPanel((prev) => {
      if (prev?.kind === "table-data" && prev.tableId === input.tableId) {
        return null;
      }
      return { kind: "table-data", tableId: input.tableId };
    });
  }, []);

  const openRowDetail = useCallback((input: OpenRowDetailInput) => {
    setPanel((prev) => {
      if (prev?.kind === "row-detail" && prev.rowId === input.rowId) {
        return null;
      }
      return {
        kind: "row-detail",
        tableId: input.tableId,
        rowId: input.rowId,
        pathSegments: input.pathSegments,
        rowPayload: input.rowPayload,
        relationLabels: input.relationLabels,
      };
    });
  }, []);

  const closePanel = useCallback(() => setPanel(null), []);

  const patchRowPanel = useCallback((patch: PatchRowPanelInput) => {
    setPanel((prev) =>
      prev?.kind === "row" ? { ...prev, ...patch } : prev
    );
  }, []);

  const setRowTab = useCallback((tab: WorkspaceRightPanelRowTab) => {
    setPanel((prev) =>
      prev?.kind === "row" ? { ...prev, tab } : prev
    );
  }, []);

  const isOrganizationChatOpen = useCallback(
    () => panel?.kind === "organization-chat",
    [panel]
  );

  const isProjectChatOpen = useCallback(
    (projectId: string) =>
      panel?.kind === "project-chat" && panel.projectId === projectId,
    [panel]
  );

  const isTableChatOpen = useCallback(
    (tableId: string) =>
      panel?.kind === "table-chat" && panel.tableId === tableId,
    [panel]
  );

  const isRowPanelOpen = useCallback(
    (rowId: string) => panel?.kind === "row" && panel.rowId === rowId,
    [panel]
  );

  const isTableDataOpen = useCallback(
    (tableId: string) =>
      panel?.kind === "table-data" && panel.tableId === tableId,
    [panel]
  );

  const isRowDetailOpen = useCallback(
    (rowId: string) => panel?.kind === "row-detail" && panel.rowId === rowId,
    [panel]
  );

  const value = useMemo(
    () => ({
      panel,
      openOrganizationChat,
      openProjectChat,
      openTableChat,
      openRowPanel,
      openTableData,
      openRowDetail,
      patchRowPanel,
      closePanel,
      setRowTab,
      isOrganizationChatOpen,
      isProjectChatOpen,
      isTableChatOpen,
      isRowPanelOpen,
      isTableDataOpen,
      isRowDetailOpen,
    }),
    [
      panel,
      openOrganizationChat,
      openProjectChat,
      openTableChat,
      openRowPanel,
      openTableData,
      openRowDetail,
      patchRowPanel,
      closePanel,
      setRowTab,
      isOrganizationChatOpen,
      isProjectChatOpen,
      isTableChatOpen,
      isRowPanelOpen,
      isTableDataOpen,
      isRowDetailOpen,
    ]
  );

  useEffect(() => {
    if (apiRef) apiRef.current = value;
    return () => {
      if (apiRef) apiRef.current = null;
    };
  }, [apiRef, value]);

  return (
    <WorkspaceRightPanelContext.Provider value={value}>
      {children}
    </WorkspaceRightPanelContext.Provider>
  );
}

/** Tutup panel chat baris saat overlay tabel ditutup (chat tabel tetap di panel kanan). */
export function WorkspaceRightPanelCloser({
  activeVirtualTableSlug,
}: {
  activeVirtualTableSlug: string | null;
}) {
  const { closePanel, panel } = useWorkspaceRightPanel();
  const prevOverlaySlugRef = useRef(activeVirtualTableSlug);

  useEffect(() => {
    const prevSlug = prevOverlaySlugRef.current;
    prevOverlaySlugRef.current = activeVirtualTableSlug;

    if (
      prevSlug != null &&
      activeVirtualTableSlug == null &&
      panel?.kind === "row" &&
      panel.closeWhenOverlayCloses
    ) {
      closePanel();
    }
  }, [activeVirtualTableSlug, closePanel, panel]);
  return null;
}

/** Tutup chat baris/tabel di panel jika tidak sesuai tabel overlay yang aktif. */
export function WorkspaceRightPanelTableSync({
  activeTableId,
}: {
  activeTableId: string | null;
}) {
  const { closePanel, panel } = useWorkspaceRightPanel();
  const panelTableId =
    panel?.kind === "row" || panel?.kind === "table-chat"
      ? panel.tableId
      : null;

  useEffect(() => {
    if (!activeTableId || !panelTableId) return;
    if (panel?.kind === "row" && !panel.closeWhenOverlayCloses) return;
    if (panelTableId !== activeTableId) {
      closePanel();
    }
  }, [activeTableId, panelTableId, panel, closePanel]);

  return null;
}

/** Sinkronkan chat project di panel saat project sidebar berganti. */
export function WorkspaceRightPanelProjectSync({
  selectedProjectId,
  mentionOptions,
}: {
  selectedProjectId: string | null;
  mentionOptions: ChatMentionOption[];
}) {
  const { panel, openProjectChat, closePanel } = useWorkspaceRightPanel();
  const mentionKey = useMemo(
    () => mentionOptions.map((o) => o.id).join(","),
    [mentionOptions]
  );

  useEffect(() => {
    if (panel?.kind !== "project-chat") return;
    if (!selectedProjectId) {
      closePanel();
      return;
    }
    if (panel.projectId !== selectedProjectId) {
      openProjectChat({ projectId: selectedProjectId, mentionOptions });
    }
  }, [
    selectedProjectId,
    mentionKey,
    panel?.kind,
    panel?.kind === "project-chat" ? panel.projectId : null,
    openProjectChat,
    closePanel,
    mentionOptions,
  ]);
  return null;
}

/** Tutup chat organisasi saat organisasi aktif berganti. */
export function WorkspaceRightPanelOrgSync({
  organizationId,
}: {
  organizationId: string | null;
}) {
  const { closePanel, panel } = useWorkspaceRightPanel();
  useEffect(() => {
    if (panel?.kind === "organization-chat" && !organizationId) {
      closePanel();
    }
  }, [organizationId, closePanel, panel?.kind]);
  return null;
}

export function useWorkspaceRightPanel() {
  const ctx = useContext(WorkspaceRightPanelContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceRightPanel must be used within WorkspaceRightPanelProvider"
    );
  }
  return ctx;
}
