import { useState } from "react";
import type { RoadmapItem } from "@gootte/contract";
import { useRoadmap, useWorktree } from "../../lib/query";
import { groupByTrack } from "../../lib/track";
import { Loading, ErrorMsg, Empty } from "../common/states";
import { TrackSidebar } from "./TrackSidebar";
import { RoadmapPanel } from "./RoadmapPanel";
import { DocDrawer } from "./DocDrawer";

type OpenDoc = { name: string; kind: "todo" | "sprint"; worktree?: string };

/**
 * plan 리스트 v2 — 본문 내 대분류 사이드바 + 우측 진행/완료/작업중 탭 패널.
 * 진행·완료 = track 이니셔티브(클릭 → 할일 체크리스트 → 할일 문서). 작업중 = 활성 worktree(→ sprint 문서).
 * 순서·done/pending 은 서버 값 그대로(INV-4).
 */
export function RoadmapView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useRoadmap(project);
  const wt = useWorktree(project);
  const [track, setTrack] = useState<string | null>(null);
  const [doc, setDoc] = useState<OpenDoc | null>(null);

  if (isLoading) return <Loading label="roadmap 계산 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;
  if (data.items.length === 0) return <Empty>roadmap 이니셔티브가 없습니다.</Empty>;

  const groups = groupByTrack<RoadmapItem>(data.items, (i) => i.track, data.trackOrder);
  const active = groups.find((g) => g.key === track) ?? groups[0]!;

  return (
    <div className="relative flex h-full gap-5">
      <TrackSidebar groups={groups} selected={active.key} onSelect={setTrack} />
      <RoadmapPanel
        key={active.key}
        group={active}
        worktrees={wt.data?.worktrees ?? []}
        onOpenDoc={(name) => setDoc({ name, kind: "todo" })}
        onOpenSprint={(sprint, worktree) => setDoc({ name: sprint, kind: "sprint", worktree })}
      />
      {doc && (
        <DocDrawer
          project={project}
          name={doc.name}
          kind={doc.kind}
          worktree={doc.worktree}
          onClose={() => setDoc(null)}
        />
      )}
    </div>
  );
}
