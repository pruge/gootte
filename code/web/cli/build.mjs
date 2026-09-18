/**
 * CLI 독립 빌드 — `src/main.ts` 를 단일 파일로 묶어 `dist/gootte.cjs` 로 낸다.
 *
 * 산출물 하나 + `node` 만으로 돈다: workspace 소스(`@gootte/*`)·`zod`·`chokidar` 를
 * 전부 묶고, `node:sqlite` 같은 빌트인은 외부 참조로 둔다. tsx/npx/저장소 원본이
 * 없어도 `gootte` 명령이 동작한다 — 타 프로젝트·타 기계 배포용이다.
 *
 *   pnpm --filter @gootte/cli build   ( = node build.mjs )
 *   npm pack / npm i -g               (files: [dist], prepack 에서 자동 빌드)
 */
import { buildSync } from "esbuild";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(dir, "dist"), { recursive: true });

buildSync({
  entryPoints: [join(dir, "src/main.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: join(dir, "dist/gootte.cjs"),
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
chmodSync(join(dir, "dist/gootte.cjs"), 0o755);
console.log("built: code/web/cli/dist/gootte.cjs");
