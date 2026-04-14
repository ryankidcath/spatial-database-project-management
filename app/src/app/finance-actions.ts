"use server";

import { revalidatePath } from "next/cache";
import { insertAuditLogRow } from "@/lib/audit-log";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const INVOICE_STATUSES = new Set(["draft", "issued", "paid", "cancelled"]);

async function fetchOrgForProject(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  projectId: string
): Promise<{ organizationId: string } | null> {
  const { data: p, error } = await supabase
    .schema("core_pm")
    .from("projects")
    .select("organization_id")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !p?.organization_id) return null;
  return { organizationId: p.organization_id };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

async function recalcInvoiceTotal(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  invoiceId: string
): Promise<void> {
  const { data: rows } = await supabase
    .schema("finance")
    .from("invoice_item")
    .select("line_total")
    .eq("invoice_id", invoiceId);
  let sum = 0;
  for (const r of rows ?? []) {
    sum += Number((r as { line_total: string }).line_total);
  }
  await supabase
    .schema("finance")
    .from("invoice")
    .update({
      total_amount: roundMoney(sum),
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);
}

export type FinanceActionResult = { error: string | null };

export async function createDraftInvoiceAction(
  formData: FormData
): Promise<FinanceActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const projectId = String(formData.get("project_id") ?? "").trim();
  const berkasIdRaw = String(formData.get("berkas_id") ?? "").trim();
  const berkasId = berkasIdRaw || null;
  const nomorRaw = String(formData.get("nomor_invoice") ?? "").trim();

  if (!projectId) return { error: "project_id kosong" };

  const ctx = await fetchOrgForProject(supabase, projectId);
  if (!ctx) return { error: "Project tidak ditemukan" };

  const year = new Date().getFullYear();
  const nomor =
    nomorRaw ||
    `INV-${year}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const { data: inserted, error } = await supabase
    .schema("finance")
    .from("invoice")
    .insert({
      organization_id: ctx.organizationId,
      project_id: projectId,
      berkas_id: berkasId,
      nomor_invoice: nomor,
      status: "draft",
      total_amount: 0,
    })
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  const id = (inserted as { id: string } | null)?.id;
  if (id) {
    await insertAuditLogRow(supabase, {
      organizationId: ctx.organizationId,
      projectId,
      actorUserId: user.id,
      action: "finance.invoice.insert",
      entity: "finance.invoice",
      entityId: id,
      payload: { nomor_invoice: nomor, berkas_id: berkasId },
    });
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function updateInvoiceAction(
  formData: FormData
): Promise<FinanceActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const id = String(formData.get("invoice_id") ?? "").trim();
  const nomor = String(formData.get("nomor_invoice") ?? "").trim();
  const status = String(formData.get("status") ?? "").trim().toLowerCase();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const issuedAt = String(formData.get("issued_at") ?? "").trim() || null;
  const dueAt = String(formData.get("due_at") ?? "").trim() || null;

  if (!id) return { error: "invoice_id kosong" };
  if (!INVOICE_STATUSES.has(status)) return { error: "Status tidak valid" };

  const { data: inv, error: invErr } = await supabase
    .schema("finance")
    .from("invoice")
    .select("project_id, organization_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (invErr || !inv) return { error: invErr?.message ?? "Invoice tidak ada" };

  const patch: Record<string, unknown> = {
    status,
    notes,
    issued_at: issuedAt || null,
    due_at: dueAt || null,
    updated_at: new Date().toISOString(),
  };
  if (nomor) patch.nomor_invoice = nomor;

  const { error } = await supabase
    .schema("finance")
    .from("invoice")
    .update(patch)
    .eq("id", id);

  if (error) return { error: error.message };

  await insertAuditLogRow(supabase, {
    organizationId: inv.organization_id,
    projectId: inv.project_id,
    actorUserId: user.id,
    action: "finance.invoice.patch",
    entity: "finance.invoice",
    entityId: id,
    payload: { status, nomor_invoice: nomor || undefined },
  });

  revalidatePath("/", "layout");
  return { error: null };
}

export async function addInvoiceItemAction(
  formData: FormData
): Promise<FinanceActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const qty = Number(String(formData.get("quantity") ?? "1"));
  const unit = Number(String(formData.get("unit_price") ?? "0"));

  if (!invoiceId) return { error: "invoice_id kosong" };
  if (!description) return { error: "Deskripsi baris wajib" };
  if (!(qty > 0) || Number.isNaN(qty)) return { error: "Kuantitas tidak valid" };
  if (Number.isNaN(unit)) return { error: "Harga satuan tidak valid" };

  const line = roundMoney(qty * unit);

  const { data: inv, error: invErr } = await supabase
    .schema("finance")
    .from("invoice")
    .select("project_id, organization_id")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();
  if (invErr || !inv) return { error: "Invoice tidak ada" };

  const { data: maxRow } = await supabase
    .schema("finance")
    .from("invoice_item")
    .select("urutan")
    .eq("invoice_id", invoiceId)
    .order("urutan", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextUrutan = (maxRow?.urutan ?? -1) + 1;

  const { error } = await supabase.schema("finance").from("invoice_item").insert({
    invoice_id: invoiceId,
    urutan: nextUrutan,
    description,
    quantity: qty,
    unit_price: unit,
    line_total: line,
  });

  if (error) return { error: error.message };

  await recalcInvoiceTotal(supabase, invoiceId);

  await insertAuditLogRow(supabase, {
    organizationId: inv.organization_id,
    projectId: inv.project_id,
    actorUserId: user.id,
    action: "finance.invoice_item.insert",
    entity: "finance.invoice_item",
    entityId: invoiceId,
    payload: { description, line_total: line },
  });

  revalidatePath("/", "layout");
  return { error: null };
}

export async function deleteInvoiceItemAction(
  formData: FormData
): Promise<FinanceActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const itemId = String(formData.get("item_id") ?? "").trim();
  if (!itemId) return { error: "item_id kosong" };

  const { data: row, error: rErr } = await supabase
    .schema("finance")
    .from("invoice_item")
    .select("invoice_id")
    .eq("id", itemId)
    .maybeSingle();
  if (rErr || !row) return { error: "Baris tidak ditemukan" };
  const invoiceId = (row as { invoice_id: string }).invoice_id;

  const { data: inv } = await supabase
    .schema("finance")
    .from("invoice")
    .select("project_id, organization_id")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();

  const { error } = await supabase
    .schema("finance")
    .from("invoice_item")
    .delete()
    .eq("id", itemId);

  if (error) return { error: error.message };
  if (inv) {
    await recalcInvoiceTotal(supabase, invoiceId);
    await insertAuditLogRow(supabase, {
      organizationId: inv.organization_id,
      projectId: inv.project_id,
      actorUserId: user.id,
      action: "finance.invoice_item.delete",
      entity: "finance.invoice_item",
      entityId: itemId,
      payload: {},
    });
  }

  revalidatePath("/", "layout");
  return { error: null };
}

export async function addPembayaranAction(
  formData: FormData
): Promise<FinanceActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const invoiceId = String(formData.get("invoice_id") ?? "").trim();
  const amount = Number(String(formData.get("amount") ?? ""));
  const method = String(formData.get("method") ?? "").trim() || null;
  const reference = String(formData.get("reference") ?? "").trim() || null;
  const paidAt = String(formData.get("paid_at") ?? "").trim() || null;

  if (!invoiceId) return { error: "invoice_id kosong" };
  if (!(amount > 0) || Number.isNaN(amount)) return { error: "Jumlah tidak valid" };

  const { data: inv, error: invErr } = await supabase
    .schema("finance")
    .from("invoice")
    .select("id, project_id, organization_id, total_amount, status")
    .eq("id", invoiceId)
    .is("deleted_at", null)
    .maybeSingle();

  if (invErr || !inv) return { error: "Invoice tidak ada" };
  if (inv.status === "cancelled") return { error: "Invoice dibatalkan" };

  const { error: payErr } = await supabase.schema("finance").from("pembayaran").insert({
    invoice_id: invoiceId,
    amount,
    method,
    reference,
    paid_at: paidAt || new Date().toISOString(),
  });
  if (payErr) return { error: payErr.message };

  const { data: pays } = await supabase
    .schema("finance")
    .from("pembayaran")
    .select("amount")
    .eq("invoice_id", invoiceId);

  let paidSum = 0;
  for (const p of pays ?? []) {
    paidSum += Number((p as { amount: string }).amount);
  }
  const total = Number(inv.total_amount);
  let newStatus = inv.status;
  if (roundMoney(paidSum) >= total && total > 0) {
    newStatus = "paid";
  }

  await supabase
    .schema("finance")
    .from("invoice")
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", invoiceId);

  await insertAuditLogRow(supabase, {
    organizationId: inv.organization_id,
    projectId: inv.project_id,
    actorUserId: user.id,
    action: "finance.pembayaran.insert",
    entity: "finance.pembayaran",
    entityId: invoiceId,
    payload: { amount, new_status: newStatus },
  });

  revalidatePath("/", "layout");
  return { error: null };
}

export async function softDeleteInvoiceAction(
  formData: FormData
): Promise<FinanceActionResult> {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "Supabase tidak dikonfigurasi" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Belum masuk" };

  const id = String(formData.get("invoice_id") ?? "").trim();
  if (!id) return { error: "invoice_id kosong" };

  const { data: inv, error: invErr } = await supabase
    .schema("finance")
    .from("invoice")
    .select("project_id, organization_id, status")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (invErr || !inv) return { error: "Invoice tidak ada" };
  if (inv.status === "paid") return { error: "Invoice lunas tidak boleh dihapus lewat ini" };

  const { error } = await supabase
    .schema("finance")
    .from("invoice")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  await insertAuditLogRow(supabase, {
    organizationId: inv.organization_id,
    projectId: inv.project_id,
    actorUserId: user.id,
    action: "finance.invoice.soft_delete",
    entity: "finance.invoice",
    entityId: id,
    payload: {},
  });

  revalidatePath("/", "layout");
  return { error: null };
}
