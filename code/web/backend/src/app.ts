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
  type ApiError,
  type Feature,
} from "@gootte/contract";
import {
  applyInProgress,
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
  readSteps,
  writePlanMove,
  writeStep,
  scanWorkingCopies,
  defaultPlanDataDir,
  defaultProjectRoots,
  defaultTreehouseRoot,
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
 * 쓰기는 gootte 자기 계획 저장소(`plan.db`)에만 있고 둘뿐이다: 캡틴이 옮길 때(03)와
 * 상자가 전부 채워진 기능을 처음 볼 때(04, `planAutoClose`).
 */
export function createApp(options: AppOptions = {}): Hono {
  const roots = options.roots ?? defaultRoots();
  const treehouse = options.treehouse ?? treehouseRoot();
  const dataDir = options.dataDir ?? planDataDir();
  const now = options.now ?? (() => nowStamp());
  const app = new Hono();

  const notFound = (slug: string): ApiError => ({ error: `프로젝트 없음: ${slug}` });

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

  // GET /api/projects → ProjectsResponse (discover, W2 캐시).
  // 🔴 남은 일이 있는 기능 수는 **캐시하지 않는다** — 발견 결과와 달리 문서가 바뀔 때마다 변하는
  // 파생물이라 요청마다 다시 읽고 다시 센다(INV-1·INV-3). 문서 read 뿐이라 git 을 부르지 않는다.
  app.get("/api/projects", (c) => {
    const projects = getProjects(roots).map((p) => ({
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
    const proj = resolveSlug(roots, slug);
    if (!proj) return c.json(notFound(slug), 404);
    const project = basename(proj.path);
    const observed = applyInProgress(
      readFeatures(proj.path),
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
    const proj = resolveSlug(roots, slug);
    if (!proj) return c.json(notFound(slug), 404);
    const project = basename(proj.path);
    try {
      const areas = readBoard(project, readFeatures(proj.path));
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
      const proj = resolveSlug(roots, slug);
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
        const areas = readBoard(project, features);
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
      const proj = resolveSlug(roots, slug);
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
        const areas = readBoard(project, features);
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
      const proj = resolveSlug(roots, slug);
      if (!proj) return c.json(notFound(slug), 404);
      const result = readFeatureDoc(proj.path, feature, path);
      if (!result.ok) {
        const error: ApiError =
          result.reason === "outside"
            ? { error: "기능 폴더 밖의 경로는 읽을 수 없습니다" }
            : { error: `문서를 찾을 수 없습니다: ${path}` };
        return c.json(error, result.reason === "outside" ? 400 : 404);
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
