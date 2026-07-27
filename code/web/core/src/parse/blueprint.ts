import { statusFromEmoji } from "./status";

/** blueprint `## phases` 표의 한 phase = ledger 없는 프로젝트의 이니셔티브. */
export interface BlueprintPhase {
  /** phase 번호 (예: "1", "1b", "2a") — 표 표기용. */
  num: string;
  /** 이니셔티브 slug (= roadmap 하위 디렉토리명). */
  slug: string;
  /** 이모지 → 상태(shipped|active|planned|superseded). */
  status: string;
  /** 표 등장 순서 (indexOrder 대체 — gootte 엔 INDEX.md 없음). */
  order: number;
}

/** `## phases` 섹션 본문만 추출(다른 표 오탐 방지). m 플래그 없이 — ledger.sectionBody 와 동일 이유. */
function phasesSection(content: string): string | null {
  return content.match(/(?:^|\n)##\s+phases[^\n]*\n([\s\S]*?)(?=\n##\s|$)/)?.[1] ?? null;
}

// 표 첫 셀: `**<num> · <slug>** <상태 라벨>` — 예 `**2a · web-dashboard** ✅ done`.
// 이모지를 문자 클래스로 캡처하지 않는다(astral 이모지 🔜 는 서로게이트 반쪽만 잡힘) — 셀 나머지를 statusFromEmoji 에 위임.
const PHASE_ROW = /\*\*\s*([A-Za-z0-9]+)\s*·\s*([a-z0-9][a-z0-9-]*)\s*\*\*([^|\n]*)/g;

/**
 * blueprint.md `## phases` 표 → phase 목록(+상태). 순수·결정적(INV-4).
 * ledger 없는 blueprint 스타일 프로젝트의 이니셔티브 SoT — 이모지 규약은 ledger 와 공유(status.ts).
 */
export function parseBlueprint(content: string): BlueprintPhase[] {
  const body = phasesSection(content) ?? content;
  const out: BlueprintPhase[] = [];
  let order = 0;
  let m: RegExpExecArray | null;
  PHASE_ROW.lastIndex = 0;
  while ((m = PHASE_ROW.exec(body)) !== null) {
    out.push({
      num: m[1]!,
      slug: m[2]!,
      status: statusFromEmoji(m[3]!) ?? "planned",
      order: order++,
    });
  }
  return out;
}
