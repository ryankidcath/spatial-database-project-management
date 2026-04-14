"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import {
  addPengukuranAlatAction,
  addPengukuranDokumenAction,
  addPengukuranSurveyorAction,
  createPengukuranLapanganAction,
  deletePengukuranAlatAction,
  deletePengukuranSurveyorAction,
  patchPengukuranLapanganAction,
} from "./plm-pengukuran-actions";
import type {
  AlatUkurRow,
  PengukuranAlatRow,
  PengukuranDokumenRow,
  PengukuranLapanganRow,
  PengukuranSurveyorRow,
  PermohonanInfoSpasialRow,
} from "./plm-pengukuran-types";
import {
  PLM_STORAGE_BUCKET_PENGUKURAN,
  isPendingStorageKey,
  pengukuranStorageObjectPath,
} from "./plm-storage";
import { formatShortDate } from "./schedule-utils";

type Props = {
  berkasId: string;
  organizationId: string | null;
  permohonan: PermohonanInfoSpasialRow | null;
  pengukuranLapangan: PengukuranLapanganRow[];
  pengukuranSurveyor: PengukuranSurveyorRow[];
  pengukuranAlat: PengukuranAlatRow[];
  pengukuranDokumen: PengukuranDokumenRow[];
  alatUkur: AlatUkurRow[];
};

const STATUS_OPTIONS = [
  { value: "dijadwalkan", label: "Dijadwalkan" },
  { value: "diukur", label: "Diukur" },
  { value: "olah_cad", label: "Olah CAD" },
  { value: "selesai", label: "Selesai" },
];

function dateVal(v: string | null | undefined): string {
  if (!v) return "";
  return v.length >= 10 ? v.slice(0, 10) : v;
}

export function PengukuranPanel({
  berkasId,
  organizationId,
  permohonan,
  pengukuranLapangan,
  pengukuranSurveyor,
  pengukuranAlat,
  pengukuranDokumen,
  alatUkur,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const list = useMemo(
    () =>
      [...pengukuranLapangan].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      ),
    [pengukuranLapangan]
  );

  const [selectedId, setSelectedId] = useState(() => list[0]?.id ?? "");

  const resolvedId = useMemo(() => {
    if (list.length === 0) return "";
    if (list.some((r) => r.id === selectedId)) return selectedId;
    return list[0].id;
  }, [list, selectedId]);

  const selected = list.find((r) => r.id === resolvedId);
  const surveyors = pengukuranSurveyor.filter(
    (s) => s.pengukuran_id === resolvedId
  );
  const alatRows = pengukuranAlat.filter((a) => a.pengukuran_id === resolvedId);
  const dokRows = pengukuranDokumen.filter((d) => d.pengukuran_id === resolvedId);

  const alatChoices = useMemo(
    () =>
      organizationId
        ? alatUkur.filter(
            (a) => a.organization_id === organizationId && a.is_active
          )
        : [],
    [alatUkur, organizationId]
  );

  const canCreatePengukuran =
    permohonan?.status_hasil === "layak_lanjut" && organizationId;

  return (
    <div className="rounded-lg border border-cyan-200 bg-cyan-50/30 p-4">
      <p className="text-sm font-semibold text-cyan-950">Pengukuran lapangan</p>
      <p className="mt-0.5 text-xs text-slate-600">
        §3.10 — header kegiatan, surveyor, alat GNSS (maks. 2), dokumen GU/CAD.
      </p>

      <div className="mt-3 rounded border border-cyan-100 bg-white/80 px-3 py-2 text-xs text-slate-700">
        <span className="font-medium text-slate-800">Informasi spasial: </span>
        {permohonan ? (
          <>
            status <strong>{permohonan.status_hasil}</strong>
            {permohonan.tanggal_download_hasil
              ? ` · unduh ${formatShortDate(permohonan.tanggal_download_hasil)}`
              : null}
          </>
        ) : (
          <span className="text-amber-800">
            Belum ada baris permohonan — pengukuran baru tidak bisa dibuat.
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            setMsg(null);
            startTransition(async () => {
              const res = await createPengukuranLapanganAction(fd);
              if (res.error) setMsg(res.error);
              else router.refresh();
            });
          }}
        >
          <input type="hidden" name="berkas_id" value={berkasId} />
          <button
            type="submit"
            disabled={pending || !canCreatePengukuran}
            title={
              canCreatePengukuran
                ? "Tambah satu kegiatan pengukuran"
                : "Perlu permohonan informasi spasial layak_lanjut"
            }
            className="rounded-md bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-800 disabled:opacity-50"
          >
            + Kegiatan pengukuran baru
          </button>
        </form>
      </div>

      {list.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          Belum ada pengukuran untuk berkas ini.
        </p>
      ) : null}

      {msg ? (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {msg}
        </p>
      ) : null}

      {selected ? (
        <div className="mt-4 space-y-4 border-t border-cyan-100 pt-4">
          {list.length > 1 ? (
            <label className="block text-xs text-slate-600">
              Pilih kegiatan
              <select
                className="mt-0.5 block w-full max-w-md rounded border border-slate-200 px-2 py-1 text-sm"
                value={resolvedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {list.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.status} · {formatShortDate(r.created_at)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <form
            key={resolvedId}
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setMsg(null);
              startTransition(async () => {
                const res = await patchPengukuranLapanganAction(fd);
                if (res.error) setMsg(res.error);
                else router.refresh();
              });
            }}
          >
            <input type="hidden" name="pengukuran_id" value={selected.id} />
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-slate-600">
                Nomor surat tugas
                <input
                  name="nomor_surat_tugas"
                  defaultValue={selected.nomor_surat_tugas ?? ""}
                  className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Tanggal surat tugas
                <input
                  type="date"
                  name="tanggal_surat_tugas"
                  defaultValue={dateVal(selected.tanggal_surat_tugas)}
                  className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Nomor surat pemberitahuan
                <input
                  name="nomor_surat_pemberitahuan"
                  defaultValue={selected.nomor_surat_pemberitahuan ?? ""}
                  className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Tanggal surat pemberitahuan
                <input
                  type="date"
                  name="tanggal_surat_pemberitahuan"
                  defaultValue={dateVal(selected.tanggal_surat_pemberitahuan)}
                  className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Tanggal janji ukur
                <input
                  type="date"
                  name="tanggal_janji_ukur"
                  defaultValue={dateVal(selected.tanggal_janji_ukur)}
                  className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Tanggal realisasi ukur
                <input
                  type="date"
                  name="tanggal_realisasi_ukur"
                  defaultValue={dateVal(selected.tanggal_realisasi_ukur)}
                  className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs text-slate-600">
                Status
                <select
                  name="status"
                  defaultValue={selected.status}
                  className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-slate-600 sm:col-span-2">
                Catatan
                <textarea
                  name="catatan"
                  rows={2}
                  defaultValue={selected.catatan ?? ""}
                  className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
            >
              Simpan header
            </button>
          </form>

          <div>
            <p className="text-xs font-semibold text-slate-700">Surveyor</p>
            <ul className="mt-1 space-y-1 text-xs text-slate-600">
              {surveyors.length === 0 ? (
                <li className="text-slate-400">Belum ada.</li>
              ) : (
                surveyors.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      {s.peran}
                      {s.surveyor_user_id
                        ? ` · user ${s.surveyor_user_id.slice(0, 8)}…`
                        : ""}
                    </span>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        setMsg(null);
                        startTransition(async () => {
                          const res = await deletePengukuranSurveyorAction(fd);
                          if (res.error) setMsg(res.error);
                          else router.refresh();
                        });
                      }}
                    >
                      <input type="hidden" name="surveyor_id" value={s.id} />
                      <button
                        type="submit"
                        disabled={pending}
                        className="text-[11px] text-red-700 hover:underline disabled:opacity-50"
                      >
                        Hapus
                      </button>
                    </form>
                  </li>
                ))
              )}
            </ul>
            <form
              className="mt-2 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setMsg(null);
                startTransition(async () => {
                  const res = await addPengukuranSurveyorAction(fd);
                  if (res.error) setMsg(res.error);
                  else router.refresh();
                });
              }}
            >
              <input type="hidden" name="pengukuran_id" value={selected.id} />
              <label className="text-xs text-slate-600">
                Peran
                <select
                  name="peran"
                  className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-sm"
                >
                  <option value="ketua">Ketua</option>
                  <option value="anggota">Anggota</option>
                </select>
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs text-cyan-900 disabled:opacity-50"
              >
                + Surveyor
              </button>
            </form>
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700">
              Alat (maks. 2 / kegiatan)
            </p>
            <ul className="mt-1 space-y-1 text-xs text-slate-600">
              {alatRows.length === 0 ? (
                <li className="text-slate-400">Belum ada.</li>
              ) : (
                alatRows.map((row) => {
                  const al = alatUkur.find((x) => x.id === row.alat_id);
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <span>
                        {al?.kode_aset ?? row.alat_id} · {row.peran_alat}
                      </span>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const fd = new FormData(e.currentTarget);
                          setMsg(null);
                          startTransition(async () => {
                            const res = await deletePengukuranAlatAction(fd);
                            if (res.error) setMsg(res.error);
                            else router.refresh();
                          });
                        }}
                      >
                        <input
                          type="hidden"
                          name="pengukuran_alat_id"
                          value={row.id}
                        />
                        <button
                          type="submit"
                          disabled={pending}
                          className="text-[11px] text-red-700 hover:underline disabled:opacity-50"
                        >
                          Hapus
                        </button>
                      </form>
                    </li>
                  );
                })
              )}
            </ul>
            {alatChoices.length === 0 ? (
              <p className="mt-2 text-xs text-amber-800">
                Tidak ada master alat untuk organisasi project ini.
              </p>
            ) : (
              <form
                className="mt-2 flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  setMsg(null);
                  startTransition(async () => {
                    const res = await addPengukuranAlatAction(fd);
                    if (res.error) setMsg(res.error);
                    else router.refresh();
                  });
                }}
              >
                <input type="hidden" name="pengukuran_id" value={selected.id} />
                <label className="text-xs text-slate-600">
                  Alat
                  <select
                    name="alat_id"
                    className="mt-0.5 block max-w-xs rounded border border-slate-200 px-2 py-1 text-sm"
                  >
                    {alatChoices.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.kode_aset}
                        {a.merek_model ? ` — ${a.merek_model}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-600">
                  Peran alat
                  <select
                    name="peran_alat"
                    className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-sm"
                  >
                    <option value="base">Base</option>
                    <option value="rover">Rover</option>
                    <option value="unit_1">Unit 1</option>
                    <option value="unit_2">Unit 2</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={pending || alatRows.length >= 2}
                  className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs text-cyan-900 disabled:opacity-50"
                >
                  + Alat
                </button>
              </form>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold text-slate-700">Dokumen</p>
            <ul className="mt-1 max-h-24 space-y-1 overflow-y-auto text-xs text-slate-600">
              {dokRows.length === 0 ? (
                <li className="text-slate-400">Belum ada.</li>
              ) : (
                dokRows.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center gap-2">
                    <span>
                      <span className="font-mono text-cyan-900">{d.tipe_dokumen}</span>{" "}
                      — {d.file_name}
                    </span>
                    {!isPendingStorageKey(d.storage_key) && d.storage_key ? (
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
                            .from(PLM_STORAGE_BUCKET_PENGUKURAN)
                            .createSignedUrl(d.storage_key!, 3600);
                          if (suErr || !data?.signedUrl) {
                            setMsg(suErr?.message ?? "Gagal membuat tautan unduh");
                            return;
                          }
                          window.open(
                            data.signedUrl,
                            "_blank",
                            "noopener,noreferrer"
                          );
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
              className="mt-2 flex flex-wrap items-end gap-2"
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
                    const path = pengukuranStorageObjectPath(selected.id, blob.name);
                    const { error: upErr } = await sb.storage
                      .from(PLM_STORAGE_BUCKET_PENGUKURAN)
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
                  const res = await addPengukuranDokumenAction(fd);
                  if (res.error) setMsg(res.error);
                  else {
                    form.reset();
                    router.refresh();
                  }
                });
              }}
            >
              <input type="hidden" name="pengukuran_id" value={selected.id} />
              <label className="text-xs text-slate-600">
                Tipe
                <select
                  name="tipe_dokumen"
                  className="mt-0.5 block rounded border border-slate-200 px-2 py-1 text-sm"
                >
                  <option value="gu_referensi">GU referensi</option>
                  <option value="hasil_cad">Hasil CAD</option>
                </select>
              </label>
              <label className="min-w-[10rem] text-xs text-slate-600">
                File
                <input
                  type="file"
                  name="file_blob"
                  className="mt-0.5 block w-full max-w-xs text-xs file:mr-2 file:rounded file:border file:border-slate-200 file:bg-white file:px-2 file:py-1"
                />
              </label>
              <label className="min-w-[8rem] flex-1 text-xs text-slate-600">
                Nama file (opsional jika unggah)
                <input
                  name="file_name"
                  className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                  placeholder="gambar.dwg"
                />
              </label>
              <button
                type="submit"
                disabled={pending}
                className="rounded border border-cyan-200 bg-cyan-50 px-2 py-1 text-xs text-cyan-900 disabled:opacity-50"
              >
                + Dokumen
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
