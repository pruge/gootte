import { homedir } from "node:os";
import { basename, join } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ProjectsResponse,
  PlanResponse,
  LineageResponse,
  BoardResponse,
  TimelineResponse,
  WorktreeResponse,
  type ApiError,
  type WorktreeStatus,
  type GitSignal,
} from "@gootte/contract";
import { buildPlan, buildKanban, buildGantt } from "@gootte/core";
import { loadProjectState, type LoadedProject } from "@gootte/core-io";
import { getProjects, resolveSlug } from "./discover-cache";

/** env `GOOTTE_ROOTS`(콜론 구분) → discover 루트. 기본 `~/Documents`. */
export function defaultRoots(): string[] {
  const env = process.env.GOOTTE_ROOTS?.trim();
  if (env) return env.split(":").filter(Boolean);
  return [join(homedir(), "Documents")];
}

const slugParam = z.object({ slug: z.string().min(1) });
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
    const { plan, rationale } = buildPlan({ state: p.state, gitSignals: p.gitSignals });
    return c.json(PlanResponse.parse({ project: p.name, plan, rationale }));
  });

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
    const { rows, from, to } = buildGantt(p.state);
    return c.json(TimelineResponse.parse({ project: p.name, from, to, rows }));
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
