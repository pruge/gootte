import { allTickets, computeDisplaySteps, computeNext, splitIntoAreas, UNRANKED_STEP, type BoardAreas } from "@gootte/core";
import {
  clearStep,
  defaultPlanDataDir,
  defaultProjectRoots,
  discoverProjects,
  migratePlanDb,
  readFeatures,
  readPlacements,
  readPlacementsWithAutoClose,
  readSteps,
  writeStep,
} from "@gootte/core-io";
import { CliError, parseTicketRef } from "./args";

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

function requireProjectPath(project: string, cwd: string): string {
  const path = resolveProjectPath(project, cwd);
  if (!path) throw new CliError(`프로젝트 없음: ${project}`);
  return path;
}

/** `--why` 를 비롯해 이 명령 셋은 어떤 플래그도 받지 않는다(spec §`--why` 를 받지 않는다). */
function rejectFlags(argv: readonly string[]): void {
  const flag = argv.find((a) => a.startsWith("--"));
  if (flag) throw new CliError(`${flag} 는 받지 않는다 — 이유는 문서에도 DB 에도 남기지 않는다`);
}

/**
 * 이 티켓이 지금 단계를 매길 수 있는가 — **작업 대상에 있는, 문서에 실제로 있는 티켓**뿐이다.
 * 판정은 이 한 줄만 하고, 나머지(당김·순서)는 `core` 의 `computeDisplaySteps` 몫이다.
 */
function assertActiveTicket(
  projectPath: string,
  dataDir: string,
  project: string,
  feature: string,
  ticket: string,
): void {
  const f = readFeatures(projectPath).find((x) => x.slug === feature);
  if (!f) throw new CliError(`기능 없음: ${feature}`);
  if (!allTickets(f).some((t) => t.slug === ticket))
    throw new CliError(`티켓 없음: ${feature}/${ticket}`);
  const row = readPlacements(dataDir, project).find((p) => p.feature === feature);
  if (!row || row.area !== "active") {
    throw new CliError(`${feature} 는 작업 대상에 없다 — 단계를 매길 수 없다`);
  }
}

/**
 * `step <프로젝트> <기능>/<티켓> <N>` — firstmate 가 티켓 하나에 단계를 매긴다(spec §단계).
 * 🔴 이유를 받지 않는다. 자리를 옮기지 않는다 — 매기는 것은 `step` 표 한 칸뿐이다.
 */
export function stepText(
  argv: readonly string[],
  dataDir = defaultPlanDataDir(),
  cwd: string = process.cwd(),
): string {
  rejectFlags(argv);
  const [project, ref, nRaw] = argv;
  if (!project || !ref || nRaw === undefined) {
    throw new CliError("usage: gootte step <프로젝트> <기능>/<티켓> <N>");
  }
  const n = Number(nRaw);
  if (!Number.isInteger(n) || n < 1) throw new CliError("N 은 1 이상의 정수여야 한다");
  const parsed = parseTicketRef(ref);
  if (!parsed) throw new CliError("usage: <기능>/<티켓>");
  const { feature, ticket } = parsed;
  const path = requireProjectPath(project, cwd);
  assertActiveTicket(path, dataDir, project, feature, ticket);
  writeStep(dataDir, project, feature, ticket, n);
  return `${feature}/${ticket} → ${n}단계`;
}

/**
 * `step --clear <프로젝트> <기능>/<티켓>` — 단계를 뗀다. 없는 행을 떼도 조용히 끝난다(멱등) —
 * 이미 뗀 것을 다시 떼는 일이 오류가 될 이유가 없다.
 */
export function stepClearText(
  argv: readonly string[],
  dataDir = defaultPlanDataDir(),
  cwd: string = process.cwd(),
): string {
  rejectFlags(argv);
  const [project, ref] = argv;
  if (!project || !ref) throw new CliError("usage: gootte step --clear <프로젝트> <기능>/<티켓>");
  const parsed = parseTicketRef(ref);
  if (!parsed) throw new CliError("usage: <기능>/<티켓>");
  const { feature, ticket } = parsed;
  requireProjectPath(project, cwd);
  clearStep(dataDir, project, feature, ticket);
  return `${feature}/${ticket} — 단계를 뗐다`;
}

type AreaId = keyof BoardAreas;

const AREA_ORDER: readonly AreaId[] = ["active", "waiting", "reserved", "discarded", "done"];
const AREA_LABEL: Record<AreaId, string> = {
  active: "작업 대상",
  waiting: "대기",
  reserved: "예약",
  discarded: "폐기",
  done: "완료",
};

/**
 * `board <프로젝트>` — 다섯 칸 현황을 읽는다. **읽기 전용**(spec §자리를 옮기는 명령은 두지
 * 않는다) — 여기서 자리나 순서를 바꾸는 길은 없다.
 *
 * 🔴 판정 자리는 `splitIntoAreas`·`computeDisplaySteps` 둘뿐이다 — 화면과 같은 함수를 쓴다.
 *
 * 🔴 화면과 같은 자리에서 자동 닫힘(04)도 태운다(`readPlacementsWithAutoClose`, core-io) — 다
 * 끝난 카드가 화면을 한 번도 켜지 않고도 완료 칸으로 넘어간다. 판정(`planAutoClose`)은 그대로
 * core 하나뿐이고, 여기는 화면이 지나는 것과 같은 쓰기·재읽기 자리를 지날 뿐이다.
 */
export function boardText(
  argv: readonly string[],
  dataDir = defaultPlanDataDir(),
  cwd: string = process.cwd(),
): string {
  rejectFlags(argv);
  const [project] = argv;
  if (!project) throw new CliError("usage: gootte board <프로젝트>");
  const path = requireProjectPath(project, cwd);
  const features = readFeatures(path);
  const placements = readPlacementsWithAutoClose(dataDir, project, features);
  const areas = splitIntoAreas(features, placements);
  const displaySteps = computeDisplaySteps(features, placements, readSteps(dataDir, project));

  const lines: string[] = [];
  for (const id of AREA_ORDER) {
    const cards = areas[id];
    lines.push(`## ${AREA_LABEL[id]} (${cards.length})`);
    for (const card of cards) {
      lines.push(`- ${card.feature.slug}`);
      if (id !== "active") continue;
      for (const t of allTickets(card.feature)) {
        const step = displaySteps[card.feature.slug]?.[t.slug];
        const label = step === undefined ? "-" : step === UNRANKED_STEP ? "9999" : String(step);
        lines.push(`    [${label}] ${t.slug} ${t.title}`);
      }
    }
  }
  return lines.join("\n");
}

/**
 * `next <프로젝트>` — 작업 대상에 있는 기능의, 표시 기준 1단계 티켓만 말한다(spec §next,
 * plan-board/05). 트랙 묶음도 어긋남도 없다(INV-B3).
 *
 * 🔴 판정 자리는 `computeNext`(core) 하나뿐이다 — 화면(카드)과 같은 함수를 쓴다.
 *
 * 🔴 `board` 와 같이, 자동 닫힘(04)도 같은 자리(`readPlacementsWithAutoClose`)를 지난다 — 다
 * 끝난 기능은 작업 대상을 떠나므로 `computeNext` 가 더 이상 그 티켓을 말하지 않는다.
 */
export function nextText(
  argv: readonly string[],
  dataDir = defaultPlanDataDir(),
  cwd: string = process.cwd(),
): string {
  rejectFlags(argv);
  const [project] = argv;
  if (!project) throw new CliError("usage: gootte next <프로젝트>");
  const path = requireProjectPath(project, cwd);
  const features = readFeatures(path);
  const placements = readPlacementsWithAutoClose(dataDir, project, features);
  const steps = readSteps(dataDir, project);
  const tickets = computeNext(features, placements, steps);
  if (tickets.length === 0) return "(1단계 없음)";
  // 🔴 캡틴 눈 여부는 이미 계산된 값을 그대로 싣는다 — 받는 쪽이 티켓 파일을 다시 열어 세지
  // 않는다(INV-E1, the-eye-mark-comes-from-one-place/01).
  return tickets
    .map((t) => `${t.feature}/${t.ticket}\t${t.title}${t.needsCaptainEye ? " 👁" : ""}`)
    .join("\n");
}
