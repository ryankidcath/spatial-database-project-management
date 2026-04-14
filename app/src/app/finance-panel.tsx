"use client";

import { useMemo, useState, useTransition } from "react";
import {
  addInvoiceItemAction,
  addPembayaranAction,
  createDraftInvoiceAction,
  deleteInvoiceItemAction,
  softDeleteInvoiceAction,
  updateInvoiceAction,
} from "./finance-actions";
import type {
  FinanceInvoiceItemRow,
  FinanceInvoiceRow,
  FinancePembayaranRow,
} from "./finance-types";
import { formatShortDate } from "./schedule-utils";

type BerkasOpt = { id: string; nomor_berkas: string };

type Props = {
  projectId: string | null;
  organizationId: string | null;
  plmEnabled: boolean;
  berkasOptions: BerkasOpt[];
  invoices: FinanceInvoiceRow[];
  invoiceItems: FinanceInvoiceItemRow[];
  pembayaran: FinancePembayaranRow[];
};

function formatIdr(n: string): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return n;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(v);
}

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  issued: "Terbit",
  paid: "Lunas",
  cancelled: "Batal",
};

export function FinancePanel({
  projectId,
  organizationId,
  plmEnabled,
  berkasOptions,
  invoices,
  invoiceItems,
  pembayaran,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const itemsByInvoice = useMemo(() => {
    const m = new Map<string, FinanceInvoiceItemRow[]>();
    for (const it of invoiceItems) {
      const arr = m.get(it.invoice_id) ?? [];
      arr.push(it);
      m.set(it.invoice_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.urutan - b.urutan);
    }
    return m;
  }, [invoiceItems]);

  const paysByInvoice = useMemo(() => {
    const m = new Map<string, FinancePembayaranRow[]>();
    for (const p of pembayaran) {
      const arr = m.get(p.invoice_id) ?? [];
      arr.push(p);
      m.set(p.invoice_id, arr);
    }
    for (const arr of m.values()) {
      arr.sort(
        (a, b) =>
          new Date(b.paid_at).getTime() - new Date(a.paid_at).getTime()
      );
    }
    return m;
  }, [pembayaran]);

  const berkasLabel = (id: string | null) => {
    if (!id) return "—";
    return berkasOptions.find((b) => b.id === id)?.nomor_berkas ?? id.slice(0, 8);
  };

  if (!projectId || !organizationId) {
    return (
      <p className="text-sm text-slate-600">
        Pilih project untuk melihat invoice.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-emerald-950">Keuangan</h3>
        <p className="mt-1 text-xs text-slate-600">
          Invoice & pembayaran per project. Satu berkas aktif hanya boleh punya
          satu invoice (selaras §9.3).
        </p>
      </div>

      {msg ? (
        <p className="text-sm text-red-600" role="alert">
          {msg}
        </p>
      ) : null}

      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
          Invoice baru (draft)
        </p>
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          action={(fd) => {
            setMsg(null);
            fd.set("project_id", projectId);
            startTransition(async () => {
              const r = await createDraftInvoiceAction(fd);
              if (r.error) setMsg(r.error);
            });
          }}
        >
          <label className="block text-xs text-slate-700">
            Nomor (opsional)
            <input
              name="nomor_invoice"
              placeholder="Auto bila kosong"
              className="mt-0.5 block rounded border border-slate-200 bg-white px-2 py-1 text-sm"
            />
          </label>
          {plmEnabled && berkasOptions.length > 0 ? (
            <label className="block text-xs text-slate-700">
              Berkas PLM (opsional)
              <select
                name="berkas_id"
                className="mt-0.5 block rounded border border-slate-200 bg-white px-2 py-1 text-sm"
                defaultValue=""
              >
                <option value="">— tanpa berkas —</option>
                {berkasOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nomor_berkas}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            Buat draft
          </button>
        </form>
      </div>

      <div className="space-y-3">
        {invoices.length === 0 ? (
          <p className="text-sm text-slate-600">Belum ada invoice.</p>
        ) : (
          invoices.map((inv) => {
            const lines = itemsByInvoice.get(inv.id) ?? [];
            const pays = paysByInvoice.get(inv.id) ?? [];
            const expanded = openId === inv.id;
            return (
              <div
                key={inv.id}
                className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-slate-900">
                      {inv.nomor_invoice}
                    </p>
                    <p className="text-xs text-slate-600">
                      {STATUS_LABEL[inv.status] ?? inv.status} ·{" "}
                      {formatIdr(inv.total_amount)} · berkas:{" "}
                      {berkasLabel(inv.berkas_id)}
                    </p>
                    {inv.issued_at ? (
                      <p className="text-xs text-slate-500">
                        Terbit {formatShortDate(inv.issued_at)}
                        {inv.due_at ? ` · jatuh tempo ${formatShortDate(inv.due_at)}` : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs text-emerald-700 underline"
                      onClick={() => setOpenId(expanded ? null : inv.id)}
                    >
                      {expanded ? "Tutup detail" : "Detail / baris / bayar"}
                    </button>
                    {inv.status !== "paid" && inv.status !== "cancelled" ? (
                      <form
                        action={(fd) => {
                          setMsg(null);
                          fd.set("invoice_id", inv.id);
                          startTransition(async () => {
                            const r = await softDeleteInvoiceAction(fd);
                            if (r.error) setMsg(r.error);
                          });
                        }}
                      >
                        <button
                          type="submit"
                          disabled={pending}
                          className="text-xs text-red-600 underline disabled:opacity-50"
                        >
                          Hapus draft/batal
                        </button>
                      </form>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
                    <form
                      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
                      action={(fd) => {
                        setMsg(null);
                        fd.set("invoice_id", inv.id);
                        startTransition(async () => {
                          const r = await updateInvoiceAction(fd);
                          if (r.error) setMsg(r.error);
                        });
                      }}
                    >
                      <input type="hidden" name="invoice_id" value={inv.id} />
                      <label className="text-xs text-slate-600">
                        Nomor
                        <input
                          name="nomor_invoice"
                          defaultValue={inv.nomor_invoice}
                          className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs text-slate-600">
                        Status
                        <select
                          name="status"
                          defaultValue={inv.status}
                          className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                        >
                          <option value="draft">Draft</option>
                          <option value="issued">Terbit</option>
                          <option value="paid">Lunas</option>
                          <option value="cancelled">Batal</option>
                        </select>
                      </label>
                      <label className="text-xs text-slate-600">
                        Terbit (ISO)
                        <input
                          name="issued_at"
                          type="datetime-local"
                          defaultValue={
                            inv.issued_at
                              ? inv.issued_at.slice(0, 16)
                              : ""
                          }
                          className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs text-slate-600">
                        Jatuh tempo
                        <input
                          name="due_at"
                          type="datetime-local"
                          defaultValue={
                            inv.due_at ? inv.due_at.slice(0, 16) : ""
                          }
                          className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="text-xs text-slate-600 sm:col-span-2">
                        Catatan
                        <input
                          name="notes"
                          defaultValue={inv.notes ?? ""}
                          className="mt-0.5 block w-full rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                      </label>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                        >
                          Simpan header
                        </button>
                      </div>
                    </form>

                    <div>
                      <p className="text-xs font-semibold text-slate-700">
                        Baris invoice
                      </p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {lines.map((ln) => (
                          <li
                            key={ln.id}
                            className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1"
                          >
                            <span>
                              {ln.description} · {ln.quantity} ×{" "}
                              {formatIdr(ln.unit_price)} ={" "}
                              <strong>{formatIdr(ln.line_total)}</strong>
                            </span>
                            <form
                              action={(fd) => {
                                setMsg(null);
                                fd.set("item_id", ln.id);
                                startTransition(async () => {
                                  const r = await deleteInvoiceItemAction(fd);
                                  if (r.error) setMsg(r.error);
                                });
                              }}
                            >
                              <input type="hidden" name="item_id" value={ln.id} />
                              <button
                                type="submit"
                                disabled={pending}
                                className="text-xs text-red-600 underline disabled:opacity-50"
                              >
                                Hapus
                              </button>
                            </form>
                          </li>
                        ))}
                      </ul>
                      <form
                        className="mt-2 flex flex-wrap items-end gap-2"
                        action={(fd) => {
                          setMsg(null);
                          fd.set("invoice_id", inv.id);
                          startTransition(async () => {
                            const r = await addInvoiceItemAction(fd);
                            if (r.error) setMsg(r.error);
                          });
                        }}
                      >
                        <input type="hidden" name="invoice_id" value={inv.id} />
                        <input
                          name="description"
                          placeholder="Deskripsi"
                          required
                          className="rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                        <input
                          name="quantity"
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          defaultValue="1"
                          className="w-24 rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                        <input
                          name="unit_price"
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Harga"
                          required
                          className="w-32 rounded border border-slate-200 px-2 py-1 text-sm"
                        />
                        <button
                          type="submit"
                          disabled={pending}
                          className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                        >
                          + Baris
                        </button>
                      </form>
                    </div>

                    <div>
                      <p className="text-xs font-semibold text-slate-700">
                        Pembayaran
                      </p>
                      <ul className="mt-1 space-y-1 text-xs text-slate-600">
                        {pays.map((p) => (
                          <li key={p.id}>
                            {formatShortDate(p.paid_at)} — {formatIdr(p.amount)}
                            {p.method ? ` · ${p.method}` : null}
                            {p.reference ? ` · ref ${p.reference}` : null}
                          </li>
                        ))}
                      </ul>
                      {inv.status !== "cancelled" ? (
                        <form
                          className="mt-2 flex flex-wrap items-end gap-2"
                          action={(fd) => {
                            setMsg(null);
                            fd.set("invoice_id", inv.id);
                            startTransition(async () => {
                              const r = await addPembayaranAction(fd);
                              if (r.error) setMsg(r.error);
                            });
                          }}
                        >
                          <input type="hidden" name="invoice_id" value={inv.id} />
                          <input
                            name="amount"
                            type="number"
                            step="0.01"
                            min="0.01"
                            placeholder="Jumlah"
                            required
                            className="w-32 rounded border border-slate-200 px-2 py-1 text-sm"
                          />
                          <input
                            name="method"
                            placeholder="Metode"
                            className="rounded border border-slate-200 px-2 py-1 text-sm"
                          />
                          <input
                            name="reference"
                            placeholder="Referensi"
                            className="rounded border border-slate-200 px-2 py-1 text-sm"
                          />
                          <button
                            type="submit"
                            disabled={pending}
                            className="rounded bg-slate-800 px-2 py-1 text-xs font-medium text-white disabled:opacity-50"
                          >
                            Catat bayar
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
