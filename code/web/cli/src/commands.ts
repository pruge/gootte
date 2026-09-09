import { allTickets, applyBacklogStatus, computeDisplaySteps, computeNext, splitIntoAreas, UNRANKED_STEP, type BoardAreas } from "@gootte/core";
import { type Feature, AREA_LABEL, ALL_AREAS, type BoardAreaId, type TodoStatus } from "@gootte/contract";
import { basename, dirname, resolve } from "node:path";
import {
  clearStep,
  defaultPlanDataDir,
  discoverProjects,
  effectiveProjectRoots,
  isFirstmateProject,
  migratePlanDb,
  readBacklogTasks,
  readFeatures,
  readFeaturesWithTime,
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
  // 단일 사본이면 기존 줄 그대로(`slug\tpath`) — 한 글자도 안 바뀐다(수용 기준 3).
  // 사본이 둘 이상이면 개수를 덧붙여 같은 slug 가 묶였음을 알린다(T01).
  return found
    .map((p) =>
      p.copies.length > 1 ? `${p.slug}\t${p.path}\t(${p.copies.length} copies)` : `${p.slug}\t${p.path}`,
    )
    .join("\n");
}

/**
 * 프로젝트 slug → 저장소 경로. `discover` 와 같은 뿌리에서 찾는다 — cwd 최우선(크루가 자기 작업
 * 사본을 먼저 본다), 그 뒤는 env `GOOTTE_ROOTS`(콜론 구분), 없으면 기본 뿌리(T02) — 백엔드
 * `effectiveRoots`(backend/src/app.ts)와 **같은 규약**을 core-io `effectiveProjectRoots` 하나로 쓴다.
 */
export function resolveProjectPath(project: string, cwd: string = process.cwd()): string | null {
  const found = discoverProjects([cwd, ...effectiveProjectRoots()]);
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
 * 프로젝트 slug → 그 프로젝트의 **모든 사본 경로**(T01 묶음). `readFeatures` 가 합집합으로 읽는다. */
function requireProjectPath(project: string, cwd: string): string[] {
  return requireProject(project, cwd).copies;
}

/**
 * cwd → 프로젝트 slug 유추 — 조상을 올라가 **발견 표식**(AGENTS.md + docs/features, 캡틴 지시
 * 2026-09-09: "project 명을 주입하는 것이 없어야 한다")으로 자기 프로젝트를 찾는다.
 * 🔴 discover 목록 대신 **직접 표식 검사**로 올라간다 — cwd 가 깊어도(code/web 등) 뿌리를 찾는다.
 * 프로젝트 안 어디서 실행해도 같은 답. 못 찾으면 null.
 */
function slugFromCwd(cwd: string): string | null {
  let cur = resolve(cwd);
  for (let guard = 0; guard < 32; guard++) {
    if (isFirstmateProject(cur)) return basename(cur);
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
  return null;
}

/** `<프로젝트>` 인자 해소 — 생략하면 cwd 유추(캡틴 지시 2026-09-09). 있으면 기존대로. */
export function resolveProjectArg(argv: readonly string[], cwd: string, usage: string): string {
  const [explicit] = argv;
  if (explicit) return explicit;
  const inferred = slugFromCwd(cwd);
  if (inferred) return inferred;
  throw new CliError(`${usage}\n(프로젝트 안에서 실행하면 인자를 생략할 수 있다)`);
}

/**
 * 프로젝트 slug → 사본 목록 + 대표 경로. 대표 경로(`path`)는 시간·상태 레코드를
 * 읽는 자리다(time-records-to-state-store D4 — 레코드는 메인 프로젝트에만 있다).
 */
/** 프로젝트 해소 공용 — discover + 조상 폴백(캡틴 지시 2026-09-09). migrate-time 도 쓴다. */
export function requireProject(project: string, cwd: string): { copies: string[]; path: string } {
  const found = discoverProjects([cwd, ...effectiveProjectRoots()]);
  const p = found.find((x) => x.slug === project);
  if (p) return { copies: p.copies, path: p.path };
  // 🔴 cwd 가 프로젝트 **안**이면(예: code/web) 조상을 올려 발견 표식으로 찾는다 —
  // discover 의 depth 스캔은 조상을 안 보므로(캡틴 지시 2026-09-09: 인자 생략 지원).
  let cur = resolve(cwd);
  for (let guard = 0; guard < 32; guard++) {
    if (isFirstmateProject(cur) && basename(cur) === project) {
      const q = discoverProjects([cur]).find((x) => x.slug === project);
      if (q) return { copies: q.copies, path: q.path };
      return { copies: [cur], path: cur };
    }
    const parent = dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  throw new CliError(`프로젝트 없음: ${project}`);
}

/** 문서 읽기 + 레코드 조인 — CLI 의 읽기 명령이 모두 지나는 한 길(T03). */
function readProjectFeatures(project: string, cwd: string): { path: string; copies: string[]; features: Feature[] } {
  const { copies, path } = requireProject(project, cwd);
  return { path, copies, features: readFeaturesWithTime(copies, path) };
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
  projectPath: string[],
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


/**
 * 백로그 상태 조인을 얹은 기능 목록 — 화면(backend `withBacklogStatus`)과 **같은 판정 자리**
 * (`applyBacklogStatus`, core)를 지난다(the-terminal-agrees-with-the-screen T01).
 *
 * 🔴 신관례(`tickets/T<NN>.md`) 티켓의 상태 단일 출처는 firstmate 홈 백로그다(SoT — 파일에는
 * 상태가 없다). 이 조인 없이 CLI 는 이미 끝난 티켓을 미완료로 보고 `next` 가 다시 내놓는다.
 * firstmate 홈은 기존 설정 저장소(`settings.json` 의 `firstmateHome`, dataDir 는 CLI 기존
 * `planDataDir()` 과 같은 `GOOTTE_DATA_DIR` 규약)에서 읽는다 — 새 설정 칸·새 저장 파일 없다.
 *
 * 홈 미설정·백로그 파일 없음은 `readBacklogTasks` 가 빈 목록으로 흡수하고(INV-U1), 설정 저장소를
 * 못 읽는 것도 **조인만 꺼진다** — 계획 DB 의 고장을 board/next 전체의 죽음으로 전파하지 않는다.
 */
function withBacklogStatus(project: string, dataDir: string, features: Feature[]): Feature[] {
  return applyBacklogStatus(features, readBacklogTasks(undefined), project);
}

/**
 * `board <프로젝트>` — 다섯 칸 현황을 읽는다. **읽기 전용**(spec §자리를 옮기는 명령은 두지
 * 않는다) — 여기서 자리나 순서를 바꾸는 길은 없다.
 *
 * 🔴 판정 자리는 `splitIntoAreas`·`computeDisplaySteps` 둘뿐이다 — 화면과 같은 함수를 쓴다.
 *
 * 🔴 화면과 같은 자리에서 자동 닫힘(04)도 태운다(`readPlacementsWithAutoClose`, core-io) — 다
 * 끝난 카드가 화면을 한 번도 켜지 않고도 완료 칸으로 넘어간다. 판정(`planAutoClose`)은 그대로
 * core 하나뿐이고, 여기는 화면이 지나는 것과 같은 쓰기·재읽기 자리를 지날 뿐이다.
 *
 * 🔴 화면과 같은 자리에서 백로그 상태 조인(`withBacklogStatus`, T01)도 태운다 — 신관례 티켓의
 * 완료가 백로그에서만 오므로, 조인을 안 지나면 자동 닫힘도 영원히 못 일어난다.
 */
export function boardText(
  argv: readonly string[],
  dataDir = defaultPlanDataDir(),
  cwd: string = process.cwd(),
): string {
  rejectFlags(argv);
  const [project] = argv;
  if (!project) throw new CliError("usage: gootte board <프로젝트>");
  const { features } = readProjectFeatures(project, cwd);
  const placements = readPlacementsWithAutoClose(dataDir, project, features);
  const areas = splitIntoAreas(features, placements);
  const displaySteps = computeDisplaySteps(features, placements, readSteps(dataDir, project));

  const lines: string[] = [];
  for (const id of ALL_AREAS) {
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
 *
 * 🔴 `board` 와 같이 백로그 상태 조인(`withBacklogStatus`, T01)도 먼저 태운다 — 그래야 이미 done
 * 인 신관례 티켓이 next 에 다시 나오지 않는다(화면과 같은 상태, spec §결정).
 */
export function nextText(
  argv: readonly string[],
  dataDir = defaultPlanDataDir(),
  cwd: string = process.cwd(),
): string {
  rejectFlags(argv);
  const [project] = argv;
  if (!project) throw new CliError("usage: gootte next <프로젝트>");
  const { features } = readProjectFeatures(project, cwd);
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

/**
 * `feature state <프로젝트> <기능>` — 기능의 모든 티켓을 상태와 함께 출력.
 * 영역(작업 대상/대기/예약/폐기/완료) 관계없이 모든 티켓 표시.
 */
export function featureStateText(
  argv: readonly string[],
  dataDir = defaultPlanDataDir(),
  cwd: string = process.cwd(),
): string {
  rejectFlags(argv);
  const [project, featureSlug] = argv;
  if (!project || !featureSlug) throw new CliError("usage: gootte feature state <프로젝트> <기능>");
  const { features } = readProjectFeatures(project, cwd);
  const f = features.find((x) => x.slug === featureSlug);
  if (!f) throw new CliError(`기능 없음: ${featureSlug}`);
  const tickets = allTickets(f);
  if (tickets.length === 0) return "(티켓 없음)";
  return tickets
    .map((t) => {
      const statusLabel = t.status === "in_progress" && t.pauses?.some((p) => p.resumedAt === null)
        ? "일시중단"
        : t.status;
      return `${t.slug}\t${statusLabel}\t${t.title}`;
    })
    .join("\n");
}

/**
 * 프로젝트 전체에서 상태로 걸러낸 티켓 목록(캡틴 지시 2026-09-09) — 처리중(`working`)과
 * 대기(`pending`). 줄 서식은 캡틴이 정한 그대로 `<기능-slug>\\t<티켓>` 이다.
 *
 * 🔴 판정은 화면과 **같은 자리**를 지난다 — 레코드 조인(`readProjectFeatures`) + 백로그 조인
 * (`withBacklogStatus`) 뒤의 `ticket.status` 만 본다. 여기서 상태를 다시 추정하지 않는다(INV-4).
 */
function filteredTicketsText(
  argv: readonly string[],
  statuses: readonly TodoStatus[],
  cmd: string,
  dataDir = defaultPlanDataDir(),
  cwd: string = process.cwd(),
): string {
  rejectFlags(argv);
  const project = resolveProjectArg(argv, cwd, `usage: gootte ${cmd} [프로젝트]`);
  const { features } = readProjectFeatures(project, cwd);
  const joined = withBacklogStatus(project, dataDir, features);
  const rows = joined
    .flatMap((f) => allTickets(f).filter((t) => statuses.includes(t.status)).map((t) => `${f.slug}\t${t.slug}`));
  return rows.length > 0 ? rows.join("\n") : "(해당 티켓 없음)";
}

/** 처리중 티켓 목록 — `gootte working [프로젝트]`. 프로젝트 안에서 실행하면 인자 생략. */
export function workingText(argv: readonly string[], dataDir = defaultPlanDataDir(), cwd: string = process.cwd()): string {
  return filteredTicketsText(argv, ["in_progress"], "working", dataDir, cwd);
}

/** 대기 티켓 목록 — `gootte pending [프로젝트]`. 프로젝트 안에서 실행하면 인자 생략. */
export function pendingText(argv: readonly string[], dataDir = defaultPlanDataDir(), cwd: string = process.cwd()): string {
  return filteredTicketsText(argv, ["pending"], "pending", dataDir, cwd);
}
