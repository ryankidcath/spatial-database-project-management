"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  NotificationPreferenceCategory,
  WorkspaceNotificationKind,
} from "./workspace-notification-types";

export type DispatchWorkspaceNotificationInput = {
  preferenceCategory: NotificationPreferenceCategory;
  kind: WorkspaceNotificationKind;
  organizationId: string;
  projectId?: string | null;
  actorUserId: string;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown>;
  severity?: "info" | "warning" | "error";
};

/** Fan-out dinonaktifkan — aktivitas via tab Aktivitas (audit_log). */
export async function dispatchWorkspaceNotification(
  _supabase: SupabaseClient,
  _input: DispatchWorkspaceNotificationInput
): Promise<void> {
  return;
}
