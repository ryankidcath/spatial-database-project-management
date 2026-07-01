"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PushSubscriptionActionResult = { error: string | null };

export async function savePushSubscriptionAction(input: {
  endpoint: string;
  p256dh: string;
  authKey: string;
  userAgent?: string | null;
}): Promise<PushSubscriptionActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const endpoint = input.endpoint?.trim();
  const p256dh = input.p256dh?.trim();
  const authKey = input.authKey?.trim();
  if (!endpoint || !p256dh || !authKey) {
    return { error: "Subscription tidak lengkap" };
  }

  const { error } = await supabase.schema("core_pm").from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint,
      p256dh,
      auth_key: authKey,
      user_agent: input.userAgent?.slice(0, 512) ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );

  if (error) return { error: error.message };
  return { error: null };
}

export async function deletePushSubscriptionAction(
  endpoint: string
): Promise<PushSubscriptionActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const trimmed = endpoint?.trim();
  if (!trimmed) return { error: "endpoint kosong" };

  const { error } = await supabase
    .schema("core_pm")
    .from("push_subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("endpoint", trimmed);

  if (error) return { error: error.message };
  return { error: null };
}
