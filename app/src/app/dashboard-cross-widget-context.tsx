"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DashboardCrossWidgetState = {
  highlightTableId: string | null;
  highlightRowId: string | null;
  setHighlight: (tableId: string | null, rowId: string | null) => void;
  clearHighlight: () => void;
};

const DashboardCrossWidgetContext =
  createContext<DashboardCrossWidgetState | null>(null);

export function DashboardCrossWidgetProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [highlightTableId, setHighlightTableId] = useState<string | null>(null);
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);

  const setHighlight = useCallback((tableId: string | null, rowId: string | null) => {
    setHighlightTableId(tableId);
    setHighlightRowId(rowId);
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlightTableId(null);
    setHighlightRowId(null);
  }, []);

  const value = useMemo(
    (): DashboardCrossWidgetState => ({
      highlightTableId,
      highlightRowId,
      setHighlight,
      clearHighlight,
    }),
    [highlightTableId, highlightRowId, setHighlight, clearHighlight]
  );

  return (
    <DashboardCrossWidgetContext.Provider value={value}>
      {children}
    </DashboardCrossWidgetContext.Provider>
  );
}

export function useDashboardCrossWidget(): DashboardCrossWidgetState {
  const ctx = useContext(DashboardCrossWidgetContext);
  if (!ctx) {
    throw new Error(
      "useDashboardCrossWidget must be used within DashboardCrossWidgetProvider"
    );
  }
  return ctx;
}
