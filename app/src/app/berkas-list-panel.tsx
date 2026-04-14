import type { ReactNode } from "react";
import { formatShortDate } from "./schedule-utils";
import {
  pemilikLabelsForBerkas,
  type BerkasPermohonanRow,
} from "./plm-berkas-types";

type Props = {
  rows: BerkasPermohonanRow[];
  showCatatan?: boolean;
  title?: string;
  description?: ReactNode | null;
  /** Jika diisi, baris dapat diklik (detail berkas / F3-4). */
  onRowClick?: (berkasId: string) => void;
  /** `berkas_id` yang punya bidang hasil ukur — kolom Peta (F4-3). */
  berkasIdsWithBidang?: ReadonlySet<string>;
  /** Tombol peta per baris; tidak memanggil `onRowClick`. */
  onOpenBerkasInMap?: (berkasId: string) => void;
};

export function BerkasListPanel({
  rows,
  showCatatan = false,
  title,
  description,
  onRowClick,
  berkasIdsWithBidang,
  onOpenBerkasInMap,
}: Props) {
  const showPetaCol = Boolean(berkasIdsWithBidang && onOpenBerkasInMap);
  const colSpan = 4 + (showPetaCol ? 1 : 0) + (showCatatan ? 1 : 0);

  return (
    <div>
      {title && (
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
      )}
      {description != null && description !== "" && (
        <div className="mt-1 text-xs text-slate-500">{description}</div>
      )}
      <div className="mt-3 overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full min-w-[28rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="px-3 py-2 font-medium">Nomor</th>
              <th className="px-3 py-2 font-medium">Tanggal</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Pemilik</th>
              {showPetaCol && (
                <th className="px-3 py-2 font-medium">Peta</th>
              )}
              {showCatatan && (
                <th className="px-3 py-2 font-medium">Catatan</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={colSpan}
                  className="px-3 py-4 text-sm text-slate-500"
                >
                  Belum ada berkas untuk project ini.
                </td>
              </tr>
            ) : (
              rows.map((b) => (
                <tr
                  key={b.id}
                  className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/80 ${
                    onRowClick
                      ? "cursor-pointer focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                      : ""
                  }`}
                  tabIndex={onRowClick ? 0 : undefined}
                  role={onRowClick ? "button" : undefined}
                  onClick={onRowClick ? () => onRowClick(b.id) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            onRowClick(b.id);
                          }
                        }
                      : undefined
                  }
                >
                  <td className="px-3 py-2 font-mono text-xs">{b.nomor_berkas}</td>
                  <td className="px-3 py-2 text-slate-600">
                    {formatShortDate(b.tanggal_berkas)}
                  </td>
                  <td className="px-3 py-2">{b.status}</td>
                  <td className="max-w-[12rem] px-3 py-2 text-slate-700">
                    <span className="line-clamp-2">{pemilikLabelsForBerkas(b)}</span>
                  </td>
                  {showPetaCol && (
                    <td className="px-3 py-2">
                      {berkasIdsWithBidang?.has(b.id) ? (
                        <button
                          type="button"
                          className="rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenBerkasInMap?.(b.id);
                          }}
                        >
                          Peta
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  )}
                  {showCatatan && (
                    <td className="max-w-[14rem] px-3 py-2 text-slate-600">
                      <span className="line-clamp-2">
                        {b.catatan?.trim() ? b.catatan : "—"}
                      </span>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
