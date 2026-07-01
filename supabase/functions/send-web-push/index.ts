import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3";

type PushPayload = {
  title: string;
  body?: string;
  url?: string;
  tag?: string;
};

type OutboxRow = {
  id: string;
  user_id: string;
  title: string;
  body: string | null;
  url: string;
  tag: string | null;
  payload: Record<string, unknown>;
};

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth_key: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function configureWebPush(): void {
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@spatial-pm.local";
  webpush.setVapidDetails(
    subject,
    getEnv("VAPID_PUBLIC_KEY"),
    getEnv("VAPID_PRIVATE_KEY")
  );
}

function parseBody(
  raw: Record<string, unknown>
): { outboxId: string | null; webhookRecord: OutboxRow | null } {
  const outboxId =
    typeof raw.outbox_id === "string"
      ? raw.outbox_id
      : typeof raw.outboxId === "string"
        ? raw.outboxId
        : null;

  const record = raw.record as Record<string, unknown> | undefined;
  if (record && typeof record.id === "string" && typeof record.user_id === "string") {
    return {
      outboxId: record.id,
      webhookRecord: {
        id: record.id,
        user_id: String(record.user_id),
        title: String(record.title ?? "Spatial PM"),
        body: record.body != null ? String(record.body) : null,
        url: String(record.url ?? "/"),
        tag: record.tag != null ? String(record.tag) : null,
        payload:
          record.payload && typeof record.payload === "object"
            ? (record.payload as Record<string, unknown>)
            : {},
      },
    };
  }

  return { outboxId, webhookRecord: null };
}

async function sendToSubscription(
  sub: SubscriptionRow,
  payload: PushPayload
): Promise<void> {
  await webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth_key },
    },
    JSON.stringify(payload)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const expectedSecret = Deno.env.get("PUSH_WEBHOOK_SECRET") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const authorized =
    (expectedSecret !== "" &&
      authHeader === `Bearer ${expectedSecret}`) ||
    (serviceRoleKey !== "" && authHeader === `Bearer ${serviceRoleKey}`);

  if (!authorized) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400);
  }

  const { outboxId, webhookRecord } = parseBody(body);
  if (!outboxId && !webhookRecord) {
    return jsonResponse({ error: "outbox_id required" }, 400);
  }

  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY")
  );

  let outbox: OutboxRow | null = webhookRecord;

  if (!outbox && outboxId) {
    const { data, error } = await supabase
      .schema("core_pm")
      .from("push_outbox")
      .select("id, user_id, title, body, url, tag, payload")
      .eq("id", outboxId)
      .maybeSingle();

    if (error) return jsonResponse({ error: error.message }, 500);
    if (!data) return jsonResponse({ error: "outbox not found" }, 404);
    outbox = data as OutboxRow;
  }

  if (!outbox) {
    return jsonResponse({ error: "outbox not found" }, 404);
  }

  if (outboxId) {
    const { data: existing } = await supabase
      .schema("core_pm")
      .from("push_outbox")
      .select("sent_at")
      .eq("id", outbox.id)
      .maybeSingle();
    if (existing?.sent_at) {
      return jsonResponse({ ok: true, skipped: "already_sent" });
    }
  }

  configureWebPush();

  const { data: subscriptions, error: subErr } = await supabase
    .schema("core_pm")
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth_key")
    .eq("user_id", outbox.user_id);

  if (subErr) return jsonResponse({ error: subErr.message }, 500);

  const pushPayload: PushPayload = {
    title: outbox.title,
    body: outbox.body ?? undefined,
    url: outbox.url,
    tag: outbox.tag ?? undefined,
  };

  const staleEndpoints: string[] = [];
  let sent = 0;
  let lastError: string | null = null;

  for (const row of (subscriptions ?? []) as SubscriptionRow[]) {
    try {
      await sendToSubscription(row, pushPayload);
      sent += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      lastError = message;
      if (message.includes("410") || message.includes("404")) {
        staleEndpoints.push(row.endpoint);
      }
    }
  }

  if (staleEndpoints.length > 0) {
    await supabase
      .schema("core_pm")
      .from("push_subscriptions")
      .delete()
      .in("endpoint", staleEndpoints);
  }

  const now = new Date().toISOString();
  await supabase
    .schema("core_pm")
    .from("push_outbox")
    .update({
      sent_at: sent > 0 ? now : null,
      last_error: sent > 0 ? null : lastError ?? "no_subscriptions",
    })
    .eq("id", outbox.id);

  return jsonResponse({
    ok: true,
    sent,
    subscriptions: subscriptions?.length ?? 0,
    stale_removed: staleEndpoints.length,
  });
});
