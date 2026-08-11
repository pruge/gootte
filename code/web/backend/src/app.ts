import { basename } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanResponse,
  DragResult,
  OpinionRequest,
  type ApiError,
  type DragWarning,
} from "@gootte/contract";
import {
  applyInProgress,
  checkTicketDragWarnings,
  computeNext,
  countOpenFeatures,
  detectOpinionTriggers,
  formatPlanSnapshot,
} from "@gootte/core";
import {
  readFeatures,
  readFeatureDoc,
  readPlanOrder,
  scanWorkingCopies,
  defaultPlanDataDir,
  defaultProjectRoots,
  defaultTreehouseRoot,
  moveTicketStep,
  insertTicketStep,
  moveFeatureOrder,
  addOpinionRequest,
  listOpinionRequests,
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
const ticketStepBody = z.object({ feature: z.string().min(1), ticket: z.string().min(1), step: z.number().int() });
const insertTicketStepBody = z.object({
  feature: z.string().min(1),
  ticket: z.string().min(1),
  afterStep: z.number().int(),
});
const featureRankBody = z.object({
  feature: z.string().min(1),
  track: z.string().min(1),
  beforeRank: z.number().nullable(),
  afterRank: z.number().nullable(),
});
const askRequestBody = z.object({ detail: z.string().min(1) });
export interface AppOptions {
  /** discover 루트 (테스트 주입). 없으면 defaultRoots(). */
  roots?: string[];
  /** 격리 사본 뿌리 (테스트 주입). 없으면 treehouseRoot(). */
  treehouse?: string;
  /** 계획 저장소 경로 (테스트 주입). 없으면 planDataDir(). */
  dataDir?: string;
  /**
   * 드래그 쓰기가 성공할 때마다 불린다(development-order/07) — `server.ts`가 여기 연결해
   * `hub.broadcast({ kind: "project", project })`로 WS push한다. app.ts 는 `LiveHub`를 모른다
   * (테스트 용이성 — 기본은 no-op).
   */
  onPlanChange?: (project: string) => void;
}

/**
 * Hono 앱 팩토리 — CORE projections 를 CONTRACT envelope 로 서빙(INV-4 릴레이).
 * backend 는 read-only(INV-2): core-io read + core 순수 계산만, write 없음.
 */
export function createApp(options: AppOptions = {}): Hono {
  const roots = options.roots ?? defaultRoots();
  const treehouse = options.treehouse ?? treehouseRoot();
  const dataDir = options.dataDir ?? planDataDir();
  const onPlanChange = options.onPlanChange ?? (() => {});
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

  // GET /api/plan/:slug → PlanResponse (티켓 03 — `plan` 탭). 계획(gootte 자기 저장소, INV-5)과
  // 티켓 문서(INV-2 read-only, 매 요청 재계산)를 함께 싣고, `next`·어긋남은 02 의 순수 함수 하나로
  // 계산한다 — 화면과 CLI(`gootte next`)가 같은 함수를 쓴다(spec §판정 자리는 하나뿐).
  // `askTriggers` 는 06 의 순수 함수가 매 요청 계산(INV-1) — 버튼이 뜰 자리일 뿐 저장하지 않는다.
  // `askRequests` 는 처리·미처리 가리지 않고 함께 싣는다 — 답이 그 배치 옆에 계속 붙어 있어야 한다.
  app.get("/api/plan/:slug", zValidator("param", slugParam), (c) => {
    const { slug } = c.req.valid("param");
    const proj = resolveSlug(roots, slug);
    if (!proj) return c.json(notFound(slug), 404);
    const project = basename(proj.path);
    const features = readFeatures(proj.path);
    const order = readPlanOrder(dataDir, project);
    const next = computeNext(features, order.features, order.tickets);
    const askTriggers = detectOpinionTriggers(order);
    const askRequests = listOpinionRequests(dataDir, { project, all: true });
    return c.json(PlanResponse.parse({ project, features, order, next, askTriggers, askRequests }));
  });

  /**
   * 티켓 06 — 캡틴이 [의견 물어보기] 를 누른다. gootte 의 두 번째 쓰기 경로 — `opinion_request` 한 줄만
   * 남긴다(채팅창이 아니다). 배치 요약은 **이 순간의** `order` 를 스냅샷한다(spec 06 §표).
   * 답은 planner 가 CLI(`ask answer`)로 적는다 — 이 라우트는 요청을 남기는 쪽만 갖는다.
   */
  app.post(
    "/api/plan/:slug/ask",
    zValidator("param", slugParam),
    zValidator("json", askRequestBody),
    (c) => {
      const { slug } = c.req.valid("param");
      const proj = resolveSlug(roots, slug);
      if (!proj) return c.json(notFound(slug), 404);
      const project = basename(proj.path);
      const { detail } = c.req.valid("json");
      const order = readPlanOrder(dataDir, project);
      const entry = addOpinionRequest(dataDir, {
        project,
        batchSummary: formatPlanSnapshot(order),
        question: detail,
      });
      onPlanChange(project);
      return c.json(OpinionRequest.parse(entry));
    },
  );

  /**
   * 티켓 04 — 캡틴이 `plan` 탭에서 끌어서 순서를 바꾼다. gootte 의 첫 쓰기 경로(INV-2 §예외조차
   * 안 쓴다) — 쓰기는 오직 `dataDir`(gootte 자기 SQLite) 로만 간다. 관리대상 문서는 `readFeatures`
   * 로 읽기만 한다. 네 검사는 즉시 계산해 응답에 얹되(`checkTicketDragWarnings`), 드래그 자체는
   * 막지 않는다(spec 04 §놓는 순간, §검사가 드래그를 막지 않는다).
   */
  function ticketDragResponse(projectPath: string, project: string, feature: string, ticket: string, newStep: number) {
    const features = readFeatures(projectPath);
    const order = readPlanOrder(dataDir, project);
    const doc = features.find((f) => f.slug === feature)?.tickets.find((t) => t.num === ticket);
    const warnings: DragWarning[] = doc
      ? checkTicketDragWarnings(doc, feature, newStep, order.tickets)
      : [];
    return DragResult.parse({ order, warnings });
  }

  app.post(
    "/api/plan/:slug/ticket-step",
    zValidator("param", slugParam),
    zValidator("json", ticketStepBody),
    (c) => {
      const { slug } = c.req.valid("param");
      const proj = resolveSlug(roots, slug);
      if (!proj) return c.json(notFound(slug), 404);
      const project = basename(proj.path);
      const { feature, ticket, step } = c.req.valid("json");
      try {
        moveTicketStep(dataDir, { project, feature, ticket, step });
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) } satisfies ApiError, 400);
      }
      onPlanChange(project);
      return c.json(ticketDragResponse(proj.path, project, feature, ticket, step));
    },
  );

  app.post(
    "/api/plan/:slug/ticket-step/insert",
    zValidator("param", slugParam),
    zValidator("json", insertTicketStepBody),
    (c) => {
      const { slug } = c.req.valid("param");
      const proj = resolveSlug(roots, slug);
      if (!proj) return c.json(notFound(slug), 404);
      const project = basename(proj.path);
      const { feature, ticket, afterStep } = c.req.valid("json");
      let newStep: number;
      try {
        newStep = insertTicketStep(dataDir, { project, feature, ticket, afterStep }).step;
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) } satisfies ApiError, 400);
      }
      onPlanChange(project);
      return c.json(ticketDragResponse(proj.path, project, feature, ticket, newStep));
    },
  );

  app.post(
    "/api/plan/:slug/feature-rank",
    zValidator("param", slugParam),
    zValidator("json", featureRankBody),
    (c) => {
      const { slug } = c.req.valid("param");
      const proj = resolveSlug(roots, slug);
      if (!proj) return c.json(notFound(slug), 404);
      const project = basename(proj.path);
      const { feature, track, beforeRank, afterRank } = c.req.valid("json");
      try {
        moveFeatureOrder(dataDir, { project, feature, track, beforeRank, afterRank });
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) } satisfies ApiError, 400);
      }
      onPlanChange(project);
      const order = readPlanOrder(dataDir, project);
      return c.json(DragResult.parse({ order, warnings: [] }));
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
