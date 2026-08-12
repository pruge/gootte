import { QueryClient, useQuery } from "@tanstack/react-query";
import { fetchProjects, fetchFeatures, fetchFeatureDoc, fetchPlanBoard } from "./api";

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
