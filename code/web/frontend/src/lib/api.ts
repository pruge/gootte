import { z, type ZodTypeAny } from "zod";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanBoardResponse,
  ApiError,
  type PlanMoveRequest,
  type StepMoveRequest,
  type Project,
} from "@gootte/contract";

/** same-origin(prod = backend가 정적 서빙) · dev = vite 프록시가 /api → backend. */
const BASE = "";

async function send<S extends ZodTypeAny>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.output<S>> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const parsed = ApiError.safeParse(await res.json().catch(() => ({})));
    throw new Error(parsed.success ? parsed.data.error : `요청 실패 (${res.status})`);
  }
  return schema.parse(await res.json()); // 응답도 CONTRACT 검증(경계 방어)
}

const get = <S extends ZodTypeAny>(path: string, schema: S): Promise<z.output<S>> =>
  send(path, schema);

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

/**
 * 카드를 옮긴다(plan-board/03) — 응답은 **옮긴 뒤의 판 전체**다.
 * 🔴 화면이 자기 손으로 판을 고쳐 그리지 않는다 — 서버가 다시 읽어 가른 결과를 그대로 받는다
 * (INV-1·INV-3). 두 번 그리면 그 순간부터 하나는 거짓이다.
 */
export const movePlanCards = (
  slug: string,
  move: PlanMoveRequest,
): Promise<PlanBoardResponse> =>
  send(`/api/plan/${encodeURIComponent(slug)}/move`, PlanBoardResponse, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(move),
  });

/**
 * 캡틴이 `process` 탭에서 티켓을 끌어 단계를 정한다(plan-board/08) — 응답은 **옮긴 뒤의 판 전체**다.
 * 🔴 화면은 "어느 자리에 놓았다" 만 보낸다 — 저장 숫자를 고르는 것은 서버의 `placeStep`(core)
 * 하나뿐이다(spec §판정 자리는 하나뿐).
 */
export const moveStep = (slug: string, move: StepMoveRequest): Promise<PlanBoardResponse> =>
  send(`/api/plan/${encodeURIComponent(slug)}/step`, PlanBoardResponse, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(move),
  });

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
