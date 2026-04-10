import { Suspense } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  WorkspaceClient,
  type IssueRow,
  type OrganizationRow,
  type ProjectRow,
  type StatusRow,
} from "./workspace-client";

export default async function Home() {
  const supabase = createServerSupabaseClient();

  if (!supabase) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-lg border border-amber-200 bg-white p-6 text-sm text-amber-900">
          <p className="font-semibold">Variabel lingkungan belum lengkap</p>
          <p className="mt-2">
            Set{" "}
            <code className="rounded bg-slate-100 px-1">
              NEXT_PUBLIC_SUPABASE_URL
            </code>{" "}
            dan{" "}
            <code className="rounded bg-slate-100 px-1">
              NEXT_PUBLIC_SUPABASE_ANON_KEY
            </code>{" "}
            (lokal: salin dari <code className="rounded bg-slate-100 px-1">.env.example</code> ke{" "}
            <code className="rounded bg-slate-100 px-1">app/.env.local</code>).
          </p>
        </div>
      </div>
    );
  }

  const { data: projects, error: projectsError } = await supabase
    .schema("core_pm")
    .from("projects")
    .select("id, name, key, organization_id")
    .is("deleted_at", null)
    .eq("is_archived", false)
    .order("name");

  const projectList = (projects ?? []) as ProjectRow[];
  const orgIds = [
    ...new Set(projectList.map((p) => p.organization_id).filter(Boolean)),
  ];

  const { data: organizations, error: orgsError } =
    orgIds.length > 0
      ? await supabase
          .schema("core_pm")
          .from("organizations")
          .select("id, name, slug")
          .in("id", orgIds)
          .is("deleted_at", null)
          .order("name")
      : { data: [] as OrganizationRow[], error: null };

  const { data: statuses, error: statusesError } = await supabase
    .schema("core_pm")
    .from("statuses")
    .select("id, project_id, name, category, position")
    .order("project_id")
    .order("position", { ascending: true });

  const { data: issues, error: issuesError } = await supabase
    .schema("core_pm")
    .from("issues")
    .select(
      "id, project_id, parent_id, status_id, key_display, title, sort_order, starts_at, due_at"
    )
    .is("deleted_at", null)
    .order("sort_order");

  const fetchError =
    projectsError?.message ??
    orgsError?.message ??
    statusesError?.message ??
    issuesError?.message ??
    null;

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
          Memuat workspace…
        </div>
      }
    >
      <WorkspaceClient
        organizations={(organizations ?? []) as OrganizationRow[]}
        projects={projectList}
        statuses={(statuses ?? []) as StatusRow[]}
        issues={(issues ?? []) as IssueRow[]}
        fetchError={fetchError}
      />
    </Suspense>
  );
}
