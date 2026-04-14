import { test, expect } from "@playwright/test";

test.describe("Smoke (tanpa kredensial Supabase di CI)", () => {
  test("halaman login memuat judul dan form", async ({ page }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: /Masuk — Spatial PM/i })
    ).toBeVisible();
    await expect(page.locator("#login-email")).toBeVisible();
    await expect(page.locator("#login-password")).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Masuk$/i })
    ).toBeVisible();
  });

  test("root: konfigurasi kurang atau redirect login / workspace", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    const onLogin = page.url().includes("/login");
    if (onLogin) {
      await expect(
        page.getByRole("heading", { name: /Masuk — Spatial PM/i })
      ).toBeVisible();
      return;
    }

    await expect(
      page.getByText(/Variabel lingkungan belum lengkap|Scope aktif/i).first()
    ).toBeVisible({ timeout: 20_000 });
  });
});
