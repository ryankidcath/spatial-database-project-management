import { test, expect, type Page } from "@playwright/test";

const e2eEmail = process.env.E2E_EMAIL?.trim();
const e2ePassword = process.env.E2E_PASSWORD?.trim();
const hasE2eAuth = Boolean(e2eEmail && e2ePassword);

async function loginToWorkspace(page: Page) {
  await page.goto("/login");
  await page.locator("#login-email").fill(e2eEmail!);
  await page.locator("#login-password").fill(e2ePassword!);
  await page.getByRole("button", { name: /^Masuk$/i }).click();
  await page.waitForURL((u: URL) => !u.pathname.includes("/login"), {
    timeout: 45_000,
  });
  await expect(
    page.getByRole("button", { name: "Berkas", exact: true })
  ).toBeVisible({ timeout: 20_000 });
}

(hasE2eAuth ? test.describe : test.describe.skip)(
  "PLM alur (E2E_EMAIL + E2E_PASSWORD)",
  () => {
    test("login lalu tab Berkas tersedia", async ({ page }) => {
      await loginToWorkspace(page);

      await page.getByRole("button", { name: "Berkas", exact: true }).click();

      await expect(
        page.getByRole("heading", {
          name: "Daftar berkas permohonan",
          exact: true,
        })
      ).toBeVisible({ timeout: 20_000 });
    });

    test("tab Keuangan sinkron dengan toggle modul finance", async ({
      page,
    }) => {
      await loginToWorkspace(page);

      const financeRow = page
        .locator("aside")
        .getByRole("listitem")
        .filter({ has: page.locator("span", { hasText: /^Keuangan$/ }) });
      const headerFinanceTab = page.locator("main header").getByRole("button", {
        name: "Keuangan",
        exact: true,
      });

      const activeBtn = financeRow.getByRole("button", { name: "Aktif", exact: true });
      const offBtn = financeRow.getByRole("button", { name: "Off", exact: true });
      const isEnabled = (await activeBtn.count()) > 0;

      if (isEnabled) {
        await expect(headerFinanceTab).toHaveCount(1);
      } else {
        await expect(headerFinanceTab).toHaveCount(0);
      }
      await expect(offBtn.or(activeBtn)).toHaveCount(1);
    });

    test("deep link view=keuangan sinkron dengan status modul finance", async ({
      page,
    }) => {
      await loginToWorkspace(page);

      const financeRow = page
        .locator("aside")
        .getByRole("listitem")
        .filter({ has: page.locator("span", { hasText: /^Keuangan$/ }) });
      const isEnabled =
        (await financeRow.getByRole("button", { name: "Aktif", exact: true }).count()) > 0;

      const u = new URL(page.url());
      u.searchParams.set("view", "keuangan");
      await page.goto(u.toString());
      await page.waitForLoadState("domcontentloaded");

      const viewNow = new URL(page.url()).searchParams.get("view");
      if (isEnabled) {
        expect(viewNow).toBe("keuangan");
      } else {
        expect(viewNow).toBe("dashboard");
      }
    });

    test("aktifkan modul Keuangan lalu tab Keuangan menampilkan form draft invoice", async ({
      page,
    }) => {
      await loginToWorkspace(page);
      await expect(
        page.locator("aside").getByText("Modul organisasi", { exact: true })
      ).toBeVisible({ timeout: 20_000 });

      const financeRow = page
        .locator("aside")
        .getByRole("listitem")
        .filter({ has: page.locator("span", { hasText: /^Keuangan$/ }) });
      const offBtn = financeRow.getByRole("button", { name: "Off", exact: true });
      if ((await offBtn.count()) > 0) {
        await offBtn.click();
      }
      await expect(
        page.locator("main header").getByRole("button", {
          name: "Keuangan",
          exact: true,
        })
      ).toBeVisible({ timeout: 25_000 });

      await page
        .locator("main header")
        .getByRole("button", { name: "Keuangan", exact: true })
        .click();

      await expect(
        page.getByRole("heading", { name: "Keuangan", exact: true })
      ).toBeVisible({ timeout: 15_000 });
      await expect(
        page.getByRole("button", { name: "Buat draft", exact: true })
      ).toBeVisible();
    });
  }
);
