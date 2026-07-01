# Notifikasi mobile — bunyi in-app & push (rencana)

**Status:** Fase A & B selesai (deploy Edge Function + migration diperlukan).  
**Tanggal:** 2026-07-01  
**Konteks:** User ingin mendengar bunyi saat ada notifikasi (chat & workspace) saat app masih hidup, dan notifikasi OS saat app di-kill.

Referensi terkait:

- `docs/notifikasi-event-matrix.md` — jenis event workspace (arsip lonceng + tab Aktivitas)
- `docs/chat-feature-decisions.md` — unread & mention chat
- `docs/pwa-mobile-gestures-overscroll.md` — PWA installed
- `docs/mobile-cold-start-cache-strategy.md` — service worker (PR-E)
- `DEPLOY.md` — VAPID, Edge Function, DB settings
- `supabase/migrations/0069_push_subscriptions.sql` — skema push
- `supabase/functions/send-web-push/` — pengirim Web Push

---

## Ringkasan fase

| Fase | Cakupan | App tertutup / di-kill? |
|------|---------|-------------------------|
| **A** ✅ | Bunyi + getar ringan via Web Audio saat Realtime INSERT | ❌ Hanya saat app/tab hidup & visible |
| **B** ✅ | Web Push + `showNotification` di SW + VAPID + Edge Function | ✅ PWA installed + izin OS |

**Default:** bunyi (A) dan push (B) aktif; pengaturan UI on/off direncanakan berikutnya.

---

## Saluran notifikasi

| Sumber DB | In-app (A) | Push OS (B) |
|-----------|------------|-------------|
| `chat_messages` INSERT | Bunyi chat | Push ke anggota room (kecuali pengirim) |
| `user_notifications` INSERT | Bunyi workspace | Push ke `user_id` penerima |

Trigger DB → `push_outbox` → `pg_net` / webhook → Edge Function `send-web-push`.

---

## Fase A — implementasi ✅

| Item | File |
|------|------|
| A1 | `notification-sound.ts` |
| A2 | `notification-sound-unlock.tsx` |
| A3 | `notification-sound-listener.tsx` |
| A4 | `workspace-client.tsx` |

---

## Fase B — implementasi ✅

| Item | File / area |
|------|-------------|
| B1 | `push_subscriptions` + `savePushSubscriptionAction` + `PwaPushSubscription` |
| B2 | `push_outbox` + trigger chat/notifications + `send-web-push` Edge Function |
| B3 | `sw.js` — `push`, `notificationclick` |
| B4 | OS sound via `silent: false` pada `showNotification` |

### Env

| Variabel | Scope |
|----------|--------|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel + lokal |
| `VAPID_PRIVATE_KEY` | Edge Function secrets saja |
| `VAPID_SUBJECT` | `mailto:...` (Edge Function) |
| `PUSH_WEBHOOK_SECRET` | Edge Function + DB `core_pm.push_function_secret` |

Generate VAPID (sekali):

```bash
npx web-push generate-vapid-keys
```

### Deploy checklist

1. `npx supabase db push` — migration `0069`
2. Deploy function: `npx supabase functions deploy send-web-push --no-verify-jwt`
3. Set secrets: `VAPID_*`, `SUPABASE_SERVICE_ROLE_KEY`, `PUSH_WEBHOOK_SECRET`
4. SQL (sekali di Supabase SQL editor):

```sql
alter database postgres set core_pm.push_function_url = 'https://<PROJECT_REF>.supabase.co/functions/v1/send-web-push';
alter database postgres set core_pm.push_function_secret = '<PUSH_WEBHOOK_SECRET>';
```

Alternatif: **Database Webhook** pada `push_outbox` INSERT → Edge Function (body berisi `record`).

---

## Pengujian QA

| # | Skenario | Harapan |
|---|----------|---------|
| 1 | App terbuka, pesan dari user lain | Bunyi Fase A |
| 2 | PWA installed, izin push, app di-kill, pesan masuk | Notifikasi OS + bunyi sistem |
| 3 | Tap notifikasi | Buka workspace ke tab/url yang sesuai |
| 4 | Pesan sendiri | Tidak push / tidak bunyi |

---

*Terakhir diperbarui: 2026-07-01 — Fase B implementasi.*
