import { QueryClient, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  fetchProjects,
  fetchFeatures,
  fetchFeatureDoc,
  fetchPlan,
  moveTicketStep,
  insertTicketStep,
  moveFeatureRank,
  renameTrack,
  dismissFeatureReview,
  clearAllReviewFlags,
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

/** 전체 개발 순서(`plan` 탭, 티켓 03) — 서버가 매 요청 재계산(INV-1·INV-3). */
export function usePlan(slug: string | null) {
  return useQuery({
    queryKey: qk.plan(slug ?? ""),
    queryFn: () => fetchPlan(slug as string),
    enabled: slug !== null,
  });
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

// ── 드래그(티켓 04) — 성공하면 `plan` 쿼리를 무효화해 다시 읽는다(INV-3, 화면이 두 번째 SoT 를 안 갖는다). */

/** 티켓 칩을 다른 단계 줄로 끈다. */
export function useMoveTicketStep(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { feature: string; ticket: string; step: number }) => moveTicketStep(project, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plan(project) }),
  });
}

/** 티켓 칩을 줄과 줄 사이에 놓는다 — 새 단계. */
export function useInsertTicketStep(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { feature: string; ticket: string; afterStep: number }) => insertTicketStep(project, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plan(project) }),
  });
}

/** 기능 카드를 끈다 — 순위, 또는 트랙까지. */
export function useMoveFeatureRank(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { feature: string; track: string; beforeRank: number | null; afterRank: number | null }) =>
      moveFeatureRank(project, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plan(project) }),
  });
}

/** 트랙 이름을 고친다 — 그 트랙의 모든 기능이 한꺼번에 새 이름을 받는다. */
export function useRenameTrack(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { track: string; newTrack: string }) => renameTrack(project, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plan(project) }),
  });
}

/** 확인 필요를 그 자리에서 내린다(development-order/16 ①) — 지금 자리를 새 닻으로 삼는다. */
export function useDismissFeatureReview(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { feature: string }) => dismissFeatureReview(project, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plan(project) }),
  });
}

/** `next` 버튼 옆 clear — 지금 서 있는 확인 필요를 기능·티켓 가리지 않고 전부 지운다(캡틴 지시 2026-08-11). */
export function useClearAllReviewFlags(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clearAllReviewFlags(project),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plan(project) }),
  });
}
