import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

// 결정적 e2e — jinwooauto(머신 종속) 대신 backend 픽스처(alpha)로 discover.
const FIXTURES = fileURLToPath(new URL("../backend/test/fixtures/roots", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  reporter: "list",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  // 두 서버를 각각 ready 확인 후 테스트 → 경합 없음(backend 먼저 200 확인, frontend 200 확인).
  webServer: [
    {
      command: `GOOTTE_ROOTS='${FIXTURES}' PORT=8787 pnpm -C ../backend start`,
      url: "http://localhost:8787/api/projects",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: "pnpm dev",
      url: "http://localhost:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
