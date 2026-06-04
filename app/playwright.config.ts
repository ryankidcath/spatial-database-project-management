import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { defineConfig, devices } from "@playwright/test";

/** Lokal: muat `app/.env.e2e.local` (gitignored) bila env belum diset di shell. */
function loadE2eEnvLocal(): void {
  const path = resolve(__dirname, ".env.e2e.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key]) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadE2eEnvLocal();

const port = 3000;
const externalBase = process.env.PLAYWRIGHT_BASE_URL?.trim();
const baseURL = externalBase || `http://127.0.0.1:${port}`;

/** Di CI: proses Next tanpa URL Supabase agar skenario smoke deterministik. */
function webServerEnv(): Record<string, string> | undefined {
  if (!process.env.CI) return undefined;
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    NODE_ENV: "production",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  };
}

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-chrome",
      use: { ...devices["Pixel 5"] },
      testMatch: /mobile-workspace\.spec\.ts/,
    },
  ],
  ...(externalBase
    ? {}
    : {
        webServer: {
          command: process.env.CI
            ? `npm run build && npx next start -p ${port}`
            : `npm run dev -- --port ${port}`,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: webServerEnv(),
        },
      }),
});
