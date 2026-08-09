import { basename } from "node:path";
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  ProjectsResponse,
  PlanResponse,
  RoadmapResponse,
  LineageResponse,
  StructureResponse,
  TimelineResponse,
  WorktreeResponse,
  DocResponse,
  TreeResponse,
  type ApiError,
} from "@gootte/contract";
import { buildPlan, buildRoadmap, buildStructure, buildGantt } from "@gootte/core";
import {
  loadProjectState,
  readDoc,
  readRoadmapDoc,
  listInitiativeTree,
  resolveInitiativeDir,
  scanWorktrees,
  readMermaidDocs,
  activeWorktrees,
  defaultProjectRoots,
  type LoadedProject,
} from "@gootte/core-io";
import { getProjects, resolveSlug } from "./discover-cache";

/** env `GOOTTE_ROOTS`(콜론 구분) → discover 루트. 기본 `~/Documents/ai2/projects`. */
export function defaultRoots(): string[] {
  const env = process.env.GOOTTE_ROOTS?.trim();
  if (env) return env.split(":").filter(Boolean);
  return defaultProjectRoots();
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
// 문서 브라우저(2e) — initiative slug 만(traversal 차단). relPath 는 서브폴더 허용(charset 검증 + readRoadmapDoc realpath 가드).
const treeParam = z.object({
  slug: z.string().min(1),
  initiative: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9._-]+$/),
});
const roadmapDocQuery = z.object({
  path: z
    .string()
    .min(1)
    .regex(/^[A-Za-z0-9._/-]+$/), // 서브경로 허용 — 실제 traversal 가드는 readRoadmapDoc realpath
});
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
  const load = (slug: string): (LoadedProject & { name: string; repoPath: string }) | null => {
    const proj = resolveSlug(roots, slug);
    return proj
      ? { name: basename(proj.path), repoPath: proj.path, ...loadProjectState(proj.path) }
      : null;
  };
  const notFound = (slug: string): ApiError => ({ error: `프로젝트 없음: ${slug}` });

  // GET /api/projects → ProjectsResponse (discover, W2 캐시). worktrees 수는 요청마다 fresh(INV-3).
  // 배지 수 = scanWorktrees(raw) length — activeWorktrees(본문)의 state.worktrees 가 이 스캔과 1:1 이라 항상 동일 소스·동수(033).
  // (목록 뷰는 프로젝트별 full parse 를 피해 가벼운 raw 스캔 유지 — 바인딩은 개수를 바꾸지 않음.)
  app.get("/api/projects", (c) => {
    const projects = getProjects(roots).map((p) => ({
      ...p,
      worktrees: scanWorktrees(p.path).length,
    }));
    return c.json(ProjectsResponse.parse({ projects }));
  });

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

  // GET /api/tree/:slug/:initiative → TreeResponse (이니셔티브 폴더 파일 + 가상 todo/, 문서 브라우저 2e). INV-2/4.
  app.get("/api/tree/:slug/:initiative", zValidator("param", treeParam), (c) => {
    const { slug, initiative } = c.req.valid("param");
    const proj = resolveSlug(roots, slug);
    if (!proj) return c.json(notFound(slug), 404);
    const { state } = loadProjectState(proj.path);
    const item = buildRoadmap(state).items.find((i) => i.initiative === initiative) ?? null;
    // 폴더도 없고 roadmap item 도 없으면 미존재 이니셔티브.
    if (!item && !resolveInitiativeDir(proj.path, initiative))
      return c.json({ error: `이니셔티브 없음: ${initiative}` } satisfies ApiError, 404);
    const nodes = listInitiativeTree(proj.path, initiative, item);
    return c.json(TreeResponse.parse({ project: basename(proj.path), initiative, nodes }));
  });

  // GET /api/roadmap-doc/:slug/:initiative?path=<relPath> → DocResponse (roadmap 폴더 파일, realpath 가드). INV-2.
  // 🔴 별도 경로(`/api/doc/...` 아님) — generic doc 라우트(:kind enum)와의 충돌 회피.
  app.get(
    "/api/roadmap-doc/:slug/:initiative",
    zValidator("param", treeParam),
    zValidator("query", roadmapDocQuery),
    (c) => {
      const { slug, initiative } = c.req.valid("param");
      const { path } = c.req.valid("query");
      const proj = resolveSlug(roots, slug);
      if (!proj) return c.json(notFound(slug), 404);
      const doc = readRoadmapDoc(proj.path, initiative, path);
      if (!doc) return c.json({ error: `문서 없음: ${initiative}/${path}` } satisfies ApiError, 404);
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

  // GET /api/structure/:slug → StructureResponse (저작 docs/mermaid 렌더 — web-structure)
  app.get("/api/structure/:slug", zValidator("param", slugParam), (c) => {
    const p = load(c.req.valid("param").slug);
    if (!p) return c.json(notFound(c.req.param("slug")), 404);
    // INV-2 read-only · INV-3 매요청 재read · INV-4 buildStructure 순수.
    const groups = buildStructure(readMermaidDocs(p.repoPath), p.state);
    return c.json(StructureResponse.parse({ project: p.name, groups }));
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
    return c.json(WorktreeResponse.parse({ project: p.name, worktrees: activeWorktrees(p) }));
  });

  return app;
}

/**
 * 캐치올 fallback — server.ts 가 `/api/live`(WS) 등록 *후* 마지막에 마운트(순서상 `*` 가 WS 라우트를 삼키지 않게).
 * 정적 frontend 서빙(Phase 5)은 여기서 확장.
 */
export function mountFallback(app: Hono): void {
  app.get("*", (c) => c.text("gootte backend — frontend 미빌드 (web-dashboard 2a T2+)", 200));
}
