import { expect, type Page } from "@playwright/test";

/** Tab Tabel (desktop master–detail). */
export async function openDesktopTableTab(page: Page) {
  const tab = page.getByRole("tab", { name: "Data" });
  await expect(tab).toBeVisible({ timeout: 20_000 });
  await tab.click();
}

/**
 * Pilih tabel pertama di browser master (desktop).
 * @returns false jika tidak ada tabel di scope.
 */
export async function openFirstDesktopVirtualTable(
  page: Page
): Promise<boolean> {
  await openDesktopTableTab(page);
  const item = page.getByTestId("table-browser-item").first();
  const visible = await item.isVisible().catch(() => false);
  if (!visible) return false;
  await item.click();
  await expect(page.getByTestId("table-view-switcher")).toBeVisible({
    timeout: 20_000,
  });
  return true;
}

/** Buka popover view switcher; asumsikan detail tabel sudah terbuka. */
export async function openTableViewSwitcher(page: Page) {
  const trigger = page.getByTestId("table-view-switcher");
  await expect(trigger).toBeVisible({ timeout: 15_000 });
  await trigger.click();
}

/** Pilih opsi layout di switcher (popover harus terbuka). */
export async function selectTableLayout(
  page: Page,
  layout:
    | "grid"
    | "kanban"
    | "calendar"
    | "timeline"
    | "gallery"
    | "form"
    | "map"
    | "chart"
) {
  const option = page.getByTestId(`table-view-option-${layout}`);
  await expect(option).toBeVisible({ timeout: 10_000 });
  await option.click();
}

/** Buka sheet riwayat aktivitas dari header/sidebar desktop. */
export async function openActivityHistorySheet(page: Page) {
  const btn = page.getByTestId("activity-history-open").first();
  await expect(btn).toBeVisible({ timeout: 15_000 });
  await btn.click();
  await expect(page.getByTestId("activity-history-sheet")).toBeVisible({
    timeout: 15_000,
  });
}
