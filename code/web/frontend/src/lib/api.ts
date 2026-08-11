import { z, type ZodTypeAny } from "zod";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanResponse,
  DragResult,
  OpinionRequest,
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

async function post<S extends ZodTypeAny>(path: string, body: unknown, schema: S): Promise<z.output<S>> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const parsed = ApiError.safeParse(await res.json().catch(() => ({})));
    throw new Error(parsed.success ? parsed.data.error : `요청 실패 (${res.status})`);
  }
  return schema.parse(await res.json());
}

export const fetchProjects = (): Promise<Project[]> =>
  get("/api/projects", ProjectsResponse).then((r) => r.projects);

/** 기능별 할일 목록(docs/features/) — 막힘 해제는 서버가 계산해 보낸다(INV-1: 화면 재계산 X). */
export const fetchFeatures = (slug: string) =>
  get(`/api/features/${encodeURIComponent(slug)}`, FeaturesResponse);

/** `plan` 탭(티켓 03) — 전체 개발 순서. `next` 는 서버가 이미 계산해 보낸다(화면은 다시 판정하지 않는다). */
export const fetchPlan = (slug: string) =>
  get(`/api/plan/${encodeURIComponent(slug)}`, PlanResponse);

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

// ── 드래그(티켓 04) — gootte 의 첫 쓰기 경로. 순위·단계만 바꾼다(INV-5). ──────────

/** 티켓 칩을 다른 단계 줄로 끈다. */
export const moveTicketStep = (
  project: string,
  input: { feature: string; ticket: string; step: number },
): Promise<DragResult> => post(`/api/plan/${encodeURIComponent(project)}/ticket-step`, input, DragResult);

/** 티켓 칩을 줄과 줄 사이에 놓는다 — 새 단계가 생기고 뒤가 밀린다. */
export const insertTicketStep = (
  project: string,
  input: { feature: string; ticket: string; afterStep: number },
): Promise<DragResult> =>
  post(`/api/plan/${encodeURIComponent(project)}/ticket-step/insert`, input, DragResult);

/** 기능 카드를 끈다 — 같은 트랙 안 순위, 또는 다른 트랙으로. */
export const moveFeatureRank = (
  project: string,
  input: { feature: string; track: string; beforeRank: number | null; afterRank: number | null },
): Promise<DragResult> => post(`/api/plan/${encodeURIComponent(project)}/feature-rank`, input, DragResult);

// ── ask(티켓 06) — [의견 물어보기] 버튼. 캡틴이 무엇을 물을지 타이핑하지 않는다 —
// 서버가 계산해 보낸 트리거의 `detail` 을 그대로 보낸다. ──────────

/** 버튼 클릭 — 요청 한 줄을 남긴다. 답은 planner 가 CLI 로 적는다(이 함수가 기다리지 않는다). */
export const postAsk = (project: string, detail: string): Promise<OpinionRequest> =>
  post(`/api/plan/${encodeURIComponent(project)}/ask`, { detail }, OpinionRequest);
