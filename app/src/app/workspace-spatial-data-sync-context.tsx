"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  loadSpatialSelectionSyncEnabled,
  saveSpatialSelectionSyncEnabled,
} from "@/lib/workspace-spatial-data-sync-preference";

export type SpatialOpenFocusRequest = {
  tableId: string;
  rowIds?: string[];
  zoomToSelection?: boolean;
};

export type WorkspaceSpatialDataSyncApi = {
  projectId: string | null;
  selectionSyncEnabled: boolean;
  setSelectionSyncEnabled: (enabled: boolean) => void;
  isRowSelected: (tableId: string, rowId: string) => boolean;
  getSelectedRowIds: (tableId: string) => string[];
  getAllSelectedRowIds: () => string[];
  toggleRowSelection: (tableId: string, rowId: string) => void;
  setRowSelection: (tableId: string, rowIds: string[]) => void;
  clearRowSelection: (tableId?: string) => void;
  openInSpatial: (request: SpatialOpenFocusRequest) => void;
  focusRequest: SpatialOpenFocusRequest | null;
  focusEpoch: number;
  consumeFocusRequest: () => void;
  pendingChatContext: string | null;
  setPendingChatContext: (text: string | null) => void;
};

const WorkspaceSpatialDataSyncContext =
  createContext<WorkspaceSpatialDataSyncApi | null>(null);

type Props = {
  projectId: string | null;
  onNavigateToSpatial?: (request: SpatialOpenFocusRequest) => void;
  children: ReactNode;
};

export function WorkspaceSpatialDataSyncProvider({
  projectId,
  onNavigateToSpatial,
  children,
}: Props) {
  const navigateRef = useRef(onNavigateToSpatial);
  navigateRef.current = onNavigateToSpatial;

  const [selectionSyncEnabled, setSelectionSyncEnabledState] = useState(true);
  const [selectedByTable, setSelectedByTable] = useState<
    Record<string, string[]>
  >({});
  const [focusRequest, setFocusRequest] =
    useState<SpatialOpenFocusRequest | null>(null);
  const [focusEpoch, setFocusEpoch] = useState(0);
  const [pendingChatContext, setPendingChatContext] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (!projectId) {
      setSelectionSyncEnabledState(true);
      setSelectedByTable({});
      setFocusRequest(null);
      return;
    }
    setSelectionSyncEnabledState(loadSpatialSelectionSyncEnabled(projectId));
  }, [projectId]);

  const setSelectionSyncEnabled = useCallback(
    (enabled: boolean) => {
      setSelectionSyncEnabledState(enabled);
      if (projectId) saveSpatialSelectionSyncEnabled(projectId, enabled);
      if (!enabled) setSelectedByTable({});
    },
    [projectId]
  );

  const isRowSelected = useCallback(
    (tableId: string, rowId: string) => {
      return (selectedByTable[tableId] ?? []).includes(rowId);
    },
    [selectedByTable]
  );

  const getSelectedRowIds = useCallback(
    (tableId: string) => selectedByTable[tableId] ?? [],
    [selectedByTable]
  );

  const getAllSelectedRowIds = useCallback(() => {
    return Object.values(selectedByTable).flat();
  }, [selectedByTable]);

  const setRowSelection = useCallback((tableId: string, rowIds: string[]) => {
    setSelectedByTable((prev) => {
      const unique = [...new Set(rowIds)];
      if (unique.length === 0) {
        if (!prev[tableId]?.length) return prev;
        const next = { ...prev };
        delete next[tableId];
        return next;
      }
      return { ...prev, [tableId]: unique };
    });
  }, []);

  const toggleRowSelection = useCallback((tableId: string, rowId: string) => {
    setSelectedByTable((prev) => {
      const current = prev[tableId] ?? [];
      const nextIds = current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId];
      if (nextIds.length === 0) {
        const next = { ...prev };
        delete next[tableId];
        return next;
      }
      return { ...prev, [tableId]: nextIds };
    });
  }, []);

  const clearRowSelection = useCallback((tableId?: string) => {
    if (!tableId) {
      setSelectedByTable({});
      return;
    }
    setSelectedByTable((prev) => {
      if (!prev[tableId]?.length) return prev;
      const next = { ...prev };
      delete next[tableId];
      return next;
    });
  }, []);

  const openInSpatial = useCallback(
    (request: SpatialOpenFocusRequest) => {
      if (request.rowIds?.length) {
        setRowSelection(request.tableId, request.rowIds);
      }
      setFocusRequest(request);
      setFocusEpoch((n) => n + 1);
      navigateRef.current?.(request);
    },
    [setRowSelection]
  );

  const consumeFocusRequest = useCallback(() => {
    setFocusRequest(null);
  }, []);

  const value = useMemo(
    (): WorkspaceSpatialDataSyncApi => ({
      projectId,
      selectionSyncEnabled,
      setSelectionSyncEnabled,
      isRowSelected,
      getSelectedRowIds,
      getAllSelectedRowIds,
      toggleRowSelection,
      setRowSelection,
      clearRowSelection,
      openInSpatial,
      focusRequest,
      focusEpoch,
      consumeFocusRequest,
      pendingChatContext,
      setPendingChatContext,
    }),
    [
      projectId,
      selectionSyncEnabled,
      setSelectionSyncEnabled,
      isRowSelected,
      getSelectedRowIds,
      getAllSelectedRowIds,
      toggleRowSelection,
      setRowSelection,
      clearRowSelection,
      openInSpatial,
      focusRequest,
      focusEpoch,
      consumeFocusRequest,
      pendingChatContext,
    ]
  );

  return (
    <WorkspaceSpatialDataSyncContext.Provider value={value}>
      {children}
    </WorkspaceSpatialDataSyncContext.Provider>
  );
}

export function useWorkspaceSpatialDataSync(): WorkspaceSpatialDataSyncApi {
  const ctx = useContext(WorkspaceSpatialDataSyncContext);
  if (!ctx) {
    throw new Error(
      "useWorkspaceSpatialDataSync must be used within WorkspaceSpatialDataSyncProvider"
    );
  }
  return ctx;
}

export function useWorkspaceSpatialDataSyncOptional(): WorkspaceSpatialDataSyncApi | null {
  return useContext(WorkspaceSpatialDataSyncContext);
}
