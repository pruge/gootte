import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ProjectsResponse,
  PlanResponse,
  LineageResponse,
  type ApiError,
} from "@gootte/contract";
import { buildPlan } from "@gootte/core";
import { loadProjectState } from "@gootte/core-io";
import { getProjects, resolveSlug } from "./discover-cache";

/** env `GOOTTE_ROOTS`(콜론 구분) → discover 루트. 기본 `~/Documents`. */
export function defaultRoots(): string[] {
  const env = process.env.GOOTTE_ROOTS?.trim();
  if (env) return env.split(":").filter(Boolean);
  return [join(homedir(), "Documents")];
}

const slugParam = z.object({ slug: z.string().min(1) });

export interface AppOptions {
  /** discover 루트 (테스트 주입). 없으면 defaultRoots(). */
  roots?: string[];
}

/**
 * Hono 앱 팩토리 — CORE projections 를 CONTRACT envelope 로 서빙(INV-4 릴레이).
 * backend 는 read-only(INV-2): core-io read + core 순수 계산만, write 없음.
 */
export function createApp(options: AppOptions = {}): Hono {
  const roots = options.roots ?? defaultRoots();
  const app = new Hono();

  // GET /api/projects → ProjectsResponse (discover, W2 캐시)
  app.get("/api/projects", (c) => {
    const projects = getProjects(roots);
    return c.json(ProjectsResponse.parse({ projects }));
  });

  // GET /api/plan/:slug → PlanResponse (loadProjectState → buildPlan)
  app.get("/api/plan/:slug", zValidator("param", slugParam), (c) => {
    const { slug } = c.req.valid("param");
    const proj = resolveSlug(roots, slug);
    if (!proj) return c.json<ApiError>({ error: `프로젝트 없음: ${slug}` }, 404);
    const { state, gitSignals } = loadProjectState(proj.path);
    const { plan, rationale } = buildPlan({ state, gitSignals });
    return c.json(PlanResponse.parse({ project: basename(proj.path), plan, rationale }));
  });

  // GET /api/lineage/:slug → LineageResponse (edges = CORE 해소, drops verbatim)
  app.get("/api/lineage/:slug", zValidator("param", slugParam), (c) => {
    const { slug } = c.req.valid("param");
    const proj = resolveSlug(roots, slug);
    if (!proj) return c.json<ApiError>({ error: `프로젝트 없음: ${slug}` }, 404);
    const { state } = loadProjectState(proj.path);
    return c.json(
      LineageResponse.parse({
        project: basename(proj.path),
        edges: state.lineage.edges,
        drops: state.drops,
      }),
    );
  });

  // 정적 frontend 서빙(Phase 5) — frontend(2a T2+) 빌드 전이라 no-op 가드.
  // frontend dist 생기면 serveStatic 으로 교체(009/010).
  app.get("*", (c) => c.text("gootte backend — frontend 미빌드 (web-dashboard 2a T2+)", 200));

  return app;
}
