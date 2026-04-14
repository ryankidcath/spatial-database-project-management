/** Baris `core_pm.user_notifications` (F6-2). */
export type UserNotificationRow = {
  id: string;
  user_id: string;
  organization_id: string;
  project_id: string | null;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  payload: unknown;
  read_at: string | null;
  created_at: string;
};
