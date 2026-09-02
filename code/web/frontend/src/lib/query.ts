import { useCallback } from "react";
import { flushSync } from "react-dom";
import { QueryClient, useMutation, useQuery, useQueryClient, dehydrate, hydrate } from "@tanstack/react-query";
import type { PlanBoardResponse, PlanMoveRequest, StepMoveRequest } from "@gootte/contract";
import { applyMoveToBoard } from "../components/plan/areas";
import {
  fetchProjects,
  fetchFeatures,
  fetchFeatureDoc,
  fetchPlanBoard,
  recordTime,
  fetchSettings,
  movePlanCards,
  moveStep,
  saveSettings,
  fetchMemos,
  createMemo,
  updateMemo,
  deleteMemo,
} from "./api";
import { useToast } from "./toast";

const PERSIST_KEY = "gootte-query-cache-v1";
// 영속 캐시가 앱 재시작(브라우저 리로드)에서 살아남는 보관 기한 — 이 안에서는 GC 되지 않는다.
const PERSIST_GC = 1000 * 60 * 60 * 24; // 24h

/** 서버상태 SoT = TanStack Query 캐시(INV-1 — 별 스토어 복제 X). 2b WS 가 invalidate 로 확장. */
export function makeQueryClient(): QueryClient {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5_000, gcTime: PERSIST_GC, retry: 1, refetchOnWindowFocus: true },
    },
  });
  // 🔴 동기 hydrate — 첫 렌더 전에 영속본을 캐시에 앉혀 딱 한 프레임도 빈 화면이 안 뜬다(T07).
  hydrateFromStorage(qc);
  attachSaver(qc);
  return qc;
}

/**
 * 영속 캐시(T07) — 앱을 새로 시작해도 "이미 읽은" 내용을 바로 그린다. 변경분은 WS(`project`)
 * 방송이 걸러 낸 invalidate 로 갱신되니, 여기선 **저장만** 한다. 🔴 featureDoc(문서 본문)은
 * 큼직해 영속에서 뺀다 — 본문은 열 때마다 요청받으면 그만이다.
 */
function hydrateFromStorage(qc: QueryClient): void {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return;
    const dehydrated = JSON.parse(raw) as { queries?: Array<{ queryKey?: unknown[] }> };
    const queries = (dehydrated.queries ?? []).filter((q) => q.queryKey?.[0] !== "featureDoc");
    if (queries.length === 0) return;
    hydrate(qc, { ...dehydrated, queries });
  } catch {
    // 깨진 영속본은 무시 — 다음 fetch 가 채운다(치명하지 않다)
  }
}

function attachSaver(qc: QueryClient): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  qc.getQueryCache().subscribe(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        const dehydrated = dehydrate(qc, {
          shouldDehydrateQuery: (q) =>
            q.queryKey[0] !== "featureDoc" && q.state.status === "success" && q.state.data !== undefined,
        });
        localStorage.setItem(PERSIST_KEY, JSON.stringify(dehydrated));
      } catch {
        // quota 초과 등 — 영속 실패는 치명하지 않다(다음 fetches 가 메운다)
      }
    }, 500);
  });
}

export const qk = {
  projects: ["projects"] as const,
  features: (slug: string) => ["features", slug] as const,
  settings: ["settings"] as const,
  memos: (slug: string) => ["memos", slug] as const,
  /**
   * 🔴 자리 둘을 동시에 만족해야 하는 열쇠다(`lib/live.ts`): 맨 앞이 `"plan"` 이라 계획 DB 변경
   * (`kind:"plan"`)에 걸리고, slug 를 담고 있어 그 프로젝트 문서 변경(`kind:"project"`)에도 걸린다.
   * 문서를 새로 써도 새로고침 없이 판이 다시 그려지는 것이 두 번째 덕분이다.
   */
  plan: (slug: string) => ["plan", slug] as const,
  featureDoc: (project: string, feature: string, path: string) =>
    ["featureDoc", project, feature, path] as const,
};

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: fetchProjects });
}

/** 설정(tauri-desktop-app T02) — 감시 루트·firstmate 홈. */
export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: fetchSettings });
}

/**
 * 설정 저장 — 성공하면 프로젝트 목록을 무효화한다. 감시 루트가 바뀌면 발견되는 프로젝트
 * 자체가 달라지므로(INV-3), 화면이 낡은 목록을 그리게 두지 않는다. 나머지 쿼리도 루트에
 * 종속되지만 프로젝트 선택이 유지되는 동안엔 다음 조회에서 자연히 새 값이 온다.
 */
export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: saveSettings,
    onSuccess: () => {
      // 설정이 바뀌면 그것을 먹는 전부(프로젝트 발견·기능 목록·판)가 낡는다(INV-3) —
      // 저장 즉시 적용은 화면이 다시 물어 보는 것으로 완성된다.
      void qc.invalidateQueries();
    },
  });
}

/**
 * 차단한 작업 가지(blockedCopies) 갱신 — 화면에서 숨길 복사본 목록. PUT 은 부분 갱신이라
 * 다른 설정(firstmateHome·watchRoots)을 건드리지 않는다. 성공하면 설정·기능 목록을 무효화해
 * 차단된 복사본이 즉시 사라지고(뒤에 있는 설정 대화상자의 목록도 갱신된다) 화면이 다시 본다(INV-3).
 */
export function useBlockedCopies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blockedCopies: string[]) => saveSettings({ blockedCopies }),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });
}

/** 기능별 할일(docs/features/) — 서버가 매 요청 재계산(INV-3). */
export function useFeatures(slug: string | null) {
  return useQuery({
    queryKey: qk.features(slug ?? ""),
    queryFn: () => fetchFeatures(slug as string),
    enabled: slug !== null,
  });
}

/** 프로젝트 메모(memo-pad) — gootte 자기 저장소에서 읽는다. */
export function useMemos(slug: string | null) {
  return useQuery({
    queryKey: qk.memos(slug ?? ""),
    queryFn: () => fetchMemos(slug as string),
    enabled: slug !== null,
  });
}

/** 새 메모 — 성공하면 메모 목록을 무효화해 다시 읽는다(INV-3). */
export function useCreateMemo(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => createMemo(slug, content),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.memos(slug) }),
  });
}

/** 메모 고치기 — 내용을 바꾸고, `done` 이 주어지면 완료 표시(취소선)를 토글한다. */
export function useUpdateMemo(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, done }: { id: string; content: string; done?: boolean }) =>
      updateMemo(slug, id, content, done),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.memos(slug) }),
  });
}

/** 메모 지우기. */
export function useDeleteMemo(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMemo(slug, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.memos(slug) }),
  });
}

/** 다섯 자리 판 — 서버가 매 요청 문서와 자리 행을 다시 읽어 가른다(INV-3). */
export function usePlanBoard(slug: string | null) {
  return useQuery({
    queryKey: qk.plan(slug ?? ""),
    queryFn: () => fetchPlanBoard(slug as string),
    enabled: slug !== null,
  });
}

/**
 * 카드를 옮긴다(plan-board/03) — 캡틴의 손이 계획 DB 에 닿는 유일한 길.
 *
 * 🔴 서버가 돌려준 판을 **그대로** 캐시에 앉힌다 — 화면이 옮긴 결과를 자기 손으로 조립하면
 * 그것이 곧 서버 판정의 2차 사본이다(INV-1).
 *
 * 놓는 **순간**에는 카드를 놓은 칸으로 옮겨 놓은 한 프레임을 먼저 보여준다
 * (`applyMoveToBoard`) — 손끝의 사본이 날아갈 목적지가 있어야 하기 때문이다(캡틴 지시).
 * 🔴 그 프레임은 **연출이지 판정이 아니다**: 서버의 답이 오면 통째로 덮이고, 실패하면 이전 판이
 * 그대로 되돌아온다 — 옮겨진 척한 채로 남지 않는다.
 */
export function usePlanMove(slug: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (request: PlanMoveRequest) => movePlanCards(slug, request),
    onSuccess: (board) => qc.setQueryData(qk.plan(slug), board),
  });

  const move = useCallback(
    (request: PlanMoveRequest) => {
      const previous = qc.getQueryData<PlanBoardResponse>(qk.plan(slug));
      // 🔴 **동기로** 앞당긴다. dnd-kit 은 놓기 콜백이 끝나자마자 목적지를 재고, 그때 카드가
      // 아직 옛 칸에 있으면 손끝의 사본이 **옛 자리로 되돌아가 붙는다** — 방금 한 일을 취소한
      // 것처럼 보인다(캡틴 지시). `onMutate` 로 하면 `await` 한 번에 마이크로태스크로 밀려
      // 그 측정보다 늦는다. `flushSync` 가 그 한 박자를 없앤다.
      if (previous) {
        flushSync(() => qc.setQueryData(qk.plan(slug), applyMoveToBoard(previous, request)));
      }
      mutation.mutate(request, {
        // 실패하면 놓기 전의 판이 그대로 돌아온다 — 옮겨진 척한 채로 남지 않는다.
        onError: () => {
          if (previous) qc.setQueryData(qk.plan(slug), previous);
        },
      });
    },
    [qc, slug, mutation],
  );

  return { move, isError: mutation.isError, error: mutation.error };
}

/**
 * 캡틴이 `process` 탭에서 티켓을 끌어 단계를 정한다(plan-board/08).
 *
 * 🔴 `plan` 탭의 `usePlanMove` 와 달리 놓는 동안의 연출 프레임이 없다 — process 탭은 카드가
 * 칸을 오가지 않고 그룹 안에서 줄이 있던 위치를 다시 그릴 뿐이라, 서버가 다시 가른 판을 그대로
 * 앉히는 것으로 충분하다(INV-1·INV-3). 실패하면 이전 판이 그대로 남는다 — 캐시를 손대지
 * 않았으므로 되돌릴 것도 없다.
 */
export function useStepMove(slug: string) {
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (request: StepMoveRequest) => moveStep(slug, request),
    onSuccess: (board) => qc.setQueryData(qk.plan(slug), board),
  });
  return { move: mutation.mutate, isError: mutation.isError, error: mutation.error };
}

/**
 * 시간 기록(ADR-0002) — steps 탭 버튼으로 start/pause/resume/end 를 티켓 문서에 남긴다.
 * 성공하면 plan·features 를 무효화해 다시 읽는다(INV-3 — 낡은 걸린 시간을 안 그린다).
 */
export function useRecordTime(project: string) {
  const qc = useQueryClient();
  const toast = useToast();
  const label: Record<"start" | "pause" | "resume" | "end", string> = {
    start: "시작",
    pause: "일시중단",
    resume: "재개",
    end: "완료",
  };
  const mutation = useMutation({
    mutationFn: (req: { feature: string; ticket: string; action: "start" | "pause" | "resume" | "end" }) =>
      recordTime(project, req.feature, req.ticket, req.action),
    onSuccess: (_data, req) => {
      void qc.invalidateQueries({ queryKey: ["plan", project] });
      void qc.invalidateQueries({ queryKey: ["features", project] });
      toast.show(`${label[req.action]} 기록됨 — ${req.feature}/${req.ticket}`);
    },
    onError: (err, req) => {
      toast.show(
        `${label[req.action]} 실패 — ${err instanceof Error ? err.message : String(err)}`,
        "error",
      );
    },
  });
  return { record: mutation.mutate, isPending: mutation.isPending, isError: mutation.isError, error: mutation.error };
}

/**
 * 드로어에 연 기능 문서 본문 — 셋 다 있어야 fetch(카드 트리에서 문서를 눌렀을 때만).
 *
 * 🔴 서버가 이 요청을 받으면(티켓이면) 읽음으로 적는다(unread-tickets-show-themselves/01) —
 * 그래서 여기서 `features` 캐시를 무효화한다. 화면이 안 읽음 표시를 직접 지우지 않는다 —
 * 서버가 다시 계산한 값을 다시 받아 그리는 것으로 충분하다(INV-1).
 */
export function useFeatureDoc(
  project: string | null,
  feature: string | null,
  path: string | null,
) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.featureDoc(project ?? "", feature ?? "", path ?? ""),
    queryFn: async () => {
      const doc = await fetchFeatureDoc(project as string, feature as string, path as string);
      qc.invalidateQueries({ queryKey: qk.features(project as string) });
      return doc;
    },
    enabled: project !== null && feature !== null && path !== null,
  });
}
