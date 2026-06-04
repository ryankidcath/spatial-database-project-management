export const VIEWS = [
  "Dashboard",
  "Tabel",
  "Chat",
  "Berkas",
  "Laporan",
  "Keuangan",
  "Map",
  "Kanban",
  "Kalender",
  "Gantt",
] as const;

export type ViewId = (typeof VIEWS)[number];
