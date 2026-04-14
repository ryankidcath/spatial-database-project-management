import { test, expect } from "@playwright/test";

const e2eEmail = process.env.E2E_EMAIL?.trim();
const e2ePassword = process.env.E2E_PASSWORD?.trim();
const hasE2eAuth = Boolean(e2eEmail && e2ePassword);

(hasE2eAuth ? test.describe : test.describe.skip)(
  "PLM alur (E2E_EMAIL + E2E_PASSWORD)",
  () => {
    test("login lalu tab Berkas tersedia", async ({ page }) => {
      await page.goto("/login");
      await page.locator("#login-email").fill(e2eEmail!);
      await page.locator("#login-password").fill(e2ePassword!);
      await page.getByRole("button", { name: /^Masuk$/i }).click();

      await page.waitForURL((u) => !u.pathname.includes("/login"), {
        timeout: 45_000,
      });

      await expect(
        page.getByRole("button", { name: "Berkas", exact: true })
      ).toBeVisible({ timeout: 15_000 });

      await page.getByRole("button", { name: "Berkas", exact: true }).click();

      await expect(
        page.getByText(/Daftar berkas permohonan|berkas permohonan/i).first()
      ).toBeVisible({ timeout: 20_000 });
    });
  }
);
