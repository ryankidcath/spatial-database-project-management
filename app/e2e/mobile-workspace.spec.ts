import { test, expect } from "@playwright/test";
import {
  detectRootShell,
  expectLoginPage,
  loginToWorkspace,
  openSidebarChat,
} from "./workspace-shell";

const e2eEmail = process.env.E2E_EMAIL?.trim();
const e2ePassword = process.env.E2E_PASSWORD?.trim();
const hasE2eAuth = Boolean(e2eEmail && e2ePassword);

test.describe("Mobile workspace smoke (viewport HP)", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("halaman login memuat di viewport mobile", async ({ page }) => {
    await page.goto("/login");
    await expectLoginPage(page);
    const submit = page.getByRole("button", { name: /^Login$/i });
    const box = await submit.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
  });

  test("root: login, konfigurasi, atau workspace mobile", async ({ page }) => {
    await page.goto("/");
    const mode = await detectRootShell(page);
    if (mode === "workspace") {
      await expect(
        page.getByRole("tablist", { name: "Navigasi tab utama" })
      ).toBeVisible();
    }
  });

  test("sidebar drawer: buka lalu tutup backdrop", async ({ page }) => {
    await page.goto("/");
    const mode = await detectRootShell(page);
    if (mode !== "workspace") return;

    await page.getByRole("button", { name: "Buka sidebar" }).click();
    await expect(page.getByText("Spatial PM").first()).toBeVisible();
    await page.getByRole("button", { name: "Tutup sidebar" }).click();
    await expect(
      page.getByRole("button", { name: "Buka sidebar" })
    ).toBeVisible();
  });
});

(hasE2eAuth ? test.describe : test.describe.skip)(
  "Mobile workspace (E2E_EMAIL + E2E_PASSWORD)",
  () => {
    test.use({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    test.describe.configure({ timeout: 60_000 });

    test("chat sidebar membuka sheet dan bisa ditutup", async ({ page }) => {
      await loginToWorkspace(page, e2eEmail!, e2ePassword!);

      const chatKind = await openSidebarChat(page);
      expect(["organization", "project"]).toContain(chatKind);

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await expect(
        dialog.getByRole("heading", { name: "Chat" })
      ).toBeVisible();
      await expect(
        dialog.getByPlaceholder(/Tulis pesan/i)
      ).toBeVisible();

      await dialog.getByRole("button", { name: "Tutup panel" }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });
  }
);
