import { z, type ZodTypeAny } from "zod";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanBoardResponse,
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

/** 기능별 할일 목록(docs/features/) — 막힘 해제는 서버가 계산해 보낸다(INV-1: 화면 재계산 X). */
export const fetchFeatures = (slug: string) =>
  get(`/api/features/${encodeURIComponent(slug)}`, FeaturesResponse);

/**
 * 다섯 자리 판 — 서버가 문서와 자리 행을 이어 이미 다섯 칸으로 갈라 보낸다.
 * 🔴 화면은 다시 가르지 않는다 — 판정하는 자리는 `core` 순수 함수 하나뿐이다(spec §판정 자리는 하나뿐).
 */
export const fetchPlanBoard = (slug: string): Promise<PlanBoardResponse> =>
  get(`/api/plan/${encodeURIComponent(slug)}`, PlanBoardResponse);

/** 기능 폴더 문서 본문(read-only) — 경로 판정은 서버 몫이다(티켓 01 §설계 4). */
export const fetchFeatureDoc = (
  project: string,
  feature: string,
  path: string,
): Promise<FeatureDocResponse> =>
  get(
    `/api/features/${encodeURIComponent(project)}/${encodeURIComponent(feature)}/doc?path=${encodeURIComponent(path)}`,
    FeatureDocResponse,
  );
