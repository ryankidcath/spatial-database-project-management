"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatShortDate } from "./schedule-utils";
import { updateBerkasStatusAction } from "./plm-berkas-actions";
import {
  BERKAS_STATUS_STEPS,
  berkasStatusStepIndex,
} from "./plm-berkas-status";
import { LegalisasiGuWizard } from "./legalisasi-gu-wizard";
import { PengukuranPanel } from "./pengukuran-panel";
import type {
  LegalisasiGuFileRow,
  LegalisasiGuHistoryRow,
  LegalisasiGuRow,
} from "./plm-legalisasi-types";
import type {
  AlatUkurRow,
  PengukuranAlatRow,
  PengukuranDokumenRow,
  PengukuranLapanganRow,
  PengukuranSurveyorRow,
  PermohonanInfoSpasialRow,
} from "./plm-pengukuran-types";
import { pemilikLinesForBerkas, type BerkasPermohonanRow } from "./plm-berkas-types";

type Props = {
  berkas: BerkasPermohonanRow;
  projectName: string;
  onBack: () => void;
  /** Ada geometri hasil ukur di peta untuk berkas ini (F4-3). */
  hasBidangDiMap?: boolean;
  /** Buka tab Map + sorotan `berkas=` */
  onLihatDiPeta?: () => void;
  legalisasiGuRows?: LegalisasiGuRow[];
  legalisasiGuFiles?: LegalisasiGuFileRow[];
  legalisasiGuHistory?: LegalisasiGuHistoryRow[];
  organizationId?: string | null;
  permohonanInfoSpasial?: PermohonanInfoSpasialRow[];
  pengukuranLapangan?: PengukuranLapanganRow[];
  pengukuranSurveyor?: PengukuranSurveyorRow[];
  pengukuranAlat?: PengukuranAlatRow[];
  pengukuranDokumen?: PengukuranDokumenRow[];
  alatUkur?: AlatUkurRow[];
};

export function BerkasDetailPanel({
  berkas,
  projectName,
  onBack,
  hasBidangDiMap = false,
  onLihatDiPeta,
  legalisasiGuRows = [],
  legalisasiGuFiles = [],
  legalisasiGuHistory = [],
  organizationId = null,
  permohonanInfoSpasial = [],
  pengukuranLapangan = [],
  pengukuranSurveyor = [],
  pengukuranAlat = [],
  pengukuranDokumen = [],
  alatUkur = [],
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const currentIdx = berkasStatusStepIndex(berkas.status);
  const pemilikLines = pemilikLinesForBerkas(berkas);
  const legsForBerkas = legalisasiGuRows.filter((r) => r.berkas_id === berkas.id);
  const legIds = new Set(legsForBerkas.map((r) => r.id));
  const filesForBerkas = legalisasiGuFiles.filter((f) =>
    legIds.has(f.legalisasi_gu_id)
  );
  const historyForBerkas = legalisasiGuHistory.filter((h) =>
    legIds.has(h.legalisasi_gu_id)
  );

  const permohonanForBerkas =
    permohonanInfoSpasial.find((p) => p.berkas_id === berkas.id) ?? null;
  const pengForBerkas = pengukuranLapangan.filter(
    (p) => p.berkas_id === berkas.id
  );
  const pengIds = new Set(pengForBerkas.map((p) => p.id));
  const surveyForBerkas = pengukuranSurveyor.filter((s) =>
    pengIds.has(s.pengukuran_id)
  );
  const alatLinkForBerkas = pengukuranAlat.filter((a) =>
    pengIds.has(a.pengukuran_id)
  );
  const dokForBerkas = pengukuranDokumen.filter((d) =>
    pengIds.has(d.pengukuran_id)
  );

  const setStatus = (next: string) => {
    setMessage(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("berkas_id", berkas.id);
      fd.set("status", next);
      const res = await updateBerkasStatusAction(fd);
      if (res.error) {
        setMessage(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          ← Daftar berkas
        </button>
        <span className="text-xs text-slate-500">
          Project: <span className="font-medium text-slate-700">{projectName}</span>
        </span>
        {hasBidangDiMap && onLihatDiPeta ? (
          <button
            type="button"
            onClick={onLihatDiPeta}
            className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
          >
            Lihat di peta
          </button>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-slate-500">
          Nomor berkas
        </p>
        <p className="mt-1 font-mono text-lg font-semibold text-slate-900">
          {berkas.nomor_berkas}
        </p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-slate-500">Tanggal berkas</span>
            <p className="font-medium text-slate-800">
              {formatShortDate(berkas.tanggal_berkas)}
            </p>
          </div>
          <div>
            <span className="text-slate-500">Status (kolom)</span>
            <p className="font-medium text-slate-800">{berkas.status}</p>
          </div>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Alur status
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Klik langkah untuk memperbarui status (RLS anggota project).
        </p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          {BERKAS_STATUS_STEPS.map((step, idx) => {
            const done = idx < currentIdx;
            const active = idx === currentIdx;
            return (
              <div
                key={step.key}
                className="flex flex-1 flex-col items-center gap-1 sm:min-w-[4.5rem]"
              >
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setStatus(step.key)}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors disabled:opacity-50 ${
                    active
                      ? "bg-blue-600 text-white ring-2 ring-blue-200"
                      : done
                        ? "bg-emerald-600 text-white"
                        : "border border-slate-300 bg-white text-slate-600 hover:border-blue-400 hover:text-blue-800"
                  }`}
                  title={`Set status: ${step.label}`}
                >
                  {idx + 1}
                </button>
                <span
                  className={`max-w-[6rem] text-center text-[11px] leading-tight ${
                    active ? "font-semibold text-blue-800" : "text-slate-600"
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        {message && (
          <p className="mt-3 text-sm text-red-600" role="alert">
            {message}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Pemilik tanah
        </p>
        {pemilikLines.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">—</p>
        ) : (
          <ul className="mt-2 list-inside list-disc text-sm text-slate-800">
            {pemilikLines.map((name, i) => (
              <li key={`${name}-${i}`}>{name}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Catatan
        </p>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
          {berkas.catatan?.trim() ? berkas.catatan : "—"}
        </p>
      </div>

      <PengukuranPanel
        berkasId={berkas.id}
        organizationId={organizationId}
        permohonan={permohonanForBerkas}
        pengukuranLapangan={pengForBerkas}
        pengukuranSurveyor={surveyForBerkas}
        pengukuranAlat={alatLinkForBerkas}
        pengukuranDokumen={dokForBerkas}
        alatUkur={alatUkur}
      />

      <LegalisasiGuWizard
        berkasId={berkas.id}
        rows={legsForBerkas}
        files={filesForBerkas}
        history={historyForBerkas}
      />
    </div>
  );
}
