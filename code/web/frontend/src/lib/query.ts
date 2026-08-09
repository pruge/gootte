import { QueryClient, useQuery } from "@tanstack/react-query";
import type { DocRef } from "@gootte/contract";
import {
  fetchProjects,
  fetchPlan,
  fetchRoadmap,
  fetchLineage,
  fetchTimeline,
  fetchWorktree,
  fetchDoc,
  fetchTree,
  fetchRoadmapDoc,
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
  timeline: (slug: string) => ["timeline", slug] as const,
  worktree: (slug: string) => ["worktree", slug] as const,
  doc: (slug: string, kind: string, name: string, worktree?: string) =>
    ["doc", slug, kind, name, worktree ?? ""] as const,
  tree: (slug: string, initiative: string) => ["tree", slug, initiative] as const,
};

/** DocRef → 안정 캐시키(source 별). */
function docRefKey(slug: string, ref: DocRef | null, worktree?: string) {
  if (!ref) return ["doc", slug, "none"] as const;
  return ref.source === "roadmap"
    ? (["doc", slug, "roadmap", ref.initiative, ref.relPath] as const)
    : (["doc", slug, ref.source, ref.name, worktree ?? ""] as const);
}

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

/** 이니셔티브 폴더 tree (문서 브라우저 2e). */
export function useTree(slug: string | null, initiative: string | null) {
  return useQuery({
    queryKey: qk.tree(slug ?? "", initiative ?? ""),
    queryFn: () => fetchTree(slug as string, initiative as string),
    enabled: slug !== null && initiative !== null,
  });
}

/** DocRef(roadmap/todo/sprint) 소스 분기 read — 브라우저 파일 열기. */
export function useDocRef(slug: string, ref: DocRef | null, worktree?: string) {
  return useQuery({
    queryKey: docRefKey(slug, ref, worktree),
    queryFn: () =>
      ref!.source === "roadmap"
        ? fetchRoadmapDoc(slug, ref!.initiative, ref!.relPath)
        : fetchDoc(slug, ref!.source, ref!.name, worktree),
    enabled: ref !== null,
  });
}

export function useLineage(slug: string | null) {
  return useQuery({
    queryKey: qk.lineage(slug ?? ""),
    queryFn: () => fetchLineage(slug as string),
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
