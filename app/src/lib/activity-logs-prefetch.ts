import { fetchActivityLogsAction } from "@/app/fetch-activity-logs-action";
import {
  buildActivityLogsCacheKey,
  getActivityLogsCache,
  setActivityLogsCache,
} from "@/lib/activity-logs-cache";
import {
  shouldAllowBackgroundPrefetch,
  shouldAllowBackgroundPrefetchAsync,
} from "@/lib/client-background-cache-policy";
import {
  DEFAULT_DURABLE_CACHE_TTL_MS,
  isDurableSnapshotFresh,
} from "@/lib/client-durable-storage";

let prefetchInFlight: Promise<void> | null = null;

/** Prefetch snapshot aktivitas per org (semua project dalam org). */
export async function prefetchActivityLogsIfNeeded(input: {
  organizationId: string;
  projectIds: string[];
}): Promise<void> {
  if (!input.organizationId) return;
  if (!shouldAllowBackgroundPrefetch()) return;
  if (!(await shouldAllowBackgroundPrefetchAsync())) return;

  const cacheKey = buildActivityLogsCacheKey(
    input.organizationId,
    input.projectIds
  );
  const cached = getActivityLogsCache(cacheKey);
  if (cached && isDurableSnapshotFresh(cached, DEFAULT_DURABLE_CACHE_TTL_MS)) {
    return;
  }

  if (prefetchInFlight) return prefetchInFlight;

  prefetchInFlight = (async () => {
    const res = await fetchActivityLogsAction(
      input.organizationId,
      input.projectIds
    );
    if (res.error) return;
    setActivityLogsCache(cacheKey, { logs: res.logs });
  })().finally(() => {
    prefetchInFlight = null;
  });

  return prefetchInFlight;
}
