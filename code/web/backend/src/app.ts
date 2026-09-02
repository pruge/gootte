import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanBoardResponse,
  PlanMoveRequest,
  StepMoveRequest,
  SettingsResponse,
  SettingsUpdateRequest,
  MemosResponse,
  Memo,
  MemoWriteRequest,
  MemoDeleteResponse,
  type ApiError,
  type Feature,
  type Settings,
} from "@gootte/contract";
import {
  applyBacklogStatus,
  allTickets,
  applyInProgress,
  applyReadState,
  computeDisplaySteps,
  countOpenFeatures,
  placeStep,
  planMove,
  splitIntoAreas,
  type BoardAreas,
} from "@gootte/core";
import {
  readFeatures,
  readFeatureDoc,
  readBacklogTasks,
  readPlacements,
  readPlacementsWithAutoClose,
  readReadMarks,
  readSteps,
  writePlanMove,
  writeStep,
  ensureReadSeed,
  markDocRead,
  scanWorkingCopies,
  claudeWorktreeRoots,
  currentBranch,
  defaultPlanDataDir,
  defaultTreehouseRoot,
  readSettings,
  writeSettings,
  normalizeDirPath,
  dirExists,
  suggestFirstmateHome,
  effectiveProjectRoots,
  resolveWatchRoots,
  readMemos,
  appendMemo,
  updateMemo,
  deleteMemo,
} from "@gootte/core-io";
import type { CopyScan } from "@gootte/core";
import { getProjects, getProjectsPayload, resolveSlug, clearDiscoverCache } from "./discover-cache";
import {
  recordProjectScan,
  recordInProgress,
  snapshotCopiesFor,
  snapshotFeatures,
  snapshotInProgress,
  clearSnapshot,
  clearInProgressMemory,
} from "./snapshot";

/**
 * 읽음 기록 대상 문서인가 — **티켓뿐이다**(캡틴 결정 ②). 경로 모양만 본다(INV-4, 문서를 다시 안 읽는다).
 * - 구관례: `issues/` 안의 문서(기존 동작 유지)
 * - 신관례: `tickets/T<NN>.md` — 모양 규칙의 SoT 는 `core-io/src/features.ts` 의 `/^t\\d+\\.md$/i` 다.
 *   두 자리가 어긋나면 "열어도 안 풀리는 초록" 또는 "티켓도 아닌데 남는 기록" 이 생기므로 같은 뜻을 유지한다.
 *   `tickets/README.md` 같은 안내문은 티켓이 아니므로 기록 대상도 아니다.
 */
function isTicketDoc(path: string): boolean {
  if (path.startsWith("issues/")) return true;
  if (!path.startsWith("tickets/")) return false;
  return /^t\d+\.md$/i.test(path.slice("tickets/".length));
}

/** env `GOOTTE_ROOTS`(콜론 구분) → discover 루트. 기본 `~/Documents/ai2/projects`. */
export function defaultRoots(): string[] {
  // 🔴 파싱 규칙은 core-io `effectiveProjectRoots` 하나뿐이다(T02) — cli 가 같은 함수를 쓴다.
  return effectiveProjectRoots();
}

/** env `GOOTTE_TREEHOUSE` → 격리 사본 뿌리. 기본 `~/.treehouse`. 기계마다 다를 수 있다. */
export function treehouseRoot(): string {
  return process.env.GOOTTE_TREEHOUSE?.trim() || defaultTreehouseRoot();
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
  /** 계획 저장소 경로 (테스트 주입). 없으면 planDataDir(). */
  dataDir?: string;
  /** 완료 칸에 찍을 시각 (테스트 주입). 없으면 `nowStamp()`. */
  now?: () => string;
  /**
   * firstmate 홈 설정이 바뀐 뒤의 통보(tauri-desktop-app T03, one-setting-finds-every-copy T05
   * 로 확장) — 문서 감시기와 백로그 감시기를 **둘 다** 새 홈에서 파생된 뿌리로 다시 묶는 데
   * 쓴다(INV-3: 감시기도 설정값을 따라간다). 값은 저장 뒤 다시 읽은 것.
   */
  onFirstmateHomeChange?: (firstmateHome: string | null) => void;
  /**
   * 명시 감시 뿌리(`watchRoots`)가 바뀐 뒤의 통보(per-folder-watch-roots) — 문서 감시기를
   * 새 뿌리 목록으로 다시 묶는다. 백로그는 firstmate 홈에 종속되므로 여기선 건드리지 않는다.
   * 값은 저장 뒤 다시 계산한 실제 뿌리(`resolveWatchRoots`).
   */
  onWatchRootsChange?: (roots: string[]) => void;
  /**
   * firstmate 홈 placeholder 추천 후보 (테스트 주입). 없으면 `suggestFirstmateHome` 기본 후보
   * (실제 host 경로) — 테스트는 실제 host 를 보지 않도록 임시 디렉토리를 주입한다.
   */
  firstmateHomeSuggestionCandidates?: string[];
  /**
   * 처리중 관측 갱신이 끝났을 때 알릴 방송(T07, swap). `inProgressFor` 가 디스크 스냅샷을 갱신하고
   * 내용이 바뀌었을 때만 호출한다 — 프론트가 같은 `project` 이벤트로 다시 요청해 교체한다.
   * 없으면 갱신만 하고 방송은 안 한다(테스트).
   */
  broadcast?: (event: { kind: "project"; project: string }) => void;
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
  const dataDir = options.dataDir ?? planDataDir();
  const now = options.now ?? (() => nowStamp());
  const broadcast = options.broadcast;
  const app = new Hono();

  /**
   * 지금 이 요청이 볼 discover 루트 — 명시 `watchRoots` 가 있으면 그것이 권위고, 없으면 firstmate
   * 홈에서 파생(`deriveWatchRoots`), 그래도 없으면 env·플랫폼 기본값(`fallbackRoots`)으로
   * 떨어진다(per-folder-watch-roots, `resolveWatchRoots`). 🔴 생성 시 한 번 얼려 두지 않고
   * **요청마다 다시 읽는다**(INV-3) — 설정을 바꾸면 다음 요청부터 곧장 새 루트가 보여야 하고,
   * 재시작 없이 적용된다는 것이 그래서 참이 된다. 파일 read 하나라 매 요청에 감당 가능하다.
   */
  const effectiveRoots = (): string[] => {
    try {
      return resolveWatchRoots(dataDir, fallbackRoots);
    } catch {
      // 설정 파일을 못 읽는 것은 기본값으로 떨어질 이유가 아니라 알릴 사실이다 — 아래
      // /api/settings 가 같은 자리를 읽으며 큰 소리로 낸다. 여기선 서비스 연속성을 택한다.
      return fallbackRoots;
    }
  };

  /** 설정 + 응답 시점에 다시 본 존재 여부(INV-3 — 존재는 저장하지 않는다). */
  const settingsWithExists = (s: Settings): SettingsResponse => ({
    ...s,
    firstmateHomeExists: dirExists(s.firstmateHome),
    firstmateHomeSuggestion: options.firstmateHomeSuggestionCandidates
      ? suggestFirstmateHome(options.firstmateHomeSuggestionCandidates)
      : suggestFirstmateHome(),
    effectiveWatchRoots: effectiveRoots(),
  });

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
    [...copies, ...claudeWorktreeRoots(copies)];

  const featuresFor = (slug: string, copies: readonly string[], path: string): Feature[] => {
    const all = withWorktrees(copies);
    // 🔴 스냅샷 hit 는 copies 를 가리지 않는다(저장 시점 구성의 낡은 값일 수 있다). 새 worktree 가
    // 생기면(구성이 달라지면) 그 자리에서 다시 읽어 기록한다 — 옛 스냅샷이 worktree 의 문서·Time 을
    // 빠뜨린 채 즉시 서빙되는 것을 막는다(INV-3 stale 뷰 금지, 캡틴 지시: 새 worktree 자동 갱신).
    const savedCopies = snapshotCopiesFor(dataDir, slug);
    if (savedCopies && savedCopies.length === all.length && savedCopies.every((c, i) => c === all[i])) {
      const hit = snapshotFeatures(dataDir, slug, all);
      // 🔴 새 기능 폴더 감지 — 사본 구성이 같아도 `docs/features/` 아래에 **새 폴더**(untracked 로
      // 아직 커밋 안 된 기능 포함)가 생기면 스냅샷은 낡았다(INV-3). `sameStamps` 는 untracked 를
      // 보지 않으므로(15초 재스캔 지연 방지) 여기서 디스크 폴더 목록과 스냅샷 feature slug 를
      // 견줘, 다르면 스냅샷을 우회하고 다시 읽는다(실제 결함 2026-09-01: slider-widget-operator
      // worktree 에 spec.md 만 있는 command-field-authoring 폴더가 감지되지 않았다).
      if (hit && sameFeatureFolders(hit, all)) return hit;
    }
    const features = readFeatures([...all]);
    recordProjectScan(dataDir, { slug, path, copies: [...all] }, features);
    return features;
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
  const refreshInProgress = (project: string): void => {
    try {
      const scan = scanWorkingCopies(treehouse, project, projectCopiesFor(project));
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
        refreshInProgress(project);
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

  const inProgressFor = (project: string): CopyScan => {
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
        scan = scanWorkingCopies(treehouse, project, projectCopiesFor(project));
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
  const withInProgress = (project: string, features: Feature[]): Feature[] =>
    applyInProgress(features, inProgressFor(project)).features;

  /**
   * 백로그 상태 조인을 얹은 기능 목록 — `features` 탭과 **같은 판정 자리**(`applyBacklogStatus`)를
   * `plan`·`process` 탭에도 태운다(T04 후속, 캡틴 지시 2026-08-25). `tickets/T<NN>.md` 신관례
   * 티켓은 파일에 상태가 없다(SoT = 백로그) — 이 조인이 없으면 그 탭의 신관례 티켓은 영원히
   * "상태 줄 없음" 으로만 보인다. 홈 미설정·백로그 없음은 `readBacklogTasks` 가 빈 목록으로
   * 흡수한다 — 조인 실패는 상태 미표시로만 드러난다(`/api/features/:slug` 와 같은 원칙).
   */
  const withBacklogStatus = (project: string, features: Feature[]): Feature[] =>
    applyBacklogStatus(features, readBacklogTasks(readSettings(dataDir).firstmateHome), project);

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

  // ── 설정 (tauri-desktop-app T02) ────────────────────────────
  // GET /api/settings → SettingsResponse — 저장된 두 경로 + 응답 때 다시 본 존재 여부(INV-3).
  app.get("/api/settings", (c) => {
    try {
      return c.json(SettingsResponse.parse(settingsWithExists(readSettings(dataDir))));
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

  // PUT /api/settings → SettingsResponse — 사용자가 정한 값이 설정 저장소에 닿는 유일한 입구.
  // 🔴 존재하지 않는 경로도 **거절하지 않고 저장한다** — 저장 시점에 폴더가 아직 없을 수 있고,
  // 경고 표시는 응답의 `*Exists` 를 본다(화면 몫). 거절하는 것은 절대 경로가 아닌 입력뿐이다.
  app.put("/api/settings", zValidator("json", SettingsUpdateRequest), (c) => {
    const update = c.req.valid("json");
    const normalized: {
      firstmateHome?: string | null;
      watchRoots?: string[] | null;
      blockedCopies?: string[];
      autoClose?: boolean;
    } = {};
    for (const key of ["firstmateHome"] as const) {
      const raw = update[key];
      if (raw === undefined) continue;
      if (raw === null) {
        normalized[key] = null;
        continue;
      }
      try {
        normalized[key] = normalizeDirPath(raw);
      } catch (err) {
        return c.json({ error: planError(err) } satisfies ApiError, 400);
      }
    }
    if (update.watchRoots !== undefined) {
      if (update.watchRoots === null) {
        normalized.watchRoots = null; // unset → 파생 규칙으로 되돌아감
      } else {
        try {
          // 각 항목을 절대 경로로 정규화 — 상대 경로는 거절(400). 빈 배열은 "아무것도 안 보기".
          normalized.watchRoots = update.watchRoots.map((p) => normalizeDirPath(p));
        } catch (err) {
          return c.json({ error: planError(err) } satisfies ApiError, 400);
        }
      }
    }
    // 차단 목록은 경로가 아니라 `<풀>/<슬롯>` 식별자라 정규화하지 않고 그대로 둔다.
    if (update.blockedCopies !== undefined) normalized.blockedCopies = update.blockedCopies;
    // 자동 완료 — boolean 하나라 정규화할 것이 없다.
    if (update.autoClose !== undefined) normalized.autoClose = update.autoClose;
    try {
      writeSettings(dataDir, normalized);
      // firstmate 홈이 실제로 바뀌었다면 감시기에도 알린다 — 요청 경로(effectiveRoots) 만
      // 새 값이고 감시기가 낡은 뿌리를 보고 있으면 live 갱신이 어긋난다(INV-3). 문서 감시기와
      // 백로그 감시기 둘 다 이 하나의 통보로 다시 묶인다(server.ts 배선).
      if (update.firstmateHome !== undefined)
        options.onFirstmateHomeChange?.(readSettings(dataDir).firstmateHome);
      // 명시 감시 뿌리가 바뀌었으면 문서 감시기를 새 뿌리로 다시 묶는다(per-folder-watch-roots).
      if (update.watchRoots !== undefined)
        options.onWatchRootsChange?.(effectiveRoots());
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
    // 저장된 값을 다시 읽어 답한다 — 방금 쓴 값으로 응답을 조립하면 그것이 곧 파일의 2차 사본이다
    // (/move 와 같은 규율, INV-1·INV-3).
    try {
      return c.json(SettingsResponse.parse(settingsWithExists(readSettings(dataDir))));
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

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
  app.get("/api/projects", (c) => {
    // 🔴 세기 전에 백로그 조인을 얹는다 — 신관례(`tickets/T<NN>.md`) 티켓은 파일에 상태가
    // 없고(SoT = 백로그), 조인 없이는 전부 pending 으로 보여 백로그에서 다 끝난 기능까지
    // "남은 일 있음" 으로 셔진다(실제 결함, 2026-08-25 실측: firstmate 사이드바 2 → 실제 0).
    // features·plan 탭과 **같은 판정 자리**(`withBacklogStatus`)를 지난다.
    // 🔴 readFeatures 는 스냅샷 우선(fast-cold-start T03) — 재부팅 직후에도 git 없이 즉시.
    // 백로그 조인·카운트는 요청마다 다시 한다(INV-1 — 스냅샷에 담지 않는 파생물).
    const projects = getProjectsPayload(
      effectiveRoots(),
      () => {
        const backlog = readBacklogTasks(readSettings(dataDir).firstmateHome);
      return getProjects(effectiveRoots()).map((p) => ({
        ...p,
        openFeatures: countOpenFeatures(applyBacklogStatus(featuresFor(p.slug, p.copies, p.path), backlog, p.slug)),
      }));
    },
      readSettings(dataDir).firstmateHome ?? "",
    );
    return c.json(ProjectsResponse.parse({ projects }));
  });

  // GET /api/features/:slug → FeaturesResponse (docs/features/ 기능별 할일, INV-2 read-only)
  // 관리대상 문서를 읽는 경로는 이제 이것 하나뿐이다.
  // 막힘 해제는 요청마다 다시 계산된다(INV-1·INV-3).
  // 처리중은 **입력이 다르다** — 문서가 아니라 격리 사본 관측이다. 요청마다 다시 관측하고
  // 어디에도 저장하지 않는다. 티켓에 잇지 못한 작업은 `inProgress.unknown` 으로 드러난다.
  app.get("/api/features/:slug", zValidator("param", slugParam), (c) => {
    const { slug } = c.req.valid("param");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json(notFound(slug), 404);
    const project = basename(proj.path);
    const features = featuresFor(proj.slug, proj.copies, proj.path);
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
      filterBlockedCopies(scanWorkingCopies(treehouse, project, proj.copies)),
    );
    // T04 — `tickets/T<NN>.md` 신관례의 상태는 문서가 아니라 firstmate 홈 백로그가 SoT(D4).
    // 홈 미설정·백로그 없음은 readBacklogTasks 가 빈 목록으로 흡수 — 조인 실패는 상태 미표시로만 드러난다.
    const withBacklog = {
      ...observed,
      features: applyBacklogStatus(observed.features, readBacklogTasks(readSettings(dataDir).firstmateHome), project),
    };
    return c.json(FeaturesResponse.parse({ project, ...withBacklog }));
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
  app.get("/api/plan/:slug", zValidator("param", slugParam), (c) => {
    const { slug } = c.req.valid("param");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json(notFound(slug), 404);
    const project = basename(proj.path);
    try {
      const areas = readBoard(
        project,
        withBacklogStatus(
          project,
          withInProgress(project, withReadState(project, featuresFor(proj.slug, proj.copies, proj.path))),
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
    (c) => {
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
          withBacklogStatus(project, withInProgress(project, withReadState(project, features))),
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
    (c) => {
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
          withBacklogStatus(project, withInProgress(project, withReadState(project, features))),
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

  /** `bin/gootte` CLI 절대 경로 — 이 파일에서 ../.. 으로 코드 루트를 찾아 bin/ 으로. */
  const gootteBin = join(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", ".."), "bin", "gootte");

  /**
   * 그 사본에 티켓 파일이 실재하는가 — 신관례(`tickets/T<NN>.md`)와 구관례(`issues/<NN>-*.md`)
   * 둘 다 본다. `pickTimeTarget` 이 기록 대상을 고를 때, 그 사본에서 CLI 가 실제로 파일을 찾을 수
   * 있는지를 확인하기 위해 쓴다 — 파일이 없는 사본을 고르면 `gootte start` 가 "티켓 파일을 찾을 수
   * 없습니다" 로 죽는다(실제 결함 2026-09-01: fsm-coordination-docs worktree 에는 live-state-display
   * 가 없는데 시작 버튼이 그쪽을 골랐다).
   */
  const hasTicketFile = (copy: string, feature: string, ticket: string): boolean => {
    const num = ticket.replace(/^T/i, "");
    if (existsSync(join(copy, "docs", "features", feature, "tickets", `T${num}.md`))) return true;
    const issuesDir = join(copy, "docs", "features", feature, "issues");
    if (!existsSync(issuesDir)) return false;
    return readdirSync(issuesDir).some((f) => f.startsWith(num) && f.endsWith(".md"));
  };

  /**
   * ADR-0002: 대상 사본 선택 — 버튼으로 시간 기록할 때 어느 사본의 티켓 문서를 수정할지 정한다.
   * - `start` 이외: `started=` 가 이미 있는 사본 우선. 없으면 대표.
   * - `start`: working worktree 우선, 없으면 대표(copies[0]).
   */
  const pickTimeTarget = (proj: { copies: readonly string[]; path: string }, feature: string, ticket: string, action: string): string => {
    const allCopies = withWorktrees(proj.copies);
    if (action === "start") {
      // ADR-0002 §1 — 새 start 는 working 상태인 worktree 사본 우선(지금 그 일을 붙들고 있는
      // 사본에 이어 기록). 🔴 그 worktree 에 그 티켓 파일이 **실재할 때만** 고른다 — 파일이 없는
      // worktree(다른 기능 전용)를 고르면 CLI 가 파일을 못 찾아 죽는다(실제 결함 2026-09-01).
      // working worktree 여럿 중 티켓이 있는 것을, 없으면 아무 worktree 나, 그래도 없으면 대표.
      const worktrees = claudeWorktreeRoots(proj.copies);
      const workingWithTicket = worktrees.find((c) => currentBranch(c) && hasTicketFile(c, feature, ticket));
      if (workingWithTicket) return workingWithTicket;
      const withTicket = allCopies.find((c) => hasTicketFile(c, feature, ticket));
      if (withTicket) return withTicket;
      return proj.path;
    }
    for (const copy of allCopies) {
      // 신관례(tickets/T<NN>.md): 프론트가 보내는 t.num 은 "01" 꼴이므로 T<NN>.md 로 시도
      const newTicketFile = join(copy, "docs", "features", feature, "tickets", `T${ticket.replace(/^T/i, "")}.md`);
      if (existsSync(newTicketFile) && readFileSync(newTicketFile, "utf8").includes("started=")) return copy;
      // 구관례(issues/<NN>-*.md)
      const num = ticket.replace(/^T/i, "");
      const issuesDir = join(copy, "docs", "features", feature, "issues");
      if (existsSync(issuesDir)) {
        for (const f of readdirSync(issuesDir)) {
          if (f.startsWith(num) && f.endsWith(".md") && readFileSync(join(issuesDir, f), "utf8").includes("started=")) return copy;
        }
      }
    }
    return proj.path;
  };

  const TimeAction = z.object({ feature: z.string().min(1), ticket: z.string().min(1), action: z.enum(["start", "pause", "resume", "end"]) });

  app.post("/api/projects/:slug/time", zValidator("param", slugParam), zValidator("json", TimeAction), (c) => {
    const { slug } = c.req.valid("param");
    const { feature, ticket, action } = c.req.valid("json");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json(notFound(slug), 404);
    try {
      const target = pickTimeTarget(proj, feature, ticket, action);
      execFileSync(gootteBin, [action, feature, ticket], { cwd: target, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      // 🔴 CLI 가 티켓 파일(관리대상)에 Time 을 기록했으므로 **이 프로젝트만** 다시 읽어 스냅샷을
      // 갱신한다 — 스냅샷이 낡은 finished= 없는 상태를 그대로 서빙하면 완료/시작이 화면에 늦게
      // 보인다(INV-3 stale 뷰). 🔴 `clearSnapshot()`(전체 무효화) 은 쓰지 않는다 — 한 프로젝트의
      // 기록이 다른 프로젝트까지 전부 재스캔하게 만들면 문서 읽기 시간이 재발한다(실제 결함
      // 2026-09-01). worktree 의 미커밋 변경도 `sameStamps` 의 git status 검사가 15초 내에
      // 백그라운드로 잡으므로, 여기서는 당장 보여야 할 이 프로젝트만 고친다.
      const all = withWorktrees(proj.copies);
      recordProjectScan(dataDir, { slug, path: proj.path, copies: [...all] }, readFeatures([...all]));
      broadcast?.({ kind: "project", project: slug });
      return c.json({ ok: true });
    } catch (err) {
      return c.json({ error: `시간 기록 실패: ${err instanceof Error ? err.message : String(err)}` } satisfies ApiError, 500);
    }
  });

  // ── 메모 (memo-pad) — gootte 자기 저장소 CRUD ──────────
  // 관리대상(INV-2)이 아니라 `GOOTTE_DATA_DIR`/memos/<project>.json 에만 쓴다. 사람만 아는
  // 캡틴의 생각(INV-5)이라 저장할 자격이 있고, 화면이 이 API 로 추가·수정·삭제한다.
  // 🔴 시각은 요청마다의 `now()`(ISO 8601 UTC)로 찍는다 — `nowStamp`(판 완료용)와 다르다.

  // GET /api/memos/:slug → MemosResponse
  app.get("/api/memos/:slug", zValidator("param", slugParam), (c) => {
    const { slug } = c.req.valid("param");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json(notFound(slug), 404);
    try {
      return c.json(MemosResponse.parse({ project: slug, memos: readMemos(dataDir, slug) }));
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

  // POST /api/memos/:slug → Memo (새 메모 한 장 — 작성 순서대로 목록 뒤에 붙는다)
  app.post("/api/memos/:slug", zValidator("param", slugParam), zValidator("json", MemoWriteRequest), (c) => {
    const { slug } = c.req.valid("param");
    const body = c.req.valid("json");
    const proj = resolveSlug(effectiveRoots(), slug);
    if (!proj) return c.json(notFound(slug), 404);
    try {
      const memo = appendMemo(dataDir, slug, body, now());
      return c.json(Memo.parse(memo));
    } catch (err) {
      return c.json({ error: planError(err) } satisfies ApiError, 500);
    }
  });

  // PUT /api/memos/:slug/:id → Memo (한 장 고치기 — 내용만 바꾸고 수정 시각을 고친다)
  app.put(
    "/api/memos/:slug/:id",
    zValidator("param", slugParam.extend({ id: z.string().min(1) })),
    zValidator("json", MemoWriteRequest),
    (c) => {
      const { slug, id } = c.req.valid("param");
      const body = c.req.valid("json");
      const proj = resolveSlug(effectiveRoots(), slug);
      if (!proj) return c.json(notFound(slug), 404);
      try {
        const memo = updateMemo(dataDir, slug, id, body, now());
        if (!memo) return c.json({ error: `메모 없음: ${id}` } satisfies ApiError, 404);
        return c.json(Memo.parse(memo));
      } catch (err) {
        return c.json({ error: planError(err) } satisfies ApiError, 500);
      }
    },
  );

  // DELETE /api/memos/:slug/:id → MemoDeleteResponse
  app.delete(
    "/api/memos/:slug/:id",
    zValidator("param", slugParam.extend({ id: z.string().min(1) })),
    (c) => {
      const { slug, id } = c.req.valid("param");
      const proj = resolveSlug(effectiveRoots(), slug);
      if (!proj) return c.json(notFound(slug), 404);
      try {
        if (!deleteMemo(dataDir, slug, id)) {
          return c.json({ error: `메모 없음: ${id}` } satisfies ApiError, 404);
        }
        return c.json(MemoDeleteResponse.parse({ ok: true }));
      } catch (err) {
        return c.json({ error: planError(err) } satisfies ApiError, 500);
      }
    },
  );

  return app;
}

/**
 * 캐치올 fallback — server.ts 가 `/api/live`(WS) 등록 *후* 마지막에 마운트(순서상 `*` 가 WS 라우트를 삼키지 않게).
 * 정적 frontend 서빙(Phase 5)은 여기서 확장.
 */
export function mountFallback(app: Hono): void {
  app.get("*", (c) => c.text("gootte backend — frontend 미빌드 (web-dashboard 2a T2+)", 200));
}
