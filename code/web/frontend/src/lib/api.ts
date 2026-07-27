import { z, type ZodTypeAny } from "zod";
import {
  ProjectsResponse,
  PlanResponse,
  RoadmapResponse,
  LineageResponse,
  BoardResponse,
  TimelineResponse,
  WorktreeResponse,
  DocResponse,
  TreeResponse,
  ApiError,
  type Project,
} from "@gootte/contract";

/** same-origin(prod = backend가 정적 서빙) · dev = vite 프록시가 /api → backend. */
const BASE = "";

async function get<S extends ZodTypeAny>(path: string, schema: S): Promise<z.output<S>> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const parsed = ApiError.safeParse(await res.json().catch(() => ({})));
    throw new Error(parsed.success ? parsed.data.error : `요청 실패 (${res.status})`);
  }
  return schema.parse(await res.json()); // 응답도 CONTRACT 검증(경계 방어)
}

export const fetchProjects = (): Promise<Project[]> =>
  get("/api/projects", ProjectsResponse).then((r) => r.projects);

export const fetchPlan = (slug: string) =>
  get(`/api/plan/${encodeURIComponent(slug)}`, PlanResponse);

export const fetchRoadmap = (slug: string) =>
  get(`/api/roadmap/${encodeURIComponent(slug)}`, RoadmapResponse);

export const fetchLineage = (slug: string) =>
  get(`/api/lineage/${encodeURIComponent(slug)}`, LineageResponse);

export const fetchBoard = (slug: string) =>
  get(`/api/board/${encodeURIComponent(slug)}`, BoardResponse);

export const fetchTimeline = (slug: string) =>
  get(`/api/timeline/${encodeURIComponent(slug)}`, TimelineResponse);

export const fetchWorktree = (slug: string) =>
  get(`/api/worktree/${encodeURIComponent(slug)}`, WorktreeResponse);

export const fetchDoc = (slug: string, kind: "todo" | "sprint", name: string, worktree?: string) => {
  const q = worktree ? `?worktree=${encodeURIComponent(worktree)}` : "";
  return get(
    `/api/doc/${encodeURIComponent(slug)}/${kind}/${encodeURIComponent(name)}${q}`,
    DocResponse,
  );
};

/** 문서 브라우저(2e) — 이니셔티브 폴더 tree. */
export const fetchTree = (slug: string, initiative: string) =>
  get(
    `/api/tree/${encodeURIComponent(slug)}/${encodeURIComponent(initiative)}`,
    TreeResponse,
  );

/** roadmap 폴더 파일 read(별도 경로 — generic doc 라우트와 충돌 회피). path 는 폴더 상대경로. */
export const fetchRoadmapDoc = (slug: string, initiative: string, path: string) =>
  get(
    `/api/roadmap-doc/${encodeURIComponent(slug)}/${encodeURIComponent(initiative)}?path=${encodeURIComponent(path)}`,
    DocResponse,
  );
