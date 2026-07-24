import { QueryClient, useQuery } from "@tanstack/react-query";
import { fetchProjects, fetchPlan, fetchLineage, fetchBoard, fetchTimeline } from "./api";

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
  plan: (slug: string) => ["plan", slug] as const,
  lineage: (slug: string) => ["lineage", slug] as const,
  board: (slug: string) => ["board", slug] as const,
  timeline: (slug: string) => ["timeline", slug] as const,
};

export function useProjects() {
  return useQuery({ queryKey: qk.projects, queryFn: fetchProjects });
}

export function usePlan(slug: string | null) {
  return useQuery({
    queryKey: qk.plan(slug ?? ""),
    queryFn: () => fetchPlan(slug as string),
    enabled: slug !== null,
  });
}

export function useLineage(slug: string | null) {
  return useQuery({
    queryKey: qk.lineage(slug ?? ""),
    queryFn: () => fetchLineage(slug as string),
    enabled: slug !== null,
  });
}

export function useBoard(slug: string | null) {
  return useQuery({
    queryKey: qk.board(slug ?? ""),
    queryFn: () => fetchBoard(slug as string),
    enabled: slug !== null,
  });
}

export function useTimeline(slug: string | null) {
  return useQuery({
    queryKey: qk.timeline(slug ?? ""),
    queryFn: () => fetchTimeline(slug as string),
    enabled: slug !== null,
  });
}
