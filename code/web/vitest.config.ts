import { defineConfig } from "vitest/config";

/**
 * 커버리지 게이트 — `pnpm -C code/web test:coverage` (= vitest run --coverage).
 * 패키지별 test 환경 분리는 vitest.workspace.ts 가 소유하고, 여기엔 커버리지만 둔다.
 * include 는 실제 소스(core-io · cli · frontend)만 — contract 는 타입만,
 * backend/core 는 이 게이트 범위 밖(선장 결정 2026-08-25).
 * 임계치는 2026-08-25 베이스라인(전체 소스 기준 Stmts 87.1 / Branch 88.94 / Funcs 79.93 /
 * Lines 87.1)을 출발점으로 삼되, 진입점·배럴(얇은 위임층 — 테스트 대상 아님)을 include 에서
 * 뺀 실측(Stmts 90.13 / Branch 89.28 / Funcs 81.03 / Lines 90.13)에 맞춰 각 지표를
 * 베이스라인보다 높게 고정했다. 미달 시 suite 가 실패한다.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["core-io/src/**", "cli/src/**", "frontend/src/**"],
      exclude: [
        "cli/src/main.ts", // 진입점(얇은 위임층) — 테스트 대상 아님
        "cli/src/index.ts", // 배럴 재출력
        "**/*.test.*",
        "**/*.config.*",
        "frontend/src/main.tsx", // 진입점
        "frontend/src/App.tsx", // 프로바이더 조립 루트(진입점 접착)
      ],
      thresholds: {
        statements: 90,
        branches: 89,
        functions: 81,
        lines: 90,
      },
    },
  },
});
