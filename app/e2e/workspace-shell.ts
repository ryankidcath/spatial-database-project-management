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
      .or(page.getByRole("button", { name: "Berkas", exact: true }))
  ).toBeVisible({ timeout: 45_000 });
}

/** Buka drawer sidebar lalu klik Chat organisasi atau Chat proyek (pertama). */
export async function openSidebarChat(
  page: Page
): Promise<"organization" | "project"> {
  await page.getByRole("button", { name: "Buka sidebar" }).click();

  const sidebar = page.locator("aside");
  const chatEntry = sidebar.getByRole("button", {
    name: /Chat (organisasi|proyek)/,
  });
  await expect(chatEntry.first()).toBeVisible({ timeout: 15_000 });

  const orgChat = sidebar.getByRole("button", { name: "Chat organisasi" });
  if ((await orgChat.count()) > 0) {
    await orgChat.first().scrollIntoViewIfNeeded();
    await orgChat.first().click();
    return "organization";
  }

  const projectChat = sidebar.getByRole("button", { name: "Chat proyek" });
  await expect(projectChat.first()).toBeVisible({ timeout: 15_000 });
  await projectChat.first().scrollIntoViewIfNeeded();
  await projectChat.first().click();
  return "project";
}
