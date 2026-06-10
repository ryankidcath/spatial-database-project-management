import { test, expect } from "@playwright/test";
import {
  detectRootShell,
  ensureMobileWorkspaceReady,
  expectLoginPage,
  loginToWorkspace,
  openFirstMobileTableRowDetail,
  openWorkspaceChat,
  openWorkspaceSidebar,
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

    await openWorkspaceSidebar(page);
    await expect(page.getByText("Spatial PM").first()).toBeVisible();
    await page.getByRole("button", { name: "Tutup sidebar" }).click();
    await expect(
      page.getByRole("button", { name: "Menu lainnya" })
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

    test("tab Chat tampil di bottom bar", async ({ page }) => {
      await loginToWorkspace(page, e2eEmail!, e2ePassword!);
      await ensureMobileWorkspaceReady(page);
      await expect(
        page.getByRole("tab", { name: "Chat" })
      ).toBeVisible({ timeout: 15_000 });
    });

    test("wizard scope: org/project jika perlu lalu bottom bar", async ({
      page,
    }) => {
      await loginToWorkspace(page, e2eEmail!, e2ePassword!);
      await ensureMobileWorkspaceReady(page);
      await expect(
        page.getByRole("tablist", { name: "Navigasi tab utama" })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Buka menu scope" })
      ).toBeVisible({ timeout: 10_000 });
    });

    test("tabel: buka overlay dan sheet detail baris jika ada baris", async ({
      page,
    }) => {
      await loginToWorkspace(page, e2eEmail!, e2ePassword!);
      await ensureMobileWorkspaceReady(page);
      const result = await openFirstMobileTableRowDetail(page);
      if (result === "no-table") {
        test.skip(true, "Akun E2E tidak punya tabel virtual di scope project.");
      }
      if (result === "no-rows") {
        await expect(
          page.getByText(/Belum ada baris di tabel ini/i)
        ).toBeVisible({ timeout: 10_000 });
        return;
      }
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Tutup panel" }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });

    test("chat mobile membuka sheet obrolan dan bisa ditutup", async ({ page }) => {
      await loginToWorkspace(page, e2eEmail!, e2ePassword!);
      await ensureMobileWorkspaceReady(page);

      const chatKind = await openWorkspaceChat(page);
      expect(["organization", "project", "inbox"]).toContain(chatKind);

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await expect(
        dialog.getByPlaceholder(/Tulis pesan/i)
      ).toBeVisible();

      await dialog.getByRole("button", { name: "Tutup panel" }).click();
      await expect(dialog).toBeHidden({ timeout: 10_000 });
    });
  }
);
