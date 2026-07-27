import type { RoadmapItem } from "@gootte/contract";
import type { ProjectState, InitiativeState } from "../state/model";
import { normalizeTrack } from "../parse/track";
import { presentTrackOrder } from "./track";

/** 상태 정렬 랭크 — 진행·예정 먼저 → 완료 뒤. 미지 상태 = 예정(중간) 취급. */
const STATUS_RANK: Record<string, number> = { active: 0, planned: 1, shipped: 2 };
/** 체크리스트에서 제외할 todo 상태 — dropped 은 lineage(보류) 관심사. */
const CHECKLIST_EXCLUDE = new Set(["dropped"]);

export interface RoadmapResult {
  items: RoadmapItem[];
  /** 대분류 그룹 순서(등장 track + 미분류 last) — 리스트 그룹 렌더(021 재사용). 결정적. */
  trackOrder: string[];
}

const statusRank = (status: string): number => STATUS_RANK[status] ?? 1;

const indexPos = (state: ProjectState, slug: string): number => {
  const p = state.indexOrder.indexOf(slug);
  return p === -1 ? Number.MAX_SAFE_INTEGER : p;
};

/** 이니셔티브 todos(archive된 done 포함)를 상태로 done/pending 재구성(INV-1 — ledger md 파싱 X). */
function roadmapItemOf(init: InitiativeState, vocab: Map<string, string>): RoadmapItem {
  const done: string[] = [];
  const pending: string[] = [];
  for (const t of init.todos) {
    if (t.status === "done") done.push(t.slug);
    else if (!CHECKLIST_EXCLUDE.has(t.status)) pending.push(t.slug);
  }
  return {
    initiative: init.slug,
    track: normalizeTrack(init.track, vocab),
    status: init.status as RoadmapItem["status"],
    done,
    pending,
  };
}

/**
 * 순수 projection(INV-1/3/4) — 전 이니셔티브(완료 shipped 포함, superseded 제외)를
 * 상태(진행·예정 먼저 → 완료 뒤) → indexOrder → slug 로 결정적 정렬 + track 그룹 순서.
 * plan 리스트 v2: "무슨 기능이 끝났고 뭐가 남았나"를 한눈에(018). buildPlan(actionable 랭킹)과 별개 축.
 */
export function buildRoadmap(state: ProjectState): RoadmapResult {
  const included = state.initiatives.filter((i) => i.status !== "superseded");

  const sorted = [...included].sort((a, b) => {
    const sr = statusRank(a.status) - statusRank(b.status);
    if (sr !== 0) return sr;
    const ip = indexPos(state, a.slug) - indexPos(state, b.slug);
    if (ip !== 0) return ip;
    return a.slug.localeCompare(b.slug);
  });

  const items = sorted.map((i) => roadmapItemOf(i, state.tracks));

  const presentKeys: string[] = [];
  let anyUngrouped = false;
  for (const it of items) {
    if (it.track) presentKeys.push(it.track.key);
    else anyUngrouped = true;
  }

  return { items, trackOrder: presentTrackOrder(state, presentKeys, anyUngrouped) };
}
