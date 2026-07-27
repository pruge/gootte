import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ProjectsResponse,
  PlanResponse,
  RoadmapResponse,
  LineageResponse,
  BoardResponse,
  TimelineResponse,
  WorktreeResponse,
  DocResponse,
  type ApiError,
  type WorktreeStatus,
  type GitSignal,
} from "@gootte/contract";
import { buildPlan, buildRoadmap, buildKanban, buildGantt } from "@gootte/core";
import { loadProjectState, readDoc, type LoadedProject } from "@gootte/core-io";
import { getProjects, resolveSlug } from "./discover-cache";

/** env `GOOTTE_ROOTS`(콜론 구분) → discover 루트. 기본 `~/Documents`. */
export function defaultRoots(): string[] {
  const env = process.env.GOOTTE_ROOTS?.trim();
  if (env) return env.split(":").filter(Boolean);
  return [join(homedir(), "Documents")];
}

const slugParam = z.object({ slug: z.string().min(1) });
const docParam = z.object({
  slug: z.string().min(1),
  kind: z.enum(["todo", "sprint"]),
  name: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9._-]+$/), // slug 만 — 경로 traversal 차단
});
const docQuery = z.object({
  worktree: z
    .string()
    .regex(/^[A-Za-z0-9._-]+$/)
    .optional(), // worktree 트리에서 읽기 (활성 sprint 라이브 버전)
});
const NO_SIGNAL: GitSignal = { mainCommitsSince: 0, overlapFiles: [], conflictRisk: "low" };

/** 활성 worktree → WorktreeStatus[] (구조적, ADR-0004 — 산문 파싱 X). */
function worktreeStatuses(loaded: LoadedProject): WorktreeStatus[] {
  const { state, gitSignals } = loaded;
  const out: WorktreeStatus[] = [];
  for (const i of state.initiatives) {
    if (!i.worktree) continue;
    out.push({
      slug: i.worktree.slug,
      branch: i.worktree.branch,
      base: i.worktree.base,
      initiative: i.slug,
      sprint: state.sprints.find((s) => s.worktree === i.worktree!.slug)?.slug ?? null,
      signal: gitSignals.get(i.slug) ?? NO_SIGNAL,
    });
  }
  return out;
}

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

  // slug → {name, state, gitSignals} 해소(미해소 null). 5 라우트 공유(DRY).
  const load = (slug: string): (LoadedProject & { name: string }) | null => {
    const proj = resolveSlug(roots, slug);
    return proj ? { name: basename(proj.path), ...loadProjectState(proj.path) } : null;
  };
  const notFound = (slug: string): ApiError => ({ error: `프로젝트 없음: ${slug}` });

  // GET /api/projects → ProjectsResponse (discover, W2 캐시)
  app.get("/api/projects", (c) => c.json(ProjectsResponse.parse({ projects: getProjects(roots) })));

  // GET /api/plan/:slug → PlanResponse
  app.get("/api/plan/:slug", zValidator("param", slugParam), (c) => {
    const p = load(c.req.valid("param").slug);
    if (!p) return c.json(notFound(c.req.param("slug")), 404);
    const { plan, rationale, trackOrder } = buildPlan({ state: p.state, gitSignals: p.gitSignals });
    return c.json(PlanResponse.parse({ project: p.name, plan, rationale, trackOrder }));
  });

  // GET /api/roadmap/:slug → RoadmapResponse (완료 포함 roadmap + 할일 체크리스트, 018)
  app.get("/api/roadmap/:slug", zValidator("param", slugParam), (c) => {
    const p = load(c.req.valid("param").slug);
    if (!p) return c.json(notFound(c.req.param("slug")), 404);
    const { items, trackOrder } = buildRoadmap(p.state);
    return c.json(RoadmapResponse.parse({ project: p.name, items, trackOrder }));
  });

  // GET /api/doc/:slug/:kind/:name[?worktree=] → DocResponse (관리대상 todo/sprint raw md, INV-2 read-only)
  // worktree 지정 시 그 worktree 트리 우선(활성 sprint 의 미커밋 라이브 버전 — `## 사용자 테스트` 등).
  app.get(
    "/api/doc/:slug/:kind/:name",
    zValidator("param", docParam),
    zValidator("query", docQuery),
    (c) => {
      const { slug, kind, name } = c.req.valid("param");
      const { worktree } = c.req.valid("query");
      const proj = resolveSlug(roots, slug);
      if (!proj) return c.json(notFound(slug), 404);
      const doc = readDoc(proj.path, kind, name, worktree);
      if (!doc) return c.json({ error: `문서 없음: ${kind}/${name}` } satisfies ApiError, 404);
      return c.json(DocResponse.parse({ project: basename(proj.path), ...doc }));
    },
  );

  // GET /api/lineage/:slug → LineageResponse (nodes + edges = CORE 해소, drops verbatim)
  app.get("/api/lineage/:slug", zValidator("param", slugParam), (c) => {
    const p = load(c.req.valid("param").slug);
    if (!p) return c.json(notFound(c.req.param("slug")), 404);
    return c.json(
      LineageResponse.parse({
        project: p.name,
        nodes: p.state.lineage.nodes,
        edges: p.state.lineage.edges,
        drops: p.state.drops,
      }),
    );
  });

  // GET /api/board/:slug → BoardResponse (buildKanban 3 파티션)
  app.get("/api/board/:slug", zValidator("param", slugParam), (c) => {
    const p = load(c.req.valid("param").slug);
    if (!p) return c.json(notFound(c.req.param("slug")), 404);
    return c.json(BoardResponse.parse({ project: p.name, columns: buildKanban(p.state, p.gitSignals) }));
  });

  // GET /api/timeline/:slug → TimelineResponse (buildGantt — sprint 바 날짜축)
  app.get("/api/timeline/:slug", zValidator("param", slugParam), (c) => {
    const p = load(c.req.valid("param").slug);
    if (!p) return c.json(notFound(c.req.param("slug")), 404);
    const { rows, from, to, trackOrder } = buildGantt(p.state);
    return c.json(TimelineResponse.parse({ project: p.name, from, to, rows, trackOrder }));
  });

  // GET /api/worktree/:slug → WorktreeResponse (구조적 상태, ADR-0004)
  app.get("/api/worktree/:slug", zValidator("param", slugParam), (c) => {
    const p = load(c.req.valid("param").slug);
    if (!p) return c.json(notFound(c.req.param("slug")), 404);
    return c.json(WorktreeResponse.parse({ project: p.name, worktrees: worktreeStatuses(p) }));
  });

  // 정적 frontend 서빙(Phase 5) — frontend(2a T2+) 빌드 전이라 no-op 가드.
  app.get("*", (c) => c.text("gootte backend — frontend 미빌드 (web-dashboard 2a T2+)", 200));

  return app;
}
