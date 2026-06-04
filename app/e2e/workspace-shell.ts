import { expect, type Page } from "@playwright/test";

/** Halaman login saat ini (judul Welcome back, tombol Login). */
export async function expectLoginPage(page: Page) {
  await expect(
    page.getByRole("heading", { name: /Welcome back/i })
  ).toBeVisible();
  await expect(page.locator("#login-email")).toBeVisible();
  await expect(page.locator("#login-password")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Login$/i })
  ).toBeVisible();
}

export type RootShellMode = "login" | "config" | "workspace";

/** Setelah goto `/`: login, pesan konfigurasi (CI tanpa Supabase), atau workspace. */
export async function detectRootShell(page: Page): Promise<RootShellMode> {
  await page.waitForLoadState("domcontentloaded");

  if (page.url().includes("/login")) {
    await expectLoginPage(page);
    return "login";
  }

  const config = page.getByText(/Konfigurasi aplikasi belum siap/i);
  const workspaceChrome = page
    .getByRole("button", { name: "Buka sidebar" })
    .or(page.getByRole("tablist", { name: "Navigasi tab utama" }));

  await expect(config.or(workspaceChrome).first()).toBeVisible({
    timeout: 20_000,
  });

  if (await config.isVisible()) return "config";
  return "workspace";
}

export async function loginToWorkspace(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: /^Login$/i }).click();
  await page.waitForURL((u: URL) => !u.pathname.includes("/login"), {
    timeout: 45_000,
  });
  await expect(
    page
      .getByRole("tablist", { name: "Navigasi tab utama" })
      .or(page.getByRole("heading", { name: "Pilih organisasi" }))
      .or(page.getByRole("heading", { name: "Pilih project" }))
  ).toBeVisible({ timeout: 45_000 });
}

async function isMobileWorkspaceChrome(page: Page): Promise<boolean> {
  return page
    .getByRole("tablist", { name: "Navigasi tab utama" })
    .isVisible()
    .catch(() => false);
}

/** Buka chat: header mobile → tab Chat inbox → sidebar (desktop). */
export async function openWorkspaceChat(
  page: Page
): Promise<"organization" | "project" | "inbox"> {
  const orgHeader = page.getByRole("button", { name: "Chat organisasi" });
  if ((await orgHeader.count()) > 0 && (await orgHeader.first().isVisible())) {
    await orgHeader.first().click();
    return "organization";
  }

  const projectHeader = page.getByRole("button", { name: "Chat proyek" });
  if (
    (await projectHeader.count()) > 0 &&
    (await projectHeader.first().isVisible())
  ) {
    await projectHeader.first().click();
    return "project";
  }

  const mobile = await isMobileWorkspaceChrome(page);
  if (mobile) {
    const chatTab = page.getByRole("tab", { name: "Chat" });
    if (await chatTab.isVisible().catch(() => false)) {
      await chatTab.click();
      const room = page.getByTestId("chat-inbox-room").first();
      await expect(room).toBeVisible({ timeout: 20_000 });
      await room.click();
      return "inbox";
    }
    throw new Error(
      "Tidak ada pintu chat mobile (header atau tab Chat inbox)."
    );
  }

  await page.getByRole("button", { name: "Buka sidebar" }).click();
  const sidebar = page.locator("aside");
  const orgSidebar = sidebar.getByRole("button", { name: "Chat organisasi" });
  if ((await orgSidebar.count()) > 0 && (await orgSidebar.first().isVisible())) {
    await orgSidebar.first().scrollIntoViewIfNeeded();
    await orgSidebar.first().click();
    return "organization";
  }

  const projectSidebar = sidebar.getByRole("button", { name: "Chat proyek" });
  await expect(projectSidebar.first()).toBeVisible({ timeout: 15_000 });
  await projectSidebar.first().scrollIntoViewIfNeeded();
  await projectSidebar.first().click();
  return "project";
}

/** @deprecated Gunakan `openWorkspaceChat` */
export const openSidebarChat = openWorkspaceChat;

/** Selesaikan wizard org → project jika belum di workspace (mobile v2). */
export async function ensureMobileWorkspaceReady(page: Page) {
  const tablist = page.getByRole("tablist", { name: "Navigasi tab utama" });
  if (await tablist.isVisible().catch(() => false)) return;

  const orgHeading = page.getByRole("heading", { name: "Pilih organisasi" });
  if (await orgHeading.isVisible().catch(() => false)) {
    await page.getByRole("listitem").first().getByRole("button").click({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("heading", { name: "Pilih project" })
    ).toBeVisible({ timeout: 20_000 });
  }

  const projectHeading = page.getByRole("heading", { name: "Pilih project" });
  if (await projectHeading.isVisible().catch(() => false)) {
    await page.getByRole("listitem").first().getByRole("button").click({
      timeout: 15_000,
    });
  }

  await expect(tablist).toBeVisible({ timeout: 25_000 });
}

export type OpenMobileTableResult = "opened" | "no-table" | "no-rows";

/** Tab Tabel → kartu tabel pertama → sheet detail baris (mobile v2). */
export async function openFirstMobileTableRowDetail(
  page: Page
): Promise<OpenMobileTableResult> {
  await page.getByRole("tab", { name: "Tabel" }).click();
  await expect(
    page.getByText(/Ketuk kartu tabel|Preview.*50 baris/i)
  ).toBeVisible({ timeout: 20_000 });

  const tableBtn = page.getByTestId("virtual-table-open").first();
  const hasTable = await tableBtn.isVisible().catch(() => false);
  if (!hasTable) {
    return "no-table";
  }

  await tableBtn.scrollIntoViewIfNeeded();
  await tableBtn.click();
  await expect(
    page.getByRole("button", { name: "← Daftar tabel" })
  ).toBeVisible({ timeout: 20_000 });

  const rowDetailBtn = page
    .getByRole("button", { name: /^Buka detail baris / })
    .first();
  const hasRows = await rowDetailBtn.isVisible().catch(() => false);
  if (!hasRows) {
    return "no-rows";
  }

  await rowDetailBtn.click();
  await expect(page.getByRole("tab", { name: "Detail" })).toBeVisible({
    timeout: 15_000,
  });
  return "opened";
}
