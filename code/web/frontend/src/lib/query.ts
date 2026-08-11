import { QueryClient, useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import {
  fetchProjects,
  fetchFeatures,
  fetchFeatureDoc,
  fetchPlan,
  moveTicketStep,
  insertTicketStep,
  moveFeatureRank,
  postAsk,
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

/** [의견 물어보기](티켓 06) — 요청 한 줄을 남긴다. 답은 CLI 로 planner 가 적고, 도착은 WS(`plan.db` 워처)가 알려준다. */
export function useAskOpinion(project: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (detail: string) => postAsk(project, detail),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.plan(project) }),
  });
}
