/** Basemap gratis ($0) — tanpa API key. Lihat docs/workspace-spatial-gis-roadmap.md §4. */

export type WorkspaceBasemapId = "osm" | "topo" | "positron";

export type WorkspaceBasemapDef = {
  id: WorkspaceBasemapId;
  label: string;
  url: string;
  attribution: string;
  maxZoom: number;
};

export const WORKSPACE_BASEMAPS: WorkspaceBasemapDef[] = [
  {
    id: "osm",
    label: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  },
  {
    id: "topo",
    label: "OpenTopoMap",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    maxZoom: 17,
    attribution:
      '&copy; <a href="https://opentopomap.org">OpenTopoMap</a> (&copy; OSM)',
  },
  {
    id: "positron",
    label: "Carto Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
];

export const DEFAULT_WORKSPACE_BASEMAP_ID: WorkspaceBasemapId = "osm";

export function getWorkspaceBasemap(
  id: WorkspaceBasemapId | string | null | undefined
): WorkspaceBasemapDef {
  return (
    WORKSPACE_BASEMAPS.find((b) => b.id === id) ??
    WORKSPACE_BASEMAPS.find((b) => b.id === DEFAULT_WORKSPACE_BASEMAP_ID)!
  );
}
