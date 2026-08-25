import { basename } from "node:path";
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
  type ApiError,
  type Feature,
  type Settings,
} from "@gootte/contract";
import {
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
  readPlacements,
  readPlacementsWithAutoClose,
  readReadMarks,
  readSteps,
  writePlanMove,
  writeStep,
  ensureReadSeed,
  markDocRead,
  scanWorkingCopies,
  defaultPlanDataDir,
  defaultProjectRoots,
  defaultTreehouseRoot,
  readSettings,
  writeSettings,
  normalizeDirPath,
  dirExists,
} from "@gootte/core-io";
import { getProjects, resolveSlug } from "./discover-cache";

/** env `GOOTTE_ROOTS`(콜론 구분) → discover 루트. 기본 `~/Documents/ai2/projects`. */
export function defaultRoots(): string[] {
  const env = process.env.GOOTTE_ROOTS?.trim();
  if (env) return env.split(":").filter(Boolean);
  return defaultProjectRoots();
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
   * 감시 루트 설정이 바뀐 뒤의 통보(tauri-desktop-app T02) — server.ts 가 문서 감시기를 새
   * 뿌리로 다시 묶는 데 쓴다(INV-3: 감시기도 설정값을 따라간다). 값은 저장 뒤 다시 읽은 것.
   */
  onWatchRootChange?: (watchRoot: string | null) => void;
  /**
   * firstmate 홈 설정이 바뀐 뒤의 통보(tauri-desktop-app T03) — 백로그 감시기가 새 홈을
   * 보도록 재묶는 데 쓴다. 문서 감시기 재묶음(T02)과 같은 INV-3 근거다.
   */
  onFirstmateHomeChange?: (firstmateHome: string | null) => void;
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
  const app = new Hono();

  /**
   * 지금 이 요청이 볼 discover 루트 — 설정값이 기본값을 이긴다(tauri-desktop-app T02).
   * 🔴 생성 시 한 번 얼려 두지 않고 **요청마다 다시 읽는다**(INV-3) — 설정을 바꾸면 다음
   * 요청부터 곧장 새 루트가 보여야 하고, 재시작 없이 적용된다는 것이 그래서 참이 된다.
   * 파일 read 하나라 매 요청에 감당 가능하다. 미설정(null)이면 env·플랫폼 기본값으로 떨어진다.
   */
  const effectiveRoots = (): string[] => {
    try {
      const watchRoot = readSettings(dataDir).watchRoot;
      if (watchRoot) return [watchRoot];
    } catch {
      // 설정 파일을 못 읽는 것은 기본값으로 떨어질 이유가 아니라 알릴 사실이다 — 아래
      // /api/settings 가 같은 자리를 읽으며 큰 소리로 낸다. 여기선 서비스 연속성을 택한다.
    }
    return fallbackRoots;
  };

  /** 설정 + 응답 시점에 다시 본 존재 여부(INV-3 — 존재는 저장하지 않는다). */
  const settingsWithExists = (s: Settings): SettingsResponse => ({
    ...s,
    watchRootExists: dirExists(s.watchRoot),
    firstmateHomeExists: dirExists(s.firstmateHome),
  });

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
    applyInProgress(features, scanWorkingCopies(treehouse, project)).features;

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
    const normalized: { watchRoot?: string | null; firstmateHome?: string | null } = {};
    for (const key of ["watchRoot", "firstmateHome"] as const) {
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
    try {
      writeSettings(dataDir, normalized);
      // 감시 루트·firstmate 환이 실제로 바뀌었다면 감시기에도 알린다 — 요청 경로(effectiveRoots)
      // 만 새 값이고 감시기가 낡은 뿌리를 보고 있으면 live 갱신이 어긋난다(INV-3).
      if (update.watchRoot !== undefined) options.onWatchRootChange?.(readSettings(dataDir).watchRoot);
      if (update.firstmateHome !== undefined)
        options.onFirstmateHomeChange?.(readSettings(dataDir).firstmateHome);
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

  // GET /api/projects → ProjectsResponse (discover, W2 캐시).
  // 🔴 남은 일이 있는 기능 수는 **캐시하지 않는다** — 발견 결과와 달리 문서가 바뀔 때마다 변하는
  // 파생물이라 요청마다 다시 읽고 다시 센다(INV-1·INV-3). 문서 read 뿐이라 git 을 부르지 않는다.
  app.get("/api/projects", (c) => {
    const projects = getProjects(effectiveRoots()).map((p) => ({
      ...p,
      openFeatures: countOpenFeatures(readFeatures(p.path)),
    }));
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
    const features = readFeatures(proj.path);
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
      scanWorkingCopies(treehouse, project),
    );
    return c.json(FeaturesResponse.parse({ project, ...observed }));
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
      const areas = readBoard(project, withInProgress(project, withReadState(project, readFeatures(proj.path))));
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
        const features = readFeatures(proj.path);
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
        const areas = readBoard(project, withInProgress(project, withReadState(project, features)));
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
        const features = readFeatures(proj.path);
        const f = features.find((x) => x.slug === feature);
        if (!f) return c.json({ error: `문서가 없는 기능입니다: ${feature}` } satisfies ApiError, 400);
        if (!f.tickets.some((t) => t.slug === ticket)) {
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
        const areas = readBoard(project, withInProgress(project, withReadState(project, features)));
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
      const result = readFeatureDoc(proj.path, feature, path);
      if (!result.ok) {
        const error: ApiError =
          result.reason === "outside"
            ? { error: "기능 폴더 밖의 경로는 읽을 수 없습니다" }
            : { error: `문서를 찾을 수 없습니다: ${path}` };
        return c.json(error, result.reason === "outside" ? 400 : 404);
      }
      // 티켓 원문을 열면 읽음이 된다(unread-tickets-show-themselves/01) — 세 탭 어디서 열었든
      // 이 자리 하나로 모인다(spec F1·F2). 표시는 티켓에만 붙으므로(캡틴 결정 ②) `issues/` 바깥의
      // 명세·결정 기록은 조용히 넘어간다 — 경로 모양만 보고 판정한다(INV-4, 문서를 다시 안 읽는다).
      if (path.startsWith("issues/")) {
        markDocRead(dataDir, basename(proj.path), feature, path);
      }
      return c.json(FeatureDocResponse.parse({ path, content: result.content }));
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
