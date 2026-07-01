import type { OrganizationMemberRow } from "@/app/workspace-client";
import type { ProjectRow } from "@/app/workspace-client";
import type { OrganizationModuleRow } from "@/app/workspace-modules";
import { fetchWorkspaceDeferredPayloadAction } from "@/app/fetch-workspace-deferred-payload-action";
import {
  shouldAllowBackgroundPrefetch,
  shouldAllowBackgroundPrefetchAsync,
} from "@/lib/client-background-cache-policy";
import {
  buildWorkspaceDeferredPayloadCacheKey,
  getWorkspaceDeferredPayloadCache,
  setWorkspaceDeferredPayloadCache,
} from "@/lib/workspace-deferred-payload-cache";

const inFlightByKey = new Map<string, Promise<void>>();

/** Deferred payload (Map/PLM/…) → IndexedDB untuk tab non-Chat (PR-G2-6). */
export async function prefetchWorkspaceDeferredPayloadIfNeeded(input: {
  organizationId: string;
  selectedProjectId: string | null;
  projectsInOrg: ProjectRow[];
  organizationModules: OrganizationModuleRow[];
  organizationMembers: OrganizationMemberRow[];
}): Promise<void> {
  if (!input.organizationId || input.projectsInOrg.length === 0) return;
  if (!shouldAllowBackgroundPrefetch()) return;
  if (!(await shouldAllowBackgroundPrefetchAsync())) return;

  const scopedProjectIds = input.projectsInOrg.map((p) => p.id);
  const cacheKey = buildWorkspaceDeferredPayloadCacheKey(
    input.organizationId,
    input.selectedProjectId,
    scopedProjectIds
  );
  const cached = getWorkspaceDeferredPayloadCache(cacheKey);
  if (cached) return;

  const existing = inFlightByKey.get(cacheKey);
  if (existing) return existing;

  const run = (async () => {
    const res = await fetchWorkspaceDeferredPayloadAction({
      organizationId: input.organizationId,
      selectedProjectId: input.selectedProjectId,
      scopedProjectIds,
      organizationModules: input.organizationModules,
      organizationMembers: input.organizationMembers,
      projectList: input.projectsInOrg,
    });
    if (res.data) {
      setWorkspaceDeferredPayloadCache(cacheKey, res.data);
    }
  })().finally(() => {
    inFlightByKey.delete(cacheKey);
  });

  inFlightByKey.set(cacheKey, run);
  return run;
}
