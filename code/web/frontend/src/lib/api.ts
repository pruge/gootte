import { z, type ZodTypeAny } from "zod";
import {
  ProjectsResponse,
  FeaturesResponse,
  FeatureDocResponse,
  PlanBoardResponse,
  SettingsResponse,
  ApiError,
  MemosResponse,
  Memo,
  MemoDeleteResponse,
  type PlanMoveRequest,
  type StepMoveRequest,
  type Project,
  type SettingsUpdateRequest,
  type SettingsResponse as SettingsResponseType,
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

/** 설정 읽기(tauri-desktop-app T02) — 존재 여부는 서버가 응답 때 다시 본다(INV-3). */
export const fetchSettings = (): Promise<SettingsResponseType> =>
  get("/api/settings", SettingsResponse);

/**
 * 설정 바꾸기 — 응답은 **저장 뒤의 설정 전체**다. 화면이 자기 손으로 고친 값을 그대로 두지
 * 않고 서버가 정규화·재판정한 값을 받는다(INV-1 — 화면이 판정의 2차 사본을 만들지 않게).
 */
export const saveSettings = (update: SettingsUpdateRequest): Promise<SettingsResponseType> =>
  send("/api/settings", SettingsResponse, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });

/**
 * 캐시·스냅샷 강제 초기화(settings-in-main-area, 2026-08-31) — 새 worktree 나 새 기능 폴더가
 * 생겼는데 감지가 안 될 때 사용자가 손으로 밀어 넣는 길. 다음 요청부터 각 라우트가 다시 스캔한다.
 */
export const refreshBackend = async (): Promise<void> => {
  await send("/api/refresh", z.object({ ok: z.boolean() }), { method: "POST" });
};

/** 시간 기록 요청(ADR-0002, pause/resume/start/end) — `action` + feature/ticket. */
export const recordTime = async (
  project: string,
  feature: string,
  ticket: string,
  action: "start" | "pause" | "resume" | "end",
): Promise<void> => {
  await send(`/api/projects/${encodeURIComponent(project)}/time`, z.object({ ok: z.boolean() }), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ feature, ticket, action }),
  });
};

/** 프로젝트 메모 목록(memo-pad) — gootte 자기 저장소에서 읽는다(INV-2 관리대상 아님). */
export const fetchMemos = (project: string): Promise<MemosResponse> =>
  get(`/api/memos/${encodeURIComponent(project)}`, MemosResponse);

/** 새 메모 한 장. */
export const createMemo = async (project: string, content: string): Promise<Memo> =>
  send(`/api/memos/${encodeURIComponent(project)}`, Memo, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content }),
  });

/** 메모 한 장 고치기 — 내용을 바꾸고, `done` 을 주면 완료 표시(취소선)를 함께 바꾼다. */
export const updateMemo = async (
  project: string,
  id: string,
  content: string,
  done?: boolean,
): Promise<Memo> =>
  send(`/api/memos/${encodeURIComponent(project)}/${encodeURIComponent(id)}`, Memo, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, ...(done !== undefined ? { done } : {}) }),
  });

/** 메모 한 장 지우기. */
export const deleteMemo = async (project: string, id: string): Promise<MemoDeleteResponse> =>
  send(`/api/memos/${encodeURIComponent(project)}/${encodeURIComponent(id)}`, MemoDeleteResponse, {
    method: "DELETE",
  });
