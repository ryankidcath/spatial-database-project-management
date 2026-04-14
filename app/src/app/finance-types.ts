export type FinanceInvoiceRow = {
  id: string;
  organization_id: string;
  project_id: string;
  berkas_id: string | null;
  nomor_invoice: string;
  status: string;
  currency: string;
  total_amount: string;
  notes: string | null;
  issued_at: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FinanceInvoiceItemRow = {
  id: string;
  invoice_id: string;
  urutan: number;
  description: string;
  quantity: string;
  unit_price: string;
  line_total: string;
  created_at: string;
};

export type FinancePembayaranRow = {
  id: string;
  invoice_id: string;
  amount: string;
  paid_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
};
