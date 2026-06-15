import type { ChatScopeType } from "./chat-types";

export type ChatInboxEntryKind =
  | "organization"
  | "project"
  | "virtual_table"
  | "virtual_row";

export type ChatInboxEntry = {
  key: string;
  kind: ChatInboxEntryKind;
  scopeType: ChatScopeType;
  title: string;
  subtitle: string | null;
  unreadCount: number;
  organizationId: string;
  projectId: string | null;
  virtualTableId: string | null;
  virtualRowId: string | null;
  tableIdForRow?: string;
  pathSegments?: string[];
  rowPayload?: Record<string, unknown>;
  /** Waktu pesan terakhir (atau pembuatan room) untuk urutan inbox. */
  lastActivityAt?: string | null;
};
