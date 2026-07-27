import { statusFromEmoji } from "./status";

/** blueprint `## phases` 표의 한 phase = ledger 없는 프로젝트의 이니셔티브. */
export interface BlueprintPhase {
  /** phase 번호 (예: "1", "1b", "2a") — 표 표기용. */
  num: string;
  /** 이니셔티브 slug (= roadmap 하위 디렉토리명). */
  slug: string;
  /** 이모지 → 상태(shipped|active|planned|superseded). */
  status: string;
  /** `track` 열이 있으면 그 raw 값(예: "E — 엔진/lineage"), 없으면 null. normalizeTrack 이 projection 에서 파싱. */
  track: string | null;
  /** 표 등장 순서 (indexOrder 대체 — gootte 엔 INDEX.md 없음). */
  order: number;
}

/** `## phases` 섹션 본문만 추출(다른 표 오탐 방지). m 플래그 없이 — ledger.sectionBody 와 동일 이유. */
function phasesSection(content: string): string | null {
  return content.match(/(?:^|\n)##\s+phases[^\n]*\n([\s\S]*?)(?=\n##\s|$)/)?.[1] ?? null;
}

/** 표 행 `| a | b | c |` → 셀 배열(양끝 빈칸 제거·trim). */
function cells(row: string): string[] {
  return row
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

// phase 셀: `**<num> · <slug>** <상태 라벨>` — astral 이모지는 statusFromEmoji 에 위임(문자클래스 X).
const PHASE_CELL = /^\*\*\s*([A-Za-z0-9]+)\s*·\s*([a-z0-9][a-z0-9-]*)\s*\*\*(.*)$/;

/**
 * blueprint.md `## phases` 표 → phase 목록(+상태·track). 순수·결정적(INV-4).
 * `track` 열이 있으면 그 값을 raw track 으로(정규화는 projection 의 normalizeTrack). 없으면 null(하위호환).
 * 이모지 규약은 ledger 와 공유(status.ts).
 */
export function parseBlueprint(content: string): BlueprintPhase[] {
  const body = phasesSection(content) ?? content;
  const rows = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));

  // 헤더에서 track 열 인덱스(있으면). "phase" 를 포함한 행 = 헤더.
  let trackCol = -1;
  for (const r of rows) {
    const lc = cells(r).map((c) => c.toLowerCase());
    if (lc.includes("phase")) {
      trackCol = lc.indexOf("track");
      break;
    }
  }

  const out: BlueprintPhase[] = [];
  let order = 0;
  for (const r of rows) {
    const cs = cells(r);
    const m = PHASE_CELL.exec(cs[0] ?? "");
    if (!m) continue; // 헤더·구분선·비-phase 행
    const track = trackCol >= 0 ? (cs[trackCol] ?? "").trim() || null : null;
    out.push({
      num: m[1]!,
      slug: m[2]!,
      status: statusFromEmoji(m[3] ?? "") ?? "planned",
      track,
      order: order++,
    });
  }
  return out;
}
