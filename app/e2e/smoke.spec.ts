import { test, expect } from "@playwright/test";
import { detectRootShell, expectLoginPage } from "./workspace-shell";

test.describe("Smoke (tanpa kredensial Supabase di CI)", () => {
  test("halaman login memuat judul dan form", async ({ page }) => {
    await page.goto("/login");
    await expectLoginPage(page);
  });

  test("root: konfigurasi kurang atau redirect login / workspace", async ({
    page,
  }) => {
    await page.goto("/");
    const mode = await detectRootShell(page);
    expect(["login", "config", "workspace"]).toContain(mode);
  });
});
