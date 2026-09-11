import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanBoardResponse,
  PlanMoveRequest,
  StepMoveRequest,
  type ApiError,
  type Feature,
} from "@gootte/contract";
import {
  finalizeFeatureStatus,
  allTickets,
  applyInProgress,
  applyReadState,
  computeDisplaySteps,
  isTicketDoc,
  placeStep,
  planMove,
  splitIntoAreas,
  type BoardAreas,
} from "@gootte/core";
import {
  readFeatures,
  readFeatureDoc,
  readPlacements,
  readPlacementsWithAutoClose,
  readReadMarks,
  readSteps,
  writePlanMove,
  writeStep,
  ensureReadSeed,
  markDocRead,
  scanWorkingCopies,
  extraWorktreeRoots,
  defaultBbWorktreeRoot,
  defaultPlanDataDir,
  defaultTreehouseRoot,
  readSettings,
  dirExists,
  effectiveProjectRoots,
  resolveProjects,
  readState,
  recalcProjectState,
  joinTimeRecords,
} from "@gootte/core-io";
import type { CopyScan } from "@gootte/core";
import { getProjects, getProjectsPayload, resolveSlug, clearDiscoverCache, clearPayloadCache } from "./discover-cache";
import { createFeaturesCompute, type FeaturesCompute } from "./features-compute";
import {
  recordProjectScan,
  recordInProgress,
  snapshotCopiesFor,
  snapshotFeatures,
  snapshotInProgress,
  clearSnapshot,
  clearInProgressMemory,
} from "./snapshot";
import { createMemoRoutes } from "./routes/memo";
import { createTimeRoutes } from "./routes/time";
import { createSettingsRoutes } from "./routes/settings";
import { createStorageRoutes } from "./routes/storage";

/**
 * env `GOOTTE_ROOTS`(콜론 구분) → discover 루트. 기본 `~/Documents/ai2/projects`. */
export function defaultRoots(): string[] {
  // 🔴 파싱 규칙은 core-io `effectiveProjectRoots` 하나뿐이다(T02) — cli 가 같은 함수를 쓴다.
  return effectiveProjectRoots();
}

/** env `GOOTTE_TREEHOUSE` → 격리 사본 뿌리. 기본 `~/.treehouse`. 기계마다 다를 수 있다. */
export function treehouseRoot(): string {
  return process.env.GOOTTE_TREEHOUSE?.trim() || defaultTreehouseRoot();
}

/** env `GOOTTE_BB_WORKTREES` → BB 에이전트 worktree 뿌리. 기본 `~/.bb/worktrees`(core-io 가 SoT). */
export function bbWorktreeRoot(): string {
  return defaultBbWorktreeRoot();
}

/** env `GOOTTE_DATA_DIR` → 계획(INV-5) 저장 자리. CLI(`cli/src/main.ts`)와 같은 관례. */
export function planDataDir(): string {
  return process.env.GOOTTE_DATA_DIR?.trim() || defaultPlanDataDir();
}

/** 계획 DB 가 막힌 이유는 뭉개지 않고 그대로 올린다(INV-4 릴레이) — 빈 판으로 감추지 않는다. */
const planError = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const slugParam = z.object({ slug: z.string().min(1) });
const featureDocParam = z.object({ slug: z.string().min(1), feature: z.string().min(1) });
const featureDocQuery = z.object({ path: z.string().min(1) });
export interface AppOptions {
  /** discover 루트 (테스트 주입). 없으면 defaultRoots(). */
  roots?: string[];
  /** 격리 사본 뿌리 (테스트 주입). 없으면 treehouseRoot(). */
  treehouse?: string;
  /** BB 에이전트 worktree 뿌리 (테스트 주입). 없으면 bbWorktreeRoot(). */
  bbWorktrees?: string;
  /** 파생물 계산 창구 (테스트 주입). 없으면 워커를 띄운다(read-path-redesign/T07). */
  compute?: FeaturesCompute;
  /** 계획 저장소 경로 (테스트 주입). 없으면 planDataDir(). */
  dataDir?: string;
  /** 완료 칸에 찍을 시각 (테스트 주입). 없으면 `nowStamp()`. */
  now?: () => string;
  /**
   * 명시 감시 프로젝트(`projects`)가 바뀐 뒤의 통보(D6) — 문서 감시기를
   * 새 프로젝트 목록으로 다시 묶는다. 값은 저장 뒤 다시 계산한 실제 프로젝트(`resolveProjects`).
   */
  onProjectsChange?: (projects: string[]) => void;
  /**
   * 처리중 관측 갱신이 끝났을 때 알릴 방송(T07, swap). `inProgressFor` 가 디스크 스냅샷을 갱신하고
   * 내용이 바뀌었을 때만 호출한다 — 프론트가 같은 `project` 이벤트로 다시 요청해 교체한다.
   * 없으면 갱신만 하고 방송은 안 한다(테스트).
   */
  // 🔴 `projects` 도 보낸다(read-path-redesign/T03) — 사이드바 배지가 백그라운드로 채워지면
  // 그 사실을 화면에 알려야 한다. 프론트 `live.ts` 는 두 어휘를 이미 안다.
  broadcast?: (event: { kind: "project"; project: string } | { kind: "projects" }) => void;
}

/**
 * 완료 칸에 들어간 시각 — `YYYY-MM-DD HH:mm`, 이 기계의 시간.
 * 🔴 이 값을 저장하는 이유는 하나다: **문서에는 완료 날짜만 있고 시각이 없다**(spec F6). 캡틴이
 * 시각을 요구하셨으므로 저장 자격이 있다(INV-5) — 다른 어디서도 다시 읽어 낼 수 없는 값이다.
 * 카드가 그대로 그리는 문자열이라 사람이 읽는 서식으로 만든다.
 */
export function nowStamp(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/**
 * Hono 앱 팩토리 — CORE projections 를 CONTRACT envelope 로 서빙(INV-4 릴레이).
 * **관리대상에는 한 글자도 쓰지 않는다**(INV-2) — core-io read + core 순수 계산뿐이다.
 * 쓰기는 gootte 자기 저장소에만 있다: 계획(`plan.db`)과 설정(`settings.json` — 사용자가 정한
 * 감시 루트·firstmate 홈. INV-5 가 저장을 허락하는 값이다).
 */
export function createApp(options: AppOptions = {}): Hono {
  const fallbackRoots = options.roots ?? defaultRoots();
  const treehouse = options.treehouse ?? treehouseRoot();
  const bbWorktrees = options.bbWorktrees ?? bbWorktreeRoot();
  const dataDir = options.dataDir ?? planDataDir();
  const now = options.now ?? (() => nowStamp());
  const broadcast = options.broadcast;
  const app = new Hono();

  /**
   * 지금 이 요청이 볼 discover 뿌리 — 명시 `projects` 가 있으면 그것이 권위고, 없으면
   * env·플랫폼 기본값(`fallbackRoots`)으로 떨어진다(D6, `resolveProjects`). 🔴 생성 시 한 번
   * 얼려 두지 않고 **요청마다 다시 읽는다**(INV-3) — 설정을 바꾸면 다음 요청부터 곧장 새 뿌리가
   * 보여야 하고, 재시작 없이 적용된다는 것이 그래서 참이 된다. 파일 read 하나라 매 요청에 감당 가능하다.
   */
  const effectiveRoots = (): string[] => {
    try {
      return resolveProjects(dataDir, fallbackRoots);
    } catch {
      return fallbackRoots;
    }
  };

  /**
   * `readFeatures` 의 스냅샷 우선 버전(fast-cold-start T03/T07). 스냅샷에 **같은 slug** 기록이
   * 있으면 git 하위프로세스 없이 그대로 답한다(stale-while-validate — 빈 화면을 막는다). 없으면
   * 스캔해 그 자리에서 스탬프와 함께 영구 기록한다. 사본 구성/HEAD 가 바뀐 갱신은 이 자리에서
   * 하지 않고 부팅 재검증(`revalidateSnapshot`)과 감시 신호(`scheduleProjectUpdate`)가
   * 백그라운드로 해서 준비되면 교체한다(WS broadcast → 화면 swap, adr/0001).
   * 🔴 `clearDiscoverCache` 는 더 이상 디스크 스냅샷을 지우지 않으므로 재기동 시에도 항상
* 이 저장값이 즉시 서빙된다.
    */
  const withWorktrees = (copies: readonly string[]): string[] =>
    [...copies, ...extraWorktreeRoots(copies, bbWorktrees)];

  /**
   * 🔴 무거운 계산은 **워커에서** 돈다(read-path-redesign/T07) — 그동안 메인 루프가 비어 있어
   * 드로어 클릭이 즉시 답한다. 워커가 못 뜨면 인라인으로 내려앉는다(`features-compute.ts`).
   */
  const compute: FeaturesCompute = options.compute ?? createFeaturesCompute();

  const featuresFor = async (slug: string, copies: readonly string[], path: string): Promise<Feature[]> => {
    const all = withWorktrees(copies);
    // 🔴 스냅샷 hit 는 copies 를 가리지 않는다(저장 시점 구성의 낡은 값일 수 있다). 새 worktree 가
    // 생기면(구성이 달라지면) 그 자리에서 다시 읽어 기록한다 — 옛 스냅샷이 worktree 의 문서·Time 을
    // 빠뜨린 채 즉시 서빙되는 것을 막는다(INV-3 stale 뷰 금지, 캡틴 지시: 새 worktree 자동 갱신).
    const savedCopies = snapshotCopiesFor(dataDir, slug);
    if (savedCopies && savedCopies.length === all.length && savedCopies.every((c, i) => c === all[i])) {
      const hit = snapshotFeatures(dataDir, slug, all);
      // 🔴 새 기능 폴더 감지 — 사본 구성이 같아도 `docs/features/` 아래에 **새 폴더**(untracked 로
      // 아직 커밋 안 된 기능 포함)가 생기면 스냅샷은 낡았다(INV-3). `snapshotNeedsRefresh` 는 사본 구성만을
      // 보지 않으므로(15초 재스캔 지연 방지) 여기서 디스크 폴더 목록과 스냅샷 feature slug 를
      // 견줘, 다르면 스냅샷을 우회하고 다시 읽는다(실제 결함 2026-09-01: slider-widget-operator
      // worktree 에 spec.md 만 있는 command-field-authoring 폴더가 감지되지 않았다).
      if (hit && sameFeatureFolders(hit, all)) return joinTimeRecords(hit, path);
    }
    const features = await compute.run(all);
    recordProjectScan(dataDir, { slug, path, copies: [...all] }, features);
    // 🔴 시간·상태 레코드 조인(time-records-to-state-store/T03) — 스냅샷 히트·재계산 어느
    // 길이든 **서빙 직전에** 지난다. 조인을 스냅샷 저장 전에 하지 않는 이유는 레코드가 바뀌어도
    // 스냅샷 무효화 없이 다음 읽기가 곧 새 값을 보게 하기 위해서다(INV-3 — 캐시에 굳지 않는다).
    return joinTimeRecords(features, path);
  };

  /**
   * 스냅샷이 여전히 유효한가 — **디스크의 기능 폴더가 스냅샷에 이미 있는 것뿐인가**.
   * 새 폴더(untracked 로 아직 커밋 안 된 기능 포함)가 스냅샷에 없으면 stale(true 아님).
   * 🔴 단방향이다 — **문서가 사라진 쪽**(스냅샷엔 있고 디스크엔 없는)은 stale 로 보지 않는다.
   * 그건 stale-while-validate 의 원래 의미다: 작업 중 문서가 잠깐 사라져도(체크아웃 등) 스냅샷을
   * 서빙해 빈 화면을 막는다(snapshot.test.ts 가 고정). 🔴 `readdirSync` 만 쓴다 — git 하위프로세스
   * 없이 저렴하게 새 폴더 유무만 본다.
   */
  const sameFeatureFolders = (snapshotFeatures: readonly Feature[], copies: readonly string[]): boolean => {
    const snapshotSlugs = new Set(snapshotFeatures.map((f) => f.slug));
    for (const copy of copies) {
      const root = join(copy, "docs", "features");
      if (!existsSync(root)) continue;
      for (const name of readdirSync(root)) {
        if (dirExists(join(root, name)) && !snapshotSlugs.has(name)) return false;
      }
    }
    return true;
  };

  /**
   * 처리중 관측 서빙(T07) — 재기동에도 마지막 기록을 **즉시** 내주고(빈 화면 금지), 갱신은 백그라운드로
   * 한다. 메모리(TTL) → 디스크 스냅샷 → 없으면 `scanWorkingCopies`(git 하위프로세스) 순으로 본다.
   * 갱신은 디바운스로 걸어, 내용이 바뀐 때만 `broadcast`(`project`) 해 프론트가 swap 하게 한다.
   * 🔴 `scanWorkingCopies` 는 매 요청 동기 호출하면 탭마다 spin 이 되살아나므로 여기서만 한다.
   */
  const IN_PROGRESS_TTL_MS = 5_000;
  const inProgressMem = new Map<string, { at: number; scan: CopyScan }>();
  const inProgressTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** 프로젝트 사본 절대 경로들 — discover copies + Claude Code worktree(`.claude/worktrees/*`).
   *  worktree 는 git worktree 라 `.git` 이 파일이고 저장소로 관측·문서로 읽을 수 있다. readFeatures
   *  가 이 목록으로 문서를 읽으므로, worktree 의 `Time: finished=` 가 티켓 상태에 반영된다(캡틴 지시).
   *  캐시된 discover 위에서 해소하므로 매 호출 가벼운 편(5s TTL, discover-cache). */
  const projectCopiesFor = (project: string): string[] =>
    withWorktrees(resolveSlug(effectiveRoots(), project)?.copies ?? []);
  const saveInProgress = (project: string, scan: CopyScan): void => {
    recordInProgress(dataDir, project, scan);
    inProgressMem.set(project, { at: Date.now(), scan });
  };
  const refreshInProgress = async (project: string): Promise<void> => {
    try {
      // 🔴 관측(D 등급)도 워커에서 — 사본마다 git 을 도는 일이라 메인 루프에 두면
      // `/api/features/:slug` 가 도는 동안 문서 요청이 그 뒤에 선다(실측 540ms, T08).
      const scan = await compute.scan({ root: treehouse, project, projectPaths: projectCopiesFor(project), bbRoot: bbWorktrees });
      const prev = inProgressMem.get(project)?.scan;
      saveInProgress(project, scan);
      if (JSON.stringify(prev) !== JSON.stringify(scan)) broadcast?.({ kind: "project", project });
    } catch {
      // 관측 실패는 조용히 — 옛 값을 그대로 유지한다(INV-U1 과 같은 원칙).
    }
  };
  const scheduleInProgressRefresh = (project: string): void => {
    const pending = inProgressTimers.get(project);
    if (pending) clearTimeout(pending);
    inProgressTimers.set(
      project,
      setTimeout(() => {
        inProgressTimers.delete(project);
        void refreshInProgress(project);
      }, 200),
    );
  };
  /**
   * 차단 목록(blockedCopies) 필터 — gootte 자기 저장소의 사용자 결정(INV-5)을 read-time 으로
   * 적용해 화면에서만 숨긴다. 실제 worktree 는 건드리지 않는다(INV-2, 트리하우스는 관측만).
   * 식별자는 `CopyScan.copies[].slug`(`<풀>/<슬롯>`). 캐시(mem/disk)엔 안 필터된 원본을 두고,
   * 서빙할 때마다 설정을 다시 읽어 거른다 — 사용자가 차단을 풀면 즉시 다시 뜬다. `inProgressFor` 와
   * `/api/features/:slug` 라우트(직접 `scanWorkingCopies` 를 부르는 길) 둘 다 이걸로 같이 거른다.
   */
  const filterBlockedCopies = (scan: CopyScan): CopyScan => {
    const blocked = new Set(readSettings(dataDir).blockedCopies);
    if (blocked.size === 0) return scan;
    return { ...scan, copies: scan.copies.filter((c) => !blocked.has(c.slug)) };
  };

  const inProgressFor = async (project: string): Promise<CopyScan> => {
    const mem = inProgressMem.get(project);
    let scan: CopyScan;
    if (mem && Date.now() - mem.at < IN_PROGRESS_TTL_MS) {
      scan = mem.scan;
    } else {
      const disk = snapshotInProgress(dataDir, project);
      if (disk) {
        inProgressMem.set(project, { at: Date.now(), scan: disk });
        scheduleInProgressRefresh(project);
        scan = disk;
      } else {
        scan = await compute.scan({ root: treehouse, project, projectPaths: projectCopiesFor(project), bbRoot: bbWorktrees });
        saveInProgress(project, scan);
        scheduleInProgressRefresh(project);
      }
    }
    return filterBlockedCopies(scan);
  };

  const notFound = (slug: string): ApiError => ({ error: `프로젝트 없음: ${slug}` });

  /**
   * 안 읽음 표시를 얹은 기능 목록 — `features` 탭과 **같은 판정 자리**(`applyReadState`)를
   * `plan`·`process` 탭에도 태운다(unread-tickets-show-themselves/02). 읽음 기록이 막히면
   * 조용히 꺼진다(INV-U1) — 판 자체를 죽이지 않는다.
   */
  const withReadState = (project: string, features: Feature[]): Feature[] => {
    try {
      ensureReadSeed(dataDir, project, features);
      return applyReadState(features, readReadMarks(dataDir, project));
    } catch {
      return applyReadState(features, null);
    }
  };

  /**
   * 처리중 표시를 얹은 기능 목록 — `features` 탭과 **같은 판정 자리**(`applyInProgress`)를
   * `plan`·`process` 탭에도 태운다(status-colors-tell-apart/02, spec H6 — "계획 탭 줄에 이미
   * 실려 와 있다" 는 이 자리가 있어야 참이 된다). 판정은 격리 사본 관측 하나뿐 — 여기서
   * 다시 정하지 않는다(H5). 관측은 항상 값을 낸다(뿌리가 없으면 `rootExists:false` 인 빈
   * 결과) — `withReadState` 와 달리 예외를 삼킬 이유가 없다.
   */
  const withInProgress = async (project: string, features: Feature[]): Promise<Feature[]> =>
    applyInProgress(features, await inProgressFor(project)).features;

  /**
   * 최종 상태를 확정한 기능 목록 — `features` 탭과 **같은 판정 자리**(`finalizeFeatureStatus`)를
   * `plan`·`process` 탭에도 태운다. `tickets/T<NN>.md` 신관례 티켓의 상태 단일 출처는 티켓
   * 문서(`Status:`·`Time:`·의존)다 — 확정 없이 그 탭의 신관례 티켓은 영원히 "상태 줄 없음" 으로만 보인다.
   */
  const withFinalStatus = (features: Feature[]): Feature[] => finalizeFeatureStatus(features);

  /**
   * 판 하나를 그린다 — **판을 보는 모든 길이 이 한 자리를 지난다**(GET 도, 옮긴 뒤의 응답도).
   *
   * 🔴 여기서 **자동 닫힘**이 일어난다(plan-board/04): 상자가 전부 채워진 기능을 처음 보는 순간
   * `area=완료` 를 적는다 — `closed_at` 은 찍지 않는다(06, `planAutoClose`). 누가 알려 주어서가
   * 아니라 **볼 때마다 다시 판정**하기
   * 때문에(INV-3), 작업자가 티켓 문서를 완료로 바꾸면 다음 read 에서 저절로 닫힌다 — 새 감시기도,
   * 새 전송로도 만들지 않는다(문서 변경은 이미 있는 워처가 WS 로 밀고, 화면은 이 라우트를 다시 묻는다).
   *
   * 🔴 판정은 한 줄도 여기 없다 — 무엇이 닫히는지는 `planAutoClose`(core), 어느 칸에 담기는지는
   * `splitIntoAreas`(core)가 정한다(spec §판정 자리는 하나뿐). 자동 닫힘을 태우고 자리 행을
   * 다시 읽는 것 자체는 `readPlacementsWithAutoClose`(core-io) 하나뿐 — CLI `board`·`next` 도
   * 같은 자리를 지난다(카드 완료 칸 넘김이 화면을 안 켜도 일어나는 이유).
   */
  const readBoard = (project: string, features: Feature[]): BoardAreas => {
    const placements = readPlacementsWithAutoClose(dataDir, project, features);
    const areas = splitIntoAreas(features, placements);
    // 표시 단계(당김까지 끝난 값, plan-board/05) — 판정 자리는 `computeDisplaySteps` 하나뿐이다.
    // 작업 대상 카드에만 값을 싣는다 — 단계는 작업 대상에 있는 동안만 존재한다.
    const displaySteps = computeDisplaySteps(features, placements, readSteps(dataDir, project));
    return {
      ...areas,
      active: areas.active.map((c) => ({ ...c, steps: displaySteps[c.feature.slug] ?? {} })),
    };
  };

  // ── 설정 — settings.ts 로 분리 ──
  app.route("/", createSettingsRoutes({
    dataDir,
    effectiveRoots,
    onProjectsChange: options.onProjectsChange,
  }));

  // ── 저장소 사용량 — storage.ts 로 분리 (settings-storage-meter) ──
  app.route("/", createStorageRoutes());

  // POST /api/refresh — 캐시·스냅샷을 통째로 비운다. 새 worktree 나 새 기능 폴더가 생겼는데
  // 감지가 안 될 때(스냅샷이 낡았을 때) 사용자가 손으로 밀어 넣는 길(캡틴 지시 2026-08-31).
  // 다음 요청부터 각 라우트가 빈 스냅샷 위에서 다시 스캔해 기록한다 — INV-1 파생물이라 지우는
  // 것만으로 충분하고, 관리대상에는 아무것도 쓰지 않는다(INV-2).
  app.post("/api/refresh", (c) => {
    try {
      clearDiscoverCache(); // discover 메모리 캐시 + 페이로드 TTL
      clearSnapshot(); // 기능 스냅샷(디스크+메모리)
      clearInProgressMemory(); // 처리중 관측 메모리
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

  // GET /api/projects → ProjectsResponse (discover, W2 캐시).
  // 🔴 남은 일이 있는 기능 수는 **캐시하지 않는다** — 발견 결과와 달리 문서가 바뀔 때마다 변하는
  // 파생물이라 요청마다 다시 읽고 다시 센다(INV-1·INV-3). 문서 read 뿐이라 git 을 부르지 않는다.
  /**
   * 사이드바 배지(`openFeatures`) 기억 — `slug` → { salt, count }(read-path-redesign/T03).
   *
   * 🔴 예전에는 `/api/projects` 가 배지 하나 때문에 **모든 프로젝트**의 `featuresFor` 를 요청
   * 자리에서 돌렸다. 프로젝트가 셋인데도 그 안의 jinwooauto 하나가 수 초를 먹고, 전부 동기라
   * 그동안 **문서 클릭이 그 뒤에 줄을 섰다**(spec §4). 첫 화면이 반드시 부르는 라우트라
   * 증상이 "앱 켜고 처음" 에 몰렸다.
   *
   * 이제 배지는 state.json에서 즉시 읽는다(T06). 백그라운드 카운팅은 불필요.
   */

  /** 지금 내줄 값 — state.json에서 읽는다. 🔴 0 도 싣는다(캡틴 지시 2026-09-09): 배지가
   * 아예 안 그려지면 "다 끝났는지, 아직 못 센 것인지" 알 수 없다. 0(다 끝남)과
   * undefined(state.json 없음 = 아직 안 열어본 프로젝트)는 다른 값이다. */
  const openCountOf = (slug: string): number | undefined => {
    try {
      const proj = resolveSlug(effectiveRoots(), slug);
      if (!proj) return undefined;
      if (!existsSync(join(proj.path, ".gootte", "state.json"))) return undefined;
      return readState(proj.path).openFeatures.length;
    } catch {
      return undefined;
    }
  };

  app.get("/api/projects", (c) => {
    const projects = getProjectsPayload(
      effectiveRoots(),
      () =>
        getProjects(effectiveRoots()).map((p) => {
          const count = openCountOf(p.slug);
          return count === undefined ? p : { ...p, openFeatures: count };
        }),
      "",
    );
    return c.json(ProjectsResponse.parse({ projects }));
  });

  // GET /api/features/:slug → FeaturesResponse (docs/features/ 기능별 할일, INV-2 read-only)
  // 관리대상 문서를 읽는 경로는 이제 이것 하나뿐이다.
  // 막힘 해제는 요청마다 다시 계산된다(INV-1·INV-3).
  // 처리중은 **입력이 다르다** — 문서가 아니라 격리 사본 관측이다. 요청마다 다시 관측하고
  // 어디에도 저장하지 않는다. 티켓에 잇지 못한 작업은 `inProgress.unknown` 으로 드러난다.
  app.get("/api/features/:slug", zValidator("param", slugParam), async (c) => {
    const { slug } = c.req.valid("param");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json(notFound(slug), 404);
    const project = basename(proj.path);
    const features = await featuresFor(proj.slug, proj.copies, proj.path);
    // 이 기능이 이 프로젝트에서 처음 올라간 순간 있던 티켓은 읽은 것으로 깐다 — 한 번만 선다
    // (unread-tickets-show-themselves/01 §첫 화면이 통째로 초록이면 안 된다).
    //
    // 🔴 깔기·읽기 어느 쪽이 막혀도 이 라우트 전체를 죽이지 않는다 — 계획 DB 가 고장 나도
    // 할일 목록 자체는 문서만으로 서고, 안 읽음 표시만 조용히 꺼진다(INV-U1: 거짓 초록보다
    // 표시가 아예 없는 쪽이 낫다).
    let readMarks: Set<string> | null;
    try {
      ensureReadSeed(dataDir, project, features);
      readMarks = readReadMarks(dataDir, project);
    } catch {
      readMarks = null;
    }
    const observed = applyInProgress(
      applyReadState(features, readMarks),
      await inProgressFor(project),
    );
    // T04 — `tickets/T<NN>.md` 신관례의 상태 단일 출처는 티켓 문서다.
    const finalized = {
      ...observed,
      features: finalizeFeatureStatus(observed.features),
    };
    // 🔴 선택된 프로젝트의 배지는 여기서 공짜로 정확해진다(T03) — 이 라우트가 이미 같은 계산을
    // 했으므로, 그 결과를 그대로 사이드바 배지로 기억한다. 화면이 고른 프로젝트가 곧 이 라우트를
    // 부르는 프로젝트라, 서버가 "선택" 이라는 세션 상태를 갖지 않아도 같은 효과가 난다.
    recalcProjectState(proj.path, finalized.features);
    clearPayloadCache();
    return c.json(FeaturesResponse.parse({ project, ...finalized }));
  });

  // GET /api/plan/:slug → PlanBoardResponse (`plan` 탭 — 다섯 자리 판, plan-board/02)
  //
  // 두 입력이 만난다: 관리대상 문서(INV-2 read-only, 매 요청 다시 읽는다)와 gootte 자기 계획
  // 저장소의 자리 행(INV-5 — 캡틴이 정한 것만). 가르는 것은 `core` 순수 함수 하나뿐이라
  // 화면과 CLI 가 같은 판정을 본다(spec §판정 자리는 하나뿐).
  //
  // 🔴 **관리대상에는 한 글자도 쓰지 않는다**(INV-2). 문서를 새로 써도 등록 절차가 없으므로
  // (INV-B1) 그 기능은 자리 행이 없는 채로 곧장 대기 칸에 나타난다.
  //
  // 🔴 계획 DB 에는 **딱 한 가지**를 쓴다 — 상자가 전부 채워진 기능을 처음 보는 순간의 닫힘
  // (04, `readBoard`). 그것이 gootte 가 스스로 쓰는 유일한 자리다(spec §gootte 가 스스로 쓰는 단 한 순간).
  app.get("/api/plan/:slug", zValidator("param", slugParam), async (c) => {
    const { slug } = c.req.valid("param");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json(notFound(slug), 404);
    const project = basename(proj.path);
    try {
      const areas = readBoard(
        project,
        withFinalStatus(
          await withInProgress(project, withReadState(project, await featuresFor(proj.slug, proj.copies, proj.path))),
        ),
      );
      return c.json(PlanBoardResponse.parse({ project, ...areas }));
    } catch (err) {
      // 계획 DB 를 못 읽는 것은 빈 판이 아니다 — 빈 판으로 그리면 화면이 "아무 계획도 없다" 고
      // 거짓말한다. 무엇이 막혔는지 그대로 올린다.
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

  // POST /api/plan/:slug/move → PlanBoardResponse (캡틴이 카드를 옮긴다, plan-board/03)
  //
  // 🔴 계획 DB 에 **쓰는 유일한 입구**다. 자리를 옮기는 CLI 는 두지 않는다(spec §자리를 옮기는
  // 명령은 두지 않는다) — 열어 두면 firstmate 나 planner 가 슬쩍 자리를 옮기고, 그것이 캡틴이
  // 지적하신 문제 ①이 반대 방향으로 되살아나는 모양이다.
  //
  // 🔴 **관리대상에는 여전히 한 글자도 쓰지 않는다**(INV-2). 처리중 표시도, 옮긴 이유도 티켓
  // 문서에 적지 않는다 — 쓰기는 gootte 자기 저장소의 `plan.db` 안에서 끝난다.
  //
  // 🔴 **놓을 수 있는지 검사하지 않는다**(INV-B3). 여기서 거절하는 것은 딱 하나, **문서가 없는
  // 기능 이름**이다 — 그것은 캡틴의 판단이 아니라 요청이 이미 낡았다는 뜻이고, 조용히 버리면
  // 화면이 옮겨진 척한다.
  app.post(
    "/api/plan/:slug/move",
    zValidator("param", slugParam),
    zValidator("json", PlanMoveRequest),
    async (c) => {
      const { slug } = c.req.valid("param");
      const move = c.req.valid("json");
      const proj = resolveSlug(effectiveRoots(), slug);
      if (!proj) return c.json(notFound(slug), 404);
      const project = basename(proj.path);
      try {
        const features = readFeatures(withWorktrees(proj.copies));
        const known = new Set(features.map((f) => f.slug));
        const missing = move.features.filter((f) => !known.has(f));
        if (missing.length > 0) {
          return c.json(
            { error: `문서가 없는 기능입니다: ${missing.join(", ")}` } satisfies ApiError,
            400,
          );
        }
        writePlanMove(dataDir, project, planMove(features, readPlacements(dataDir, project), move, now()));
        // 옮긴 뒤의 판은 **다시 읽어** 만든다 — 방금 쓴 값으로 응답을 조립하면 그것이 곧 DB 의
        // 2차 사본이고, 한 번이라도 어긋나면 화면이 옮겨진 척한다(INV-1·INV-3).
        // 그 길에 자동 닫힘도 함께 선다(04) — 상자가 다 채워진 카드를 캡틴이 다른 칸으로 옮겨도
        // 판을 그리는 규칙은 하나여야 한다. 옮기는 자리와 닫는 자리가 갈리면 화면이 둘을 다르게 본다.
        const areas = readBoard(
          project,
          withFinalStatus(await withInProgress(project, withReadState(project, features))),
        );
        return c.json(PlanBoardResponse.parse({ project, ...areas }));
      } catch (err) {
        return c.json({ error: planError(err) } satisfies ApiError, 500);
      }
    },
  );

  // POST /api/plan/:slug/step → PlanBoardResponse (캡틴이 `process` 탭에서 티켓을 끌어 단계를
  // 정한다, plan-board/08)
  //
  // 🔴 놓은 자리 → 저장 숫자 계산은 `core` 의 `placeStep` 하나뿐이다(spec §놓은 자리를 저장
  // 숫자로 옮기는 계산) — 화면은 "어느 자리에 놓았다" 만 보낸다.
  //
  // 🔴 쓰는 자리는 `writeStep` 하나 — `step` 명령(cli)이 이미 쓰던 그 칸이다(spec §명령과
  // 화면이 같은 자리를 쓴다). 여기서 새로 쓰기 경로를 만들지 않는다.
  //
  // 🔴 **놓을 수 있는지 검사하지 않는다**(INV-B3). 거절하는 것은 문서가 없는 기능·티켓 이름과
  // 작업 대상 밖의 기능뿐이다 — 그것들은 캡틴의 판단이 아니라 요청이 이미 낡았다는 뜻이다.
  app.post(
    "/api/plan/:slug/step",
    zValidator("param", slugParam),
    zValidator("json", StepMoveRequest),
    async (c) => {
      const { slug } = c.req.valid("param");
      const { feature, ticket, target } = c.req.valid("json");
      const proj = resolveSlug(effectiveRoots(), slug);
      if (!proj) return c.json(notFound(slug), 404);
      const project = basename(proj.path);
      try {
        const features = readFeatures(proj.copies);
        const f = features.find((x) => x.slug === feature);
        if (!f) return c.json({ error: `문서가 없는 기능입니다: ${feature}` } satisfies ApiError, 400);
        if (!allTickets(f).some((t) => t.slug === ticket)) {
          return c.json(
            { error: `문서가 없는 티켓입니다: ${feature}/${ticket}` } satisfies ApiError,
            400,
          );
        }
        const placements = readPlacements(dataDir, project);
        if (!placements.some((p) => p.feature === feature && p.area === "active")) {
          return c.json(
            { error: `작업 대상 밖의 기능입니다: ${feature}` } satisfies ApiError,
            400,
          );
        }
        const step = placeStep(features, placements, readSteps(dataDir, project), target);
        writeStep(dataDir, project, feature, ticket, step);
        // 옮긴 뒤의 판은 **다시 읽어** 만든다 — /move 와 같은 규율이다(INV-1·INV-3).
        const areas = readBoard(
          project,
          withFinalStatus(await withInProgress(project, withReadState(project, features))),
        );
        return c.json(PlanBoardResponse.parse({ project, ...areas }));
      } catch (err) {
        return c.json({ error: planError(err) } satisfies ApiError, 500);
      }
    },
  );

  // GET /api/features/:slug/:feature/doc?path= → FeatureDocResponse (기능 문서 본문, INV-2 read-only)
  // 🔴 요청받은 path 는 readFeatureDoc 이 그 기능 폴더 안으로 해소되는지 판정한 뒤에야 읽는다 —
  // 벗어나면 400 으로 거절한다(티켓 01 §설계 4). 관리대상엔 아무것도 쓰지 않는다.
  app.get(
    "/api/features/:slug/:feature/doc",
    zValidator("param", featureDocParam),
    zValidator("query", featureDocQuery),
    (c) => {
      const { slug, feature } = c.req.valid("param");
      const { path } = c.req.valid("query");
      const proj = resolveSlug(effectiveRoots(), slug);
      if (!proj) return c.json(notFound(slug), 404);
      const result = readFeatureDoc(withWorktrees(proj.copies), feature, path);
      if (!result.ok) {
        const error: ApiError =
          result.reason === "outside"
            ? { error: "기능 폴더 밖의 경로는 읽을 수 없습니다" }
            : { error: `문서를 찾을 수 없습니다: ${path}` };
        return c.json(error, result.reason === "outside" ? 400 : 404);
      }
      // 티켓 원문을 열면 읽음이 된다(unread-tickets-show-themselves/01) — 세 탭 어디서 열었든
      // 이 자리 하나로 모인다(spec F1·F2). 판정은 한 자리에서 한다 — 아래 `isTicketDoc`.
      if (isTicketDoc(path)) {
        markDocRead(dataDir, basename(proj.path), feature, path);
      }
      return c.json(FeatureDocResponse.parse({ path, content: result.content }));
    },
  );

  // ── 시간 기록 — time.ts 로 분리 ──
  app.route("/", createTimeRoutes({
    resolveSlug,
    effectiveRoots,
    withWorktrees,
    bbWorktrees,
    dataDir,
    broadcast,
  }));

  // ── 메모 (memo-pad) — memo.ts 로 분리 ──
  app.route("/", createMemoRoutes({
    resolveSlug,
    effectiveRoots,
    dataDir,
    now,
  }));

  // 🔴 워커를 세션 종료 때 정리할 수 있게 앱에 달아 둔다(T07) — 붙잡은 스레드를 놓지 않으면
  // 프로세스가 안 끝난다. 서버(`server.ts`)의 shutdown 이 이걸 부른다.
  (app as Hono & { closeCompute?: () => Promise<void> }).closeCompute = () => compute.close();
  return app;
}

/**
 * 캐치올 fallback — server.ts 가 `/api/live`(WS) 등록 *후* 마지막에 마운트(순서상 `*` 가 WS 라우트를 삼키지 않게).
 *
 * backend-serves-ui — `GOOTTE_SERVE_DIST=1` 이고 dist 가 있으면 frontend 빌드 산물을 직접
 * 서빙한다(Tauri preview arm 의 vite 대체). 프론트는 same-origin 상대경로만 쓰므로(`BASE=""`,
 * `liveUrl()`) 프록시 없이 `/api`·`/api/live` 가 그대로 붙는다. flag off 거나 dist 가 없으면
 * 기존 placeholder 그대로 — dev backend·e2e 는 낡은 dist 를 조용히 서빙하지 않는다.
 */
export function mountFallback(app: Hono): void {
  const dist = resolveDistDir();
  if (!dist) {
    app.get("*", (c) => c.text("gootte backend — frontend 미빌드 (web-dashboard 2a T2+)", 200));
    return;
  }
  // D4 — 정확한 파일 + `/`(→index.html)만. deep link 가 없어(쿼리 파라미터만 쓴다)
  // rewrite 는 두지 않고, dist 밖은 404 다.
  app.get("*", (c) => {
    const rel = decodeURIComponent(c.req.path).replace(/^\/+/, "") || "index.html";
    return serveDistFile(c, dist, rel);
  });
}

/**
 * 서빙할 dist — flag 가 켜져 있고 `index.html` 이 있을 때만. 테스트용 env 오버라이드
 * (`GOOTTE_DIST_DIR`, `GOOTTE_WEBKIT_DATA_DIR` 선례)를 먼저 본다.
 */
function resolveDistDir(): string | null {
  if (process.env.GOOTTE_SERVE_DIST !== "1") return null;
  const here = dirname(fileURLToPath(import.meta.url)); // backend/src
  const override = process.env.GOOTTE_DIST_DIR?.trim();
  const dist = override || join(here, "..", "..", "frontend", "dist");
  // 없으면 placeholder 로 떨어진다(T01 기본) — 기동 실패 판단은 점화자(T02 main.rs) 몫이다.
  try {
    if (statSync(join(dist, "index.html")).isFile()) return dist;
  } catch {
    // 없음 — placeholder 로 떨어진다
  }
  return null;
}

const DIST_MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

/** dist 안의 파일 하나 — 루트 밖으로 벗어나면 404(경로 탈출 금지). */
function serveDistFile(c: Context, dist: string, rel: string) {
  const abs = join(dist, rel);
  const prefix = dist.endsWith(sep) ? dist : dist + sep;
  if (abs !== dist && !abs.startsWith(prefix)) {
    return c.text("찾을 수 없음", 404);
  }
  try {
    if (!statSync(abs).isFile()) return c.text("찾을 수 없음", 404);
    const body = readFileSync(abs);
    const ext = extname(abs).toLowerCase();
    const type = DIST_MIME[ext] ?? "application/octet-stream";
    return c.body(body, 200, { "content-type": type });
  } catch {
    return c.text("찾을 수 없음", 404);
  }
}
