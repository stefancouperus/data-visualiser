import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
const localChrome =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4186",
    launchOptions: existsSync(localChrome)
      ? { executablePath: localChrome }
      : {},
  },
  webServer: {
    command: "npm run dev -- --port 4186 --strictPort",
    url: "http://127.0.0.1:4186",
    reuseExistingServer: !process.env.CI,
  },
});
