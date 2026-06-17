export type ActivityLogRow = {
  id: string;
  organization_id: string;
  project_id: string | null;
  actor_user_id: string;
  actor_display_name: string | null;
  action: string;
  entity: string;
  entity_id: string;
  payload: Record<string, unknown>;
  created_at: string;
};
