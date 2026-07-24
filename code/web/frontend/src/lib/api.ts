import { z, type ZodTypeAny } from "zod";
import {
  ProjectsResponse,
  PlanResponse,
  LineageResponse,
  BoardResponse,
  TimelineResponse,
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

export const fetchLineage = (slug: string) =>
  get(`/api/lineage/${encodeURIComponent(slug)}`, LineageResponse);

export const fetchBoard = (slug: string) =>
  get(`/api/board/${encodeURIComponent(slug)}`, BoardResponse);

export const fetchTimeline = (slug: string) =>
  get(`/api/timeline/${encodeURIComponent(slug)}`, TimelineResponse);
