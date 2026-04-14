"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  addLegalisasiGuFileAction,
  advanceLegalisasiGuAction,
  createLegalisasiGuDraftAction,
  patchLegalisasiGuAction,
} from "./plm-legalisasi-actions";
import type {
  LegalisasiGuFileRow,
  LegalisasiGuHistoryRow,
  LegalisasiGuRow,
} from "./plm-legalisasi-types";
import {
  PLM_STORAGE_BUCKET_LEGALISASI,
  isPendingStorageKey,
  legalisasiStorageObjectPath,
} from "./plm-storage";
import {
  LEGALISASI_STATUS_ORDER,
  canAdvanceLegalisasi,
  legalisasiStatusIndex,
  nextLegalisasiStatus,
  statusTahapLabel,
} from "./plm-legalisasi-wizard";
import { formatShortDate } from "./schedule-utils";

type Props = {
  berkasId: string;
  rows: LegalisasiGuRow[];
  files: LegalisasiGuFileRow[];
  history: LegalisasiGuHistoryRow[];
};

const HISTORY_EVENT_LABEL: Record<string, string> = {
  patch: "Ubah data",
  advance: "Naik tahap",
  file_added: "Lampiran",
  draft_created: "Draft baru",
};

function historyPayloadPreview(p: unknown): string {
  if (p == null) return "—";
  if (typeof p !== "object" || Array.isArray(p)) {
    return String(p).slice(0, 240);
  }
  try {
    return JSON.stringify(p).slice(0, 400);
  } catch {
    return "—";
  }
}

function dateInputValue(v: string | null | undefined): string {
  if (!v) return "";
  return v.length >= 10 ? v.slice(0, 10) : v;
}

function datetimeLocalValue(v: string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const FILE_TIPE_OPTIONS: { value: string; label: string }[] = [
  { value: "hasil_ukur", label: "Hasil ukur" },
  { value: "scan_berkas", label: "Scan berkas" },
  { value: "scan_sketsa_gu", label: "Scan sketsa GU" },
  { value: "sps_download", label: "Unduhan SPS" },
  { value: "gu_signed", label: "GU ter-TTE" },
  { value: "pbt_signed", label: "PBT ter-TTE" },
  { value: "dokumen_lain", label: "Dokumen lain" },
];

export function LegalisasiGuWizard({ berkasId, rows, files, history }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const sortedRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      ),
    [rows]
  );

  const [selectedId, setSelectedId] = useState(
    () => sortedRows[0]?.id ?? ""
  );

  const resolvedId = useMemo(() => {
    if (sortedRows.length === 0) return "";
    if (sortedRows.some((r) => r.id === selectedId)) return selectedId;
    return sortedRows[0].id;
  }, [sortedRows, selectedId]);

  const selected = sortedRows.find((r) => r.id === resolvedId);
  const filesFor = useMemo(
    () => files.filter((f) => f.legalisasi_gu_id === resolvedId),
    [files, resolvedId]
  );

  const historyFor = useMemo(
    () =>
      [...history]
        .filter((h) => h.legalisasi_gu_id === resolvedId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [history, resolvedId]
  );

  const advancePreview = selected
    ? canAdvanceLegalisasi(selected, filesFor)
    : { ok: false as const, message: "" };
  const nextSt = selected ? nextLegalisasiStatus(selected.status_tahap) : null;
  const idx = selected ? legalisasiStatusIndex(selected.status_tahap) : -1;

  if (sortedRows.length === 0) {
    return (
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
        <p className="text-sm font-semibold text-indigo-950">
          Legalisasi GU (BPN)
        </p>
        <p className="mt-1 text-xs text-indigo-900/80">
          Belum ada proses legalisasi. Buat draft untuk memulai wizard tahap 1–6
          (metadata lampiran bisa diisi setelahnya).
        </p>
        <form
          className="mt-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setMsg(null);
            startTransition(async () => {
              const res = await createLegalisasiGuDraftAction(fd);
              if (res.error) setMsg(res.error);
              else router.refresh();
            });
          }}
        >
          <input type="hidden" name="berkas_id" value={berkasId} />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            + Buat draft legalisasi
          </button>
        </form>
        {msg ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {msg}
          </p>
        ) : null}
      </div>
    );
  }

  if (!selected) return null;

  return (
    <div className="rounded-lg border border-indigo-200 bg-white p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-indigo-950">
            Legalisasi GU (BPN)
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Simpan data lalu «Lanjut» memvalidasi gating §3.11. Lampiran diunggah
            ke bucket <span className="font-mono">plm-legalisasi</span> (RLS
            anggota project).
          </p>
        </div>
        {sortedRows.length > 1 ? (
          <label className="flex flex-col gap-0.5 text-xs text-slate-600">
            <span>Pilih proses</span>
            <select
              className="rounded border border-slate-200 bg-white px-2 py-1 text-sm"
              value={resolvedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {sortedRows.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.status_tahap} · {formatShortDate(r.created_at)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-1">
        {LEGALISASI_STATUS_ORDER.map((st, i) => {
          const done = idx > i;
          const active = idx === i;
          return (
            <span
              key={st}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                active
                  ? "bg-indigo-600 text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-900"
                    : "bg-slate-100 text-slate-500"
              }`}
              title={statusTahapLabel(st)}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-slate-600">
        Status: <strong>{selected.status_tahap}</strong> —{" "}
        {statusTahapLabel(selected.status_tahap)}
        {nextSt ? (
          <>
            {" "}
            → berikutnya: <strong>{nextSt}</strong>
          </>
        ) : null}
      </p>

      <form
        id={`leg-form-${resolvedId}`}
        key={resolvedId}
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setMsg(null);
          startTransition(async () => {
            const res = await patchLegalisasiGuAction(fd);
            if (res.error) setMsg(res.error);
            else router.refresh();
          });
        }}
      >
        <input type="hidden" name="legalisasi_gu_id" value={selected.id} />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs">
            <span className="text-slate-500">Kantor pertanahan</span>
            <input
              name="kantor_pertanahan"
              defaultValue={selected.kantor_pertanahan ?? ""}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Nomor berkas legalisasi</span>
            <input
              name="nomor_berkas_legalisasi"
              defaultValue={selected.nomor_berkas_legalisasi ?? ""}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm font-mono"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal berkas legalisasi</span>
            <input
              type="date"
              name="tanggal_berkas_legalisasi"
              defaultValue={dateInputValue(selected.tanggal_berkas_legalisasi)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs sm:col-span-2">
            <span className="text-slate-500">Penggunaan tanah</span>
            <input
              name="penggunaan_tanah"
              defaultValue={selected.penggunaan_tanah ?? ""}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Luas hasil ukur (m²)</span>
            <input
              type="number"
              name="luas_hasil_ukur"
              min={0}
              step={1}
              defaultValue={selected.luas_hasil_ukur ?? ""}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal submit (tahap 1)</span>
            <input
              type="datetime-local"
              name="tanggal_submit"
              defaultValue={datetimeLocalValue(selected.tanggal_submit)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal SPS</span>
            <input
              type="date"
              name="tanggal_sps"
              defaultValue={dateInputValue(selected.tanggal_sps)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Nominal SPS</span>
            <input
              type="number"
              name="nominal_sps"
              min={0}
              step="0.01"
              defaultValue={selected.nominal_sps ?? ""}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal bayar SPS</span>
            <input
              type="date"
              name="tanggal_bayar_sps"
              defaultValue={dateInputValue(selected.tanggal_bayar_sps)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Nomor GU</span>
            <input
              name="nomor_gu"
              defaultValue={selected.nomor_gu ?? ""}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal GU</span>
            <input
              type="date"
              name="tanggal_gu"
              defaultValue={dateInputValue(selected.tanggal_gu)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">NIB baru</span>
            <input
              name="nib_baru"
              defaultValue={selected.nib_baru ?? ""}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm font-mono"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal NIB</span>
            <input
              type="date"
              name="tanggal_nib"
              defaultValue={dateInputValue(selected.tanggal_nib)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Nomor PBT</span>
            <input
              name="nomor_pbt"
              defaultValue={selected.nomor_pbt ?? ""}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal PBT</span>
            <input
              type="date"
              name="tanggal_pbt"
              defaultValue={dateInputValue(selected.tanggal_pbt)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal TTE GU</span>
            <input
              type="date"
              name="tanggal_tte_gu"
              defaultValue={dateInputValue(selected.tanggal_tte_gu)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal TTE PBT</span>
            <input
              type="date"
              name="tanggal_tte_pbt"
              defaultValue={dateInputValue(selected.tanggal_tte_pbt)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal upload GU</span>
            <input
              type="date"
              name="tanggal_upload_gu"
              defaultValue={dateInputValue(selected.tanggal_upload_gu)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal upload PBT</span>
            <input
              type="date"
              name="tanggal_upload_pbt"
              defaultValue={dateInputValue(selected.tanggal_upload_pbt)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal persetujuan</span>
            <input
              type="date"
              name="tanggal_persetujuan"
              defaultValue={dateInputValue(selected.tanggal_persetujuan)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs">
            <span className="text-slate-500">Tanggal penyelesaian</span>
            <input
              type="date"
              name="tanggal_penyelesaian"
              defaultValue={dateInputValue(selected.tanggal_penyelesaian)}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <label className="block text-xs sm:col-span-2">
            <span className="text-slate-500">Catatan</span>
            <textarea
              name="catatan"
              rows={2}
              defaultValue={selected.catatan ?? ""}
              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            Simpan data
          </button>
          <button
            type="button"
            disabled={
              pending ||
              selected.status_tahap === "selesai" ||
              !advancePreview.ok
            }
            title={
              advancePreview.ok
                ? "Naikkan status_tahap satu langkah"
                : advancePreview.message
            }
            onClick={() => {
              setMsg(null);
              const el = document.getElementById(
                `leg-form-${resolvedId}`
              ) as HTMLFormElement | null;
              if (!el) return;
              const fd = new FormData(el);
              startTransition(async () => {
                const res = await advanceLegalisasiGuAction(fd);
                if (res.error) setMsg(res.error);
                else router.refresh();
              });
            }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            Lanjut ke tahap berikutnya
          </button>
        </div>
      </form>

      {!advancePreview.ok && selected.status_tahap !== "selesai" ? (
        <p className="mt-2 text-xs text-amber-800">{advancePreview.message}</p>
      ) : null}

      {msg ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {msg}
        </p>
      ) : null}

      <div className="mt-6 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-700">Riwayat</p>
        <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-[11px] text-slate-600">
          {historyFor.length === 0 ? (
            <li className="text-slate-400">Belum ada entri.</li>
          ) : (
            historyFor.slice(0, 30).map((h) => (
              <li key={h.id} className="border-b border-slate-50 pb-1">
                <span className="font-medium text-slate-800">
                  {HISTORY_EVENT_LABEL[h.event_kind] ?? h.event_kind}
                </span>
                <span className="text-slate-400">
                  {" "}
                  · {formatShortDate(h.created_at)}
                </span>
                <pre className="mt-0.5 max-w-full overflow-x-auto whitespace-pre-wrap break-all font-mono text-[10px] text-slate-500">
                  {historyPayloadPreview(h.payload)}
                </pre>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <p className="text-xs font-semibold text-slate-700">Lampiran</p>
        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-600">
          {filesFor.length === 0 ? (
            <li className="text-slate-400">Belum ada lampiran.</li>
          ) : (
            filesFor.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2">
                <span>
                  <span className="font-mono text-indigo-800">{f.tipe_file}</span>{" "}
                  — {f.file_name}
                </span>
                {!isPendingStorageKey(f.storage_key) && f.storage_key ? (
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700 hover:bg-slate-50"
                    onClick={async () => {
                      const sb = getBrowserSupabaseClient();
                      if (!sb) {
                        setMsg("Supabase tidak dikonfigurasi");
                        return;
                      }
                      const { data, error: suErr } = await sb.storage
                        .from(PLM_STORAGE_BUCKET_LEGALISASI)
                        .createSignedUrl(f.storage_key!, 3600);
                      if (suErr || !data?.signedUrl) {
                        setMsg(suErr?.message ?? "Gagal membuat tautan unduh");
                        return;
                      }
                      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                    }}
                  >
                    Unduh
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const blob = (form.elements.namedItem("file_blob") as HTMLInputElement)
              ?.files?.[0];
            setMsg(null);
            startTransition(async () => {
              if (blob) {
                const sb = getBrowserSupabaseClient();
                if (!sb) {
                  setMsg("Supabase tidak dikonfigurasi di browser");
                  return;
                }
                const path = legalisasiStorageObjectPath(selected.id, blob.name);
                const { error: upErr } = await sb.storage
                  .from(PLM_STORAGE_BUCKET_LEGALISASI)
                  .upload(path, blob, {
                    contentType: blob.type || undefined,
                    upsert: false,
                  });
                if (upErr) {
                  setMsg(upErr.message);
                  return;
                }
                fd.set("storage_key", path);
                fd.set("file_name", blob.name);
                if (blob.type) fd.set("mime_type", blob.type);
              }
              const res = await addLegalisasiGuFileAction(fd);
              if (res.error) setMsg(res.error);
              else {
                form.reset();
                router.refresh();
              }
            });
          }}
        >
          <input type="hidden" name="legalisasi_gu_id" value={selected.id} />
          <label className="text-xs text-slate-600">
            Tipe
            <select
              name="tipe_file"
              className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-sm"
            >
              {FILE_TIPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[12rem] text-xs text-slate-600">
            File (disarankan)
            <input
              type="file"
              name="file_blob"
              className="mt-0.5 block w-full max-w-xs text-xs file:mr-2 file:rounded file:border file:border-slate-200 file:bg-white file:px-2 file:py-1"
            />
          </label>
          <label className="min-w-[10rem] flex-1 text-xs text-slate-600">
            Nama file (tanpa unggah)
            <input
              name="file_name"
              placeholder="contoh: sketsa.pdf"
              className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-sm text-indigo-900 hover:bg-indigo-100 disabled:opacity-50"
          >
            + Catat lampiran
          </button>
        </form>
        <p className="mt-1 text-[10px] text-slate-400">
          Tanpa file: metadata saja dengan kunci pending (uji). Dengan file:
          unggah dulu lalu simpan baris di DB.
        </p>
      </div>
    </div>
  );
}
