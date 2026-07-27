import { QueryClient, useQuery } from "@tanstack/react-query";
import {
  fetchProjects,
  fetchPlan,
  fetchRoadmap,
  fetchLineage,
  fetchBoard,
  fetchTimeline,
  fetchWorktree,
  fetchDoc,
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
  plan: (slug: string) => ["plan", slug] as const,
  roadmap: (slug: string) => ["roadmap", slug] as const,
  lineage: (slug: string) => ["lineage", slug] as const,
  board: (slug: string) => ["board", slug] as const,
  timeline: (slug: string) => ["timeline", slug] as const,
  worktree: (slug: string) => ["worktree", slug] as const,
  doc: (slug: string, kind: string, name: string, worktree?: string) =>
    ["doc", slug, kind, name, worktree ?? ""] as const,
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

export function useRoadmap(slug: string | null) {
  return useQuery({
    queryKey: qk.roadmap(slug ?? ""),
    queryFn: () => fetchRoadmap(slug as string),
    enabled: slug !== null,
  });
}

export function useWorktree(slug: string | null) {
  return useQuery({
    queryKey: qk.worktree(slug ?? ""),
    queryFn: () => fetchWorktree(slug as string),
    enabled: slug !== null,
  });
}

export function useDoc(
  slug: string,
  kind: "todo" | "sprint",
  name: string | null,
  worktree?: string,
) {
  return useQuery({
    queryKey: qk.doc(slug, kind, name ?? "", worktree),
    queryFn: () => fetchDoc(slug, kind, name as string, worktree),
    enabled: name !== null,
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
