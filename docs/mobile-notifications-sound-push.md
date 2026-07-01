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
| `PUSH_WEBHOOK_SECRET` | Edge Function + `core_pm.push_dispatch_config` |

Generate VAPID (sekali):

```bash
npx web-push generate-vapid-keys
```

### Deploy checklist

1. `npx supabase db push` — migration `0069` + `0070` + `0071`
2. Deploy function: `npx supabase functions deploy send-web-push --no-verify-jwt`
3. Set secrets: `VAPID_*`, `SUPABASE_SERVICE_ROLE_KEY`, `PUSH_WEBHOOK_SECRET`
4. **SQL Editor** — isi config dispatch (ganti project ref & secret):

```sql
update core_pm.push_dispatch_config
set
  function_url = 'https://<PROJECT_REF>.supabase.co/functions/v1/send-web-push',
  webhook_secret = '<PUSH_WEBHOOK_SECRET>',
  updated_at = now()
where id = 1;
```

**Catatan Supabase hosted:** `alter database set core_pm.push_*` dan `supabase_functions.http_request` **tidak tersedia**. UI webhook hanya menampilkan tabel `public`; `core_pm.push_outbox` diproses otomatis via trigger `pg_net` setelah langkah 4.

Migration **`0071_push_service_role_schema_grant.sql`** — wajib agar Edge Function bisa baca `core_pm` via service role:

```sql
grant usage on schema core_pm to service_role;
```

---

## Perilaku client (patch)

| Area | Perilaku |
|------|----------|
| **Bunyi in-app** | `AudioContext.resume()` dipanggil sebelum setiap bunyi + pada tap / tab visible |
| **Push subscribe** | Retry otomatis (0 → 3s → 10s → 30s) jika gagal sementara; ulang saat tab visible jika izin sudah granted |

---

## Pengujian QA

| # | Skenario | Harapan |
|---|----------|---------|
| 1 | App terbuka, pesan dari user lain | Bunyi Fase A |
| 2 | PWA installed, izin push, app di-kill, pesan masuk | Notifikasi OS + bunyi sistem |
| 3 | Tap notifikasi | Buka workspace ke tab/url yang sesuai |
| 4 | Pesan sendiri | Tidak push / tidak bunyi |

---

## Troubleshooting (QA nyata)

### Fase A — bunyi in-app tidak keluar, chat realtime jalan

| Gejala | Penyebab | Solusi |
|--------|----------|--------|
| Pesan masuk cepat, tidak ada bunyi | `AudioContext` suspended (autoplay policy Android) | Patch: resume sebelum play + unlock pada tap/visible |
| Bunyi hanya setelah tap tepat sebelum pesan | Context belum running saat Realtime callback | Sama; pastikan redeploy setelah patch |
| Getar tidak terasa | `navigator.vibrate` dari callback async sering diabaikan Chrome Android | Gunakan getar notifikasi OS (Fase B); in-app getar opsional |

Cek cepat: `localStorage.getItem('pm-notification-sound-v1-enabled')` tidak boleh `'0'` / `'false'`.

---

### Fase B — push OS tidak muncul

#### 1. `push_subscriptions` kosong

Izin **Allow** saja tidak cukup — harus ada baris di DB.

```sql
select count(*) from core_pm.push_subscriptions;
select user_id, left(endpoint, 50), created_at
from core_pm.push_subscriptions order by created_at desc limit 5;
```

| Penyebab | Solusi |
|----------|--------|
| Subscribe gagal diam-diam (VAPID belum deploy, SW belum ready) | Buka workspace + tap; patch retry otomatis |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` kosong di build Vercel | Set env Preview **dan** Production → redeploy |
| Bukan production build | Push subscribe hanya jalan jika `NODE_ENV === 'production'` |

Endpoint normal Chrome Android: `https://fcm.googleapis.com/fcm/send/...`

#### 2. `push_outbox` ada, `sent_at` null, `last_error` null

Dispatch atau Edge Function tidak menyelesaikan proses.

```sql
select function_url,
  case when webhook_secret = '' then 'KOSONG' else 'terisi' end
from core_pm.push_dispatch_config where id = 1;

select status_code, left(content, 200), created
from net._http_response order by created desc limit 5;
```

| `status_code` / isi | Arti | Solusi |
|---------------------|------|--------|
| Tidak ada baris pg_net | Config dispatch kosong / migration `0070` belum | Isi `push_dispatch_config` |
| `401` | `PUSH_WEBHOOK_SECRET` ≠ `webhook_secret` di DB | Samakan secret di Edge secrets + SQL update |
| `500` + `permission denied for schema core_pm` | `service_role` tanpa `USAGE` pada schema | Migration `0071` / `grant usage on schema core_pm to service_role` |
| `200` + `"sent":1` | Push terkirim ke FCM | Cek HP / VAPID public key match Vercel vs Edge |

**`PUSH_WEBHOOK_SECRET` di mana?** Nilai yang Anda buat sendiri; disimpan di Supabase Edge secrets **dan** `core_pm.push_dispatch_config.webhook_secret` (baca via SQL Editor). Dashboard secrets biasanya tidak menampilkan ulang nilai setelah diset.

#### 3. Uji manual Edge Function (outbox stuck)

**PowerShell** — pakai single quotes pada body JSON:

```powershell
curl.exe -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/send-web-push" -H "Authorization: Bearer <PUSH_WEBHOOK_SECRET>" -H "Content-Type: application/json" -d '{"outbox_id": "<UUID>"}'
```

Atau `Invoke-RestMethod` dengan `$body = '{"outbox_id": "..."}'`.

Jangan pakai `\"` di PowerShell — menghasilkan `Invalid JSON`.

Harapan: `{"ok":true,"sent":1,...}` dan `sent_at` terisi di `push_outbox`.

#### 4. Checklist sukses end-to-end

1. `push_subscriptions` ≥ 1 baris untuk user penerima
2. `grant usage on schema core_pm to service_role` sudah jalan
3. `push_dispatch_config` terisi URL + secret
4. Kill PWA → pesan dari akun lain → notifikasi OS ≤ ~30–60 detik

---

*Terakhir diperbarui: 2026-07-01 — troubleshooting QA + patch retry/audio.*
