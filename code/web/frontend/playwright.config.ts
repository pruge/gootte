import { defineConfig } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// 결정적 e2e — jinwooauto(머신 종속) 대신 backend 픽스처(alpha)로 discover.
const FIXTURES = fileURLToPath(new URL("../backend/test/fixtures/roots", import.meta.url));

// backend 의 계획·설정 저장소도 이 e2e 전용 임시 저장소로 갈라 놓는다 — 저장된 firstmateHome 은
// env 루트(effectiveRoots·부팅 감시기)를 이기므로, 호스트의 ~/.gootte/settings.json 이
// 남아 있는 기계에서는 픽스처 대신 실제 데이터를 보고 e2e 가 엉뚱한 깨짐을 낳는다.
const DATA_DIR = mkdtempSync(join(tmpdir(), "gootte-e2e-data-"));

// 🔴 포트의 SoT 는 scripts/ports.sh 다 — playwright.config 안의 숫자는 사본일 뿐이고,
// 사본은 낡는다(실측: 5173·8787 하드코둔 채 포트 체계로 이전돼 webServer 가 아무도 안 기다리는
// 포트를 기다렸다). 그래서 해석기를 직접 부른다 — 격리 사본이면 .ports.worktree 값이 이긴다.
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const portsEnv = execFileSync("bash", [join(REPO_ROOT, "scripts", "ports.sh")], {
  cwd: REPO_ROOT,
  stdio: ["ignore", "pipe", "inherit"], // stderr(어느 설정을 썼는지)는 통과
})
  .toString()
  .trim();
const PORTS = Object.fromEntries(
  portsEnv.split("\n").map((line) => {
    const eq = line.indexOf("=");
    return [line.slice(0, eq), line.slice(eq + 1)];
  }),
) as { BACKEND_PORT: string; FRONTEND_PORT: string };
const BACKEND_PORT = Number(PORTS.BACKEND_PORT);
const FRONTEND_PORT = Number(PORTS.FRONTEND_PORT);

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  reporter: "list",
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: "on-first-retry",
  },
  // 두 서버를 각각 ready 확인 후 테스트 → 경합 없음(backend 먼저 200 확인, frontend 200 확인).
  webServer: [
    {
      command: `GOOTTE_ROOTS='${FIXTURES}' GOOTTE_DATA_DIR='${DATA_DIR}' PORT=${BACKEND_PORT} pnpm -C ../backend start`,
      url: `http://localhost:${BACKEND_PORT}/api/projects`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      // vite 단독 실행(dev-frontend.sh 와 같은 근거) — CLI --port 로 해석기 값을 덮고,
      // VITE_BACKEND_URL 로 프록시 대상도 이 e2e 가 띄운 픽스처 backend 로 묶는다.
      command: `VITE_BACKEND_URL=http://localhost:${BACKEND_PORT} pnpm run dev --port ${FRONTEND_PORT} --strictPort`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
