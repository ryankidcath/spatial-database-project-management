"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchWorkspaceShell } from "@/lib/workspace-shell-server";
import type { WorkspaceShellPayload } from "@/lib/workspace-shell-types";

export async function fetchWorkspaceShellAction(): Promise<{
  error: string | null;
  data: WorkspaceShellPayload | null;
}> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return { error: "Supabase tidak dikonfigurasi", data: null };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Belum masuk", data: null };
  }

  try {
    const data = await fetchWorkspaceShell(supabase);
    return { error: data.fetchError, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, data: null };
  }
}
