import { updateVirtualRowCellAction } from "@/app/virtual-table-actions";

export async function saveVirtualRowCell(
  rowId: string,
  columnSlug: string,
  value: string
): Promise<{ error: string | null }> {
  const fd = new FormData();
  fd.set("row_id", rowId);
  fd.set("column_slug", columnSlug);
  fd.set("value", value);
  return updateVirtualRowCellAction(fd);
}
