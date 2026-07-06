import type { MapFootprint } from "@/app/workspace-map";
import {
  DEFAULT_DURABLE_CACHE_TTL_MS,
  isDurableSnapshotFresh,
} from "@/lib/client-durable-storage";
import {
  hydrateIndexedDbRecordEntry,
  invalidateIndexedDbRecordNamespace,
  persistIndexedDbRecordEntry,
  readIndexedDbRecordMapSync,
} from "@/lib/client-durable-record-storage";

export type SpatialGeometryLayersCacheEntry = {
  layers: MapFootprint[];
  totalCountsByTableId: Record<string, number>;
  updatedAt: number;
};

const storeConfig = {
  namespace: "spatial-geometry-layers-v1",
  maxEntries: 24,
  ttlMs: DEFAULT_DURABLE_CACHE_TTL_MS,
};

const memory = new Map<string, SpatialGeometryLayersCacheEntry>();

export const SPATIAL_GEOMETRY_LAYERS_CACHE_TTL_MS = DEFAULT_DURABLE_CACHE_TTL_MS;

export function buildSpatialGeometryLayersCacheKey(input: {
  projectId: string;
  vtablesWithGeometrySig: string;
  virtualColumnsGeomSig: string;
  filterSyncEnabled: boolean;
  viewFiltersSig: string;
  projectName: string;
}): string {
  return [
    input.projectId,
    input.vtablesWithGeometrySig,
    input.virtualColumnsGeomSig,
    input.filterSyncEnabled ? "1" : "0",
    input.viewFiltersSig,
    input.projectName,
  ].join(":");
}

export function getSpatialGeometryLayersCache(
  key: string
): SpatialGeometryLayersCacheEntry | undefined {
  const mem = memory.get(key);
  if (mem) {
    if (!isDurableSnapshotFresh(mem, storeConfig.ttlMs!)) {
      memory.delete(key);
    } else {
      return mem;
    }
  }
  const stored = readIndexedDbRecordMapSync<SpatialGeometryLayersCacheEntry>(
    storeConfig
  )[key];
  if (!stored || !isDurableSnapshotFresh(stored, storeConfig.ttlMs!)) {
    return undefined;
  }
  memory.set(key, stored);
  return stored;
}

export async function hydrateSpatialGeometryLayersCache(
  key: string
): Promise<SpatialGeometryLayersCacheEntry | null> {
  return hydrateIndexedDbRecordEntry(storeConfig, key, memory);
}

export function setSpatialGeometryLayersCache(
  key: string,
  entry: Omit<SpatialGeometryLayersCacheEntry, "updatedAt"> & {
    updatedAt?: number;
  }
): void {
  const next: SpatialGeometryLayersCacheEntry = {
    layers: entry.layers,
    totalCountsByTableId: entry.totalCountsByTableId,
    updatedAt: entry.updatedAt ?? Date.now(),
  };
  memory.set(key, next);
  void persistIndexedDbRecordEntry(storeConfig, key, next, memory);
}

export function invalidateSpatialGeometryLayersCache(projectId?: string): void {
  if (!projectId) {
    void invalidateIndexedDbRecordNamespace(storeConfig, memory);
    return;
  }
  void invalidateIndexedDbRecordNamespace(storeConfig, memory, `${projectId}:`);
}

export function totalCountsRecordToMap(
  record: Record<string, number>
): Map<string, number> {
  return new Map(Object.entries(record));
}

export function totalCountsMapToRecord(
  map: Map<string, number>
): Record<string, number> {
  return Object.fromEntries(map);
}
