import { useState } from "react";
import type { RoadmapItem } from "@gootte/contract";
import { useRoadmap } from "../../lib/query";
import { groupByTrack } from "../../lib/track";
import { Loading, ErrorMsg, Empty } from "../common/states";
import { TrackSidebar } from "./TrackSidebar";
import { RoadmapPanel } from "./RoadmapPanel";
import { DocDrawer } from "./DocDrawer";

/**
 * plan 리스트 v2(018) — 본문 내 대분류(track) 사이드바 + 우측 진행/완료 탭 패널.
 * 대분류 클릭 → 그 track 의 이니셔티브를 진행/완료로 나눠 표시, 각 항목 클릭 → 할일 체크리스트.
 * 순서·done/pending 은 서버 값 그대로(INV-4).
 */
export function RoadmapView({ project }: { project: string }) {
  const { data, isLoading, isError, error } = useRoadmap(project);
  const [track, setTrack] = useState<string | null>(null);
  const [doc, setDoc] = useState<string | null>(null);

  if (isLoading) return <Loading label="roadmap 계산 중…" />;
  if (isError) return <ErrorMsg error={error} />;
  if (!data) return null;
  if (data.items.length === 0) return <Empty>roadmap 이니셔티브가 없습니다.</Empty>;

  const groups = groupByTrack<RoadmapItem>(data.items, (i) => i.track, data.trackOrder);
  const active = groups.find((g) => g.key === track) ?? groups[0]!;

  return (
    <div className="relative flex h-full gap-5">
      <TrackSidebar groups={groups} selected={active.key} onSelect={setTrack} />
      <RoadmapPanel key={active.key} group={active} onOpenDoc={setDoc} />
      {doc && <DocDrawer project={project} name={doc} onClose={() => setDoc(null)} />}
    </div>
  );
}
