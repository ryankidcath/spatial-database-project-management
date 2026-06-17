import type { ActivityLogRow } from "@/app/activity-log-types";

export type AuditActivityDisplay = {
  title: string;
  detail: string | null;
  scopeLabel: string | null;
};

function payloadStr(payload: Record<string, unknown>, key: string): string | null {
  const v = payload[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function payloadNum(payload: Record<string, unknown>, key: string): number | null {
  const v = payload[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function formatAuditActivity(
  log: ActivityLogRow,
  projectNameById: Map<string, string>
): AuditActivityDisplay {
  const p = log.payload ?? {};
  const tableName =
    payloadStr(p, "table_display_name") ??
    payloadStr(p, "display_name") ??
    null;
  const colName = payloadStr(p, "column_display_name") ?? payloadStr(p, "display_name");
  const projectName = log.project_id
    ? projectNameById.get(log.project_id) ?? null
    : null;
  const scopeLabel = log.project_id
    ? projectName
    : "Organisasi";

  switch (log.action) {
    case "project_created":
      return {
        title: `Proyek ${payloadStr(p, "project_name") ?? "baru"} dibuat`,
        detail: null,
        scopeLabel,
      };
    case "project_member_added":
      return {
        title: "Anggota ditambahkan ke proyek",
        detail: payloadStr(p, "email") ?? null,
        scopeLabel,
      };
    case "project_deleted":
      return {
        title: `Proyek dihapus`,
        detail: null,
        scopeLabel,
      };
    case "project_properties_updated":
      return {
        title: "Properti proyek diperbarui",
        detail: payloadStr(p, "name") ?? null,
        scopeLabel,
      };
    case "virtual_table.create":
      return {
        title: `Tabel ${tableName ?? "baru"} dibuat`,
        detail: null,
        scopeLabel,
      };
    case "virtual_table.update":
      return {
        title: `Tabel ${tableName ?? ""} diperbarui`.trim(),
        detail: null,
        scopeLabel,
      };
    case "virtual_table.delete":
      return {
        title: `Tabel ${tableName ?? ""} dihapus`.trim(),
        detail: null,
        scopeLabel,
      };
    case "virtual_column.create":
      return {
        title: `Kolom ${colName ?? ""} ditambahkan`.trim(),
        detail: tableName ? `Tabel ${tableName}` : null,
        scopeLabel,
      };
    case "virtual_column.update":
      return {
        title: `Kolom ${colName ?? ""} diubah`.trim(),
        detail: tableName ? `Tabel ${tableName}` : null,
        scopeLabel,
      };
    case "virtual_column.delete":
      return {
        title: `Kolom ${colName ?? ""} dihapus`.trim(),
        detail: tableName ? `Tabel ${tableName}` : null,
        scopeLabel,
      };
    case "virtual_row.create":
      return {
        title: `Baris baru`,
        detail: tableName ? `Tabel ${tableName}` : null,
        scopeLabel,
      };
    case "virtual_row.delete":
      return {
        title: `Baris dihapus`,
        detail: tableName ? `Tabel ${tableName}` : null,
        scopeLabel,
      };
    case "virtual_row.delete_bulk": {
      const n = payloadNum(p, "deleted_count");
      return {
        title: n != null ? `${n} baris dihapus` : "Beberapa baris dihapus",
        detail: tableName ? `Tabel ${tableName}` : null,
        scopeLabel,
      };
    }
    case "virtual_row.cell_changed": {
      const oldV = payloadStr(p, "old_value");
      const newV = payloadStr(p, "new_value");
      const rowLabel = payloadStr(p, "row_label");
      const detailParts = [
        rowLabel,
        oldV && newV ? `${oldV} → ${newV}` : null,
      ].filter(Boolean);
      return {
        title: colName ? `${colName} diubah` : "Nilai sel diubah",
        detail: detailParts.length > 0 ? detailParts.join(" · ") : null,
        scopeLabel,
      };
    }
    case "virtual_table.import_csv": {
      const inserted = payloadNum(p, "inserted");
      return {
        title: `Import CSV selesai`,
        detail: [
          tableName ? `Tabel ${tableName}` : null,
          inserted != null ? `${inserted} baris` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        scopeLabel,
      };
    }
    case "virtual_table.import_geojson": {
      const inserted = payloadNum(p, "inserted");
      return {
        title: `Import GeoJSON selesai`,
        detail: [
          tableName ? `Tabel ${tableName}` : null,
          inserted != null ? `${inserted} fitur` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        scopeLabel,
      };
    }
    case "virtual_table.layer_bootstrap":
      return {
        title: `Layer peta dibuat`,
        detail: tableName ? `Tabel ${tableName}` : null,
        scopeLabel,
      };
    case "user_logged_in":
    case "user_logged_out":
      return {
        title: log.action === "user_logged_in" ? "Masuk" : "Keluar",
        detail: null,
        scopeLabel,
      };
    default:
      return {
        title: log.action.replace(/[._]/g, " "),
        detail: tableName ?? null,
        scopeLabel,
      };
  }
}

export function resolveVirtualTableIdFromAuditLog(
  log: ActivityLogRow,
  virtualTableIds: Set<string>
): string | null {
  const p = log.payload ?? {};
  const fromPayload = payloadStr(p, "virtual_table_id");
  if (fromPayload && virtualTableIds.has(fromPayload)) return fromPayload;

  if (
    log.entity === "core_pm.virtual_tables" &&
    virtualTableIds.has(log.entity_id)
  ) {
    return log.entity_id;
  }

  if (
    log.action === "virtual_row.delete_bulk" &&
    virtualTableIds.has(log.entity_id)
  ) {
    return log.entity_id;
  }

  if (
    log.entity === "core_pm.virtual_rows" &&
    log.action.startsWith("virtual_table.import") &&
    virtualTableIds.has(log.entity_id)
  ) {
    return log.entity_id;
  }

  return null;
}

export function resolveTableDisplayNameFromAuditLog(
  log: ActivityLogRow,
  virtualTableNameById: Map<string, string>,
  virtualTableIds: Set<string>
): string | null {
  const p = log.payload ?? {};
  const fromPayload =
    payloadStr(p, "table_display_name") ?? payloadStr(p, "display_name");
  if (fromPayload) return fromPayload;

  const tableId = resolveVirtualTableIdFromAuditLog(log, virtualTableIds);
  if (tableId) {
    return virtualTableNameById.get(tableId) ?? null;
  }

  if (
    log.entity === "core_pm.virtual_tables" &&
    virtualTableNameById.has(log.entity_id)
  ) {
    return virtualTableNameById.get(log.entity_id) ?? null;
  }

  return null;
}

export function resolveVirtualRowIdFromAuditLog(log: ActivityLogRow): string | null {
  if (log.entity !== "core_pm.virtual_rows") return null;
  if (log.action === "virtual_row.delete_bulk") return null;
  return log.entity_id;
}
