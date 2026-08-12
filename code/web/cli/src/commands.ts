import { defaultPlanDataDir, defaultProjectRoots, discoverProjects, migratePlanDb } from "@gootte/core-io";
import { CliError } from "./args";

/** CLI 명령 로직(순수 배선). main.ts 가 argv 를 명령별로 넘기고, 여기가 wiring: IO → core → text. */

export function discoverText(roots: string[]): string {
  const found = discoverProjects(roots);
  if (found.length === 0) return "(프로젝트 없음)";
  return found.map((p) => `${p.slug}\t${p.path}`).join("\n");
}

/** 프로젝트 slug → 저장소 경로. `discover` 와 같은 뿌리(cwd + `GOOTTE_ROOTS` 기본값)에서 찾는다. */
export function resolveProjectPath(project: string, cwd: string = process.cwd()): string | null {
  const found = discoverProjects([cwd, ...defaultProjectRoots()]);
  return found.find((p) => p.slug === project)?.path ?? null;
}

/**
 * `db migrate` — 기존 DB 를 지금 스키마로 올린다(spec §DB 는 잃어도 되는 물건, 버전 이력 없이
 * 지금 스키마에 맞추는 한 자리). 이미 최신이면 바뀐 게 없다고 그대로 말한다(멱등).
 */
export function dbMigrateText(dataDir = defaultPlanDataDir()): string {
  const { addedColumns, droppedColumns } = migratePlanDb(dataDir);
  if (addedColumns.length === 0 && droppedColumns.length === 0) return "이미 최신이다 — 바꾼 것 없음.";
  const lines = ["스키마를 지금 코드에 맞춰 올렸다:"];
  for (const c of addedColumns) lines.push(`  + ${c}`);
  for (const c of droppedColumns) lines.push(`  - ${c}`);
  return lines.join("\n");
}

/**
 * `next` — 자리만 비워 둔다(plan-board/01, spec §next). 옛 트랙 계산은 걷어냈고,
 * 05 가 다섯 자리 모델의 새 규칙으로 다시 쓴다.
 */
export function nextText(argv: readonly string[]): string {
  const [project] = argv;
  if (!project) throw new CliError("usage: gootte next <프로젝트>");
  return "아직 없다 — 05 가 새 규칙으로 다시 쓴다.";
}
