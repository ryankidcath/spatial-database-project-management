import { test, expect } from "@playwright/test";
import { detectRootShell, loginToWorkspace } from "./workspace-shell";
import {
  openActivityHistorySheet,
  openFirstDesktopVirtualTable,
  openTableViewSwitcher,
} from "./virtual-table-views-shell";

const e2eEmail = process.env.E2E_EMAIL?.trim();
const e2ePassword = process.env.E2E_PASSWORD?.trim();
const hasE2eAuth = Boolean(e2eEmail && e2ePassword);

(hasE2eAuth ? test.describe : test.describe.skip)(
  "Virtual table views (E2E_EMAIL + E2E_PASSWORD)",
  () => {
    test.describe.configure({ timeout: 90_000 });

    test.beforeEach(async ({ page }) => {
      await loginToWorkspace(page, e2eEmail!, e2ePassword!);
      await page.waitForLoadState("domcontentloaded");
    });

    test("desktop: view switcher tampil setelah pilih tabel", async ({
      page,
    }) => {
      const opened = await openFirstDesktopVirtualTable(page);
      if (!opened) {
        test.skip(true, "Tidak ada tabel custom di scope E2E");
        return;
      }
      await openTableViewSwitcher(page);
      await expect(page.getByTestId("table-view-option-grid")).toBeVisible();
    });

    test("desktop: ganti layout Grid → Form jika Form enabled", async ({
      page,
    }) => {
      const opened = await openFirstDesktopVirtualTable(page);
      if (!opened) {
        test.skip(true, "Tidak ada tabel custom di scope E2E");
        return;
      }
      await openTableViewSwitcher(page);
      const formOption = page.getByTestId("table-view-option-form");
      if (await formOption.isDisabled()) {
        test.skip(true, "Form tidak tersedia");
        return;
      }
      await formOption.click();
      await expect(page.getByTestId("table-view-switcher")).toContainText(
        /Form/i
      );
    });

    test("desktop: simpan view bernama", async ({ page }) => {
      const opened = await openFirstDesktopVirtualTable(page);
      if (!opened) {
        test.skip(true, "Tidak ada tabel custom di scope E2E");
        return;
      }
      await page.getByTestId("table-view-toolbar-toggle").click();
      await page.getByTestId("table-save-view").click();
      await expect(
        page.getByRole("heading", { name: "Simpan view" })
      ).toBeVisible();
      const name = `E2E view ${Date.now()}`;
      await page.getByLabel("Nama view").fill(name);
      await page.getByTestId("table-save-view-submit").click();
      await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
    });

    test("desktop: riwayat aktivitas membuka sheet", async ({ page }) => {
      await openActivityHistorySheet(page);
      await expect(
        page.getByRole("heading", { name: "Riwayat aktivitas" })
      ).toBeVisible();
    });

    test("desktop: onboarding kolom Kanban di switcher", async ({ page }) => {
      const opened = await openFirstDesktopVirtualTable(page);
      if (!opened) {
        test.skip(true, "Tidak ada tabel custom di scope E2E");
        return;
      }
      await openTableViewSwitcher(page);
      const kanbanOption = page.getByTestId("table-view-option-kanban");
      if (!(await kanbanOption.isDisabled())) {
        test.skip(true, "Kanban sudah tersedia — tidak perlu CTA kolom");
        return;
      }
      const hints = page.getByTestId("table-view-switcher-hints");
      if (await hints.isVisible().catch(() => false)) {
        await expect(
          page.getByTestId("table-view-add-column-kanban")
        ).toBeVisible();
      }
    });
  }
);

test.describe("Virtual table views smoke (tanpa auth)", () => {
  test("root tidak crash setelah navigasi tab Tabel", async ({ page }) => {
    await page.goto("/");
    const mode = await detectRootShell(page);
    if (mode !== "workspace") return;

    const tab = page.getByRole("tab", { name: "Data" });
    if (await tab.isVisible().catch(() => false)) {
      await tab.click();
      await expect(page.getByTestId("table-browser-search").or(
        page.getByText(/Belum ada tabel custom|Pilih organisasi/i)
      )).toBeVisible({ timeout: 15_000 });
    }
  });
});
