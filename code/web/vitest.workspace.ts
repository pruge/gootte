import { defineWorkspace } from "vitest/config";

/**
 * 패키지별 test 환경 분리 — backend/core = node(기본), frontend = jsdom(자기 vite.config).
 * 루트 `vitest run`(= pnpm verify)이 각 패키지 config 를 존중.
 */
export default defineWorkspace([
  "./contract",
  "./core",
  "./core-io",
  "./cli",
  "./backend",
  "./frontend",
]);
