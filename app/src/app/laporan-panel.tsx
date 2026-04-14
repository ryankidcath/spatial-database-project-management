"use client";

import { BERKAS_STATUS_STEPS } from "./plm-berkas-status";
import { statusTahapLabel } from "./plm-legalisasi-wizard";
import { formatShortDate } from "./schedule-utils";

type ProjectLite = { id: string; name: string };

export type PlmBerkasStatusSummaryRow = {
  project_id: string;
  status: string;
  jumlah: number | string;
  tanggal_berkas_terbaru: string | null;
};

export type PlmLegalisasiTahapSummaryRow = {
  project_id: string;
  status_tahap: string;
  jumlah: number | string;
};

export type PlmPengukuranStatusSummaryRow = {
  project_id: string;
  status: string;
  jumlah: number | string;
};

function num(v: number | string): string {
  if (typeof v === "number") return String(v);
  const n = Number(v);
  return Number.isFinite(n) ? String(n) : String(v);
}

function berkasStatusLabel(key: string): string {
  const k = key.toLowerCase().trim();
  return BERKAS_STATUS_STEPS.find((s) => s.key === k)?.label ?? key;
}

function pengukuranStatusLabel(key: string): string {
  const labels: Record<string, string> = {
    dijadwalkan: "Dijadwalkan",
    diukur: "Diukur",
    olah_cad: "Olah CAD",
    selesai: "Selesai",
  };
  return labels[key] ?? key;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const esc = (c: string) =>
    /[",\n\r]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c;
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((r) => r.map(esc).join(",")),
  ];
  const blob = new Blob([lines.join("\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  projects: ProjectLite[];
  berkasByStatus: PlmBerkasStatusSummaryRow[];
  legalisasiByTahap: PlmLegalisasiTahapSummaryRow[];
  pengukuranByStatus: PlmPengukuranStatusSummaryRow[];
};

export function LaporanPanel({
  projects,
  berkasByStatus,
  legalisasiByTahap,
  pengukuranByStatus,
}: Props) {
  const projectName = (id: string) =>
    projects.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Berkas permohonan per status
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              View DB: <span className="font-mono">plm.v_berkas_permohonan_summary_by_status</span>
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            onClick={() =>
              downloadCsv(
                "laporan-berkas-per-status.csv",
                ["project_id", "project_nama", "status", "jumlah", "tanggal_berkas_terbaru"],
                berkasByStatus.map((r) => [
                  r.project_id,
                  projectName(r.project_id),
                  r.status,
                  num(r.jumlah),
                  r.tanggal_berkas_terbaru ?? "",
                ])
              )
            }
          >
            Unduh CSV
          </button>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Jumlah</th>
                <th className="px-3 py-2 font-medium">Tanggal berkas terbaru</th>
              </tr>
            </thead>
            <tbody>
              {berkasByStatus.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-slate-500">
                    Tidak ada data agregat (atau belum ada berkas).
                  </td>
                </tr>
              ) : (
                berkasByStatus.map((r, i) => (
                  <tr key={`${r.project_id}-${r.status}-${i}`} className="border-b border-slate-100">
                    <td className="px-3 py-2">{projectName(r.project_id)}</td>
                    <td className="px-3 py-2">{berkasStatusLabel(r.status)}</td>
                    <td className="px-3 py-2 font-mono">{num(r.jumlah)}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {formatShortDate(r.tanggal_berkas_terbaru)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Legalisasi GU per tahap
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              <span className="font-mono">plm.v_legalisasi_gu_summary_by_tahap</span>
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            onClick={() =>
              downloadCsv(
                "laporan-legalisasi-per-tahap.csv",
                ["project_id", "project_nama", "status_tahap", "jumlah"],
                legalisasiByTahap.map((r) => [
                  r.project_id,
                  projectName(r.project_id),
                  r.status_tahap,
                  num(r.jumlah),
                ])
              )
            }
          >
            Unduh CSV
          </button>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Tahap</th>
                <th className="px-3 py-2 font-medium">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {legalisasiByTahap.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-slate-500">
                    Tidak ada data agregat.
                  </td>
                </tr>
              ) : (
                legalisasiByTahap.map((r, i) => (
                  <tr key={`${r.project_id}-${r.status_tahap}-${i}`} className="border-b border-slate-100">
                    <td className="px-3 py-2">{projectName(r.project_id)}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-indigo-900">{r.status_tahap}</span>
                      <span className="ml-2 text-slate-500">
                        ({statusTahapLabel(r.status_tahap)})
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono">{num(r.jumlah)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">
              Pengukuran lapangan per status
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              <span className="font-mono">plm.v_pengukuran_lapangan_summary_by_status</span>
            </p>
          </div>
          <button
            type="button"
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
            onClick={() =>
              downloadCsv(
                "laporan-pengukuran-per-status.csv",
                ["project_id", "project_nama", "status", "jumlah"],
                pengukuranByStatus.map((r) => [
                  r.project_id,
                  projectName(r.project_id),
                  r.status,
                  num(r.jumlah),
                ])
              )
            }
          >
            Unduh CSV
          </button>
        </div>
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-3 py-2 font-medium">Project</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Jumlah</th>
              </tr>
            </thead>
            <tbody>
              {pengukuranByStatus.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-slate-500">
                    Tidak ada data agregat.
                  </td>
                </tr>
              ) : (
                pengukuranByStatus.map((r, i) => (
                  <tr key={`${r.project_id}-${r.status}-${i}`} className="border-b border-slate-100">
                    <td className="px-3 py-2">{projectName(r.project_id)}</td>
                    <td className="px-3 py-2">{pengukuranStatusLabel(r.status)}</td>
                    <td className="px-3 py-2 font-mono">{num(r.jumlah)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
