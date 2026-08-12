import { basename } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanBoardResponse,
  type ApiError,
} from "@gootte/contract";
import { applyInProgress, countOpenFeatures, splitIntoAreas } from "@gootte/core";
import {
  readFeatures,
  readFeatureDoc,
  readPlacements,
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
}

/**
 * Hono 앱 팩토리 — CORE projections 를 CONTRACT envelope 로 서빙(INV-4 릴레이).
 * backend 는 read-only(INV-2): core-io read + core 순수 계산만, write 없음.
 */
export function createApp(options: AppOptions = {}): Hono {
  const roots = options.roots ?? defaultRoots();
  const treehouse = options.treehouse ?? treehouseRoot();
  const dataDir = options.dataDir ?? planDataDir();
  const app = new Hono();

  const notFound = (slug: string): ApiError => ({ error: `프로젝트 없음: ${slug}` });

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
  // 🔴 이 라우트는 **아무것도 쓰지 않는다** — 관리대상에도(INV-2), 계획 DB 에도. 문서를 새로 써도
  // 등록 절차가 없으므로(INV-B1) 그 기능은 자리 행이 없는 채로 곧장 대기 칸에 나타난다.
  app.get("/api/plan/:slug", zValidator("param", slugParam), (c) => {
    const { slug } = c.req.valid("param");
    const proj = resolveSlug(roots, slug);
    if (!proj) return c.json(notFound(slug), 404);
    const project = basename(proj.path);
    let areas: ReturnType<typeof splitIntoAreas>;
    try {
      areas = splitIntoAreas(readFeatures(proj.path), readPlacements(dataDir, project));
    } catch (err) {
      // 계획 DB 를 못 읽는 것은 빈 판이 아니다 — 빈 판으로 그리면 화면이 "아무 계획도 없다" 고
      // 거짓말한다. 무엇이 막혔는지 그대로 올린다.
      return c.json({ error: err instanceof Error ? err.message : String(err) } satisfies ApiError, 500);
    }
    return c.json(PlanBoardResponse.parse({ project, ...areas }));
  });

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
