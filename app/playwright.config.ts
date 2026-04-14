import { defineConfig, devices } from "@playwright/test";

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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
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
