import { useCallback } from "react";
import { flushSync } from "react-dom";
import { QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PlanBoardResponse, PlanMoveRequest, StepMoveRequest } from "@gootte/contract";
import { applyMoveToBoard } from "../components/plan/areas";
import {
  fetchProjects,
  fetchFeatures,
  fetchFeatureDoc,
  fetchPlanBoard,
  movePlanCards,
  moveStep,
} from "./api";

/** 서버상태 SoT = TanStack Query 캐시(INV-1 — 별 스토어 복제 X). 2b WS 가 invalidate 로 확장. */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true },
    },
  });
}

export const qk = {
  projects: ["projects"] as const,
  features: (slug: string) => ["features", slug] as const,
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

/** 기능별 할일(docs/features/) — 서버가 매 요청 재계산(INV-3). */
export function useFeatures(slug: string | null) {
  return useQuery({
    queryKey: qk.features(slug ?? ""),
    queryFn: () => fetchFeatures(slug as string),
    enabled: slug !== null,
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

/** 드로어에 연 기능 문서 본문 — 셋 다 있어야 fetch(카드 트리에서 문서를 눌렀을 때만). */
export function useFeatureDoc(
  project: string | null,
  feature: string | null,
  path: string | null,
) {
  return useQuery({
    queryKey: qk.featureDoc(project ?? "", feature ?? "", path ?? ""),
    queryFn: () => fetchFeatureDoc(project as string, feature as string, path as string),
    enabled: project !== null && feature !== null && path !== null,
  });
}
