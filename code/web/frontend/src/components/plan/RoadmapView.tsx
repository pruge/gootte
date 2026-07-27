import { useState } from "react";
import type { RoadmapItem } from "@gootte/contract";
import { useRoadmap, useWorktree } from "../../lib/query";
import { groupByTrack, worktreesByTrack, UNGROUPED } from "../../lib/track";
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

  // 활성 worktree("작업중")를 track 별로 — 사이드바 카운트 + 패널 탭이 선택 track 과 일치.
  const wtByTrack = worktreesByTrack(wt.data?.worktrees ?? [], data.items);
  const worktreeCounts: Record<string, number> = {};
  for (const [key, list] of wtByTrack) worktreeCounts[key] = list.length;

  // 미분류(track 없음·미바인딩) 활성 worktree 도 도달 가능하게 — 해당 items 그룹이 없으면 빈 그룹 합성.
  if ((wtByTrack.get(UNGROUPED)?.length ?? 0) > 0 && !groups.some((g) => g.key === UNGROUPED)) {
    groups.push({ key: UNGROUPED, label: "미분류", items: [] });
  }

  const active = groups.find((g) => g.key === track) ?? groups[0]!;

  return (
    <div className="relative flex h-full gap-5">
      <TrackSidebar
        groups={groups}
        selected={active.key}
        onSelect={setTrack}
        worktreeCounts={worktreeCounts}
      />
      <RoadmapPanel
        key={active.key}
        group={active}
        worktrees={wtByTrack.get(active.key) ?? []}
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
