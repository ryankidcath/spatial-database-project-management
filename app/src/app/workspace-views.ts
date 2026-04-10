export const VIEWS = [
  "Dashboard",
  "Tabel",
  "Map",
  "Kanban",
  "Kalender",
  "Gantt",
] as const;

export type ViewId = (typeof VIEWS)[number];
