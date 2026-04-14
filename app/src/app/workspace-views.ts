export const VIEWS = [
  "Dashboard",
  "Tabel",
  "Berkas",
  "Laporan",
  "Keuangan",
  "Map",
  "Kanban",
  "Kalender",
  "Gantt",
] as const;

export type ViewId = (typeof VIEWS)[number];
