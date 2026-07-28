import type { StructureDiagram, StructureGroup, Track } from "@gootte/contract";
import type { InitiativeState, ProjectState } from "../state/model";
import { frontmatter } from "../parse/frontmatter";
import { parseMermaid, extractMermaidBlock } from "../parse/mermaid";
import { normalizeTrack } from "../parse/track";
import { computeTrackOrder } from "./track";

/** core-io readMermaidDocs 산출 — 저작 mermaid 파일 raw(파싱은 core 순수). */
export interface RawMermaidDoc {
  file: string;
  content: string;
}

const SYSTEM = "__system__"; // track=null 그룹(시스템/공통) 내부 정렬 sentinel.

/**
 * sources 경로 → 이니셔티브 → 그 track(정규화). 가장 깊은(구체적) 세그먼트 우선 = phase > epic.
 * 이니셔티브 소스 없으면 null(시스템/공통, ADR-0002).
 */
function deriveTrack(
  sources: string[],
  state: ProjectState,
  bySlug: Map<string, InitiativeState>,
): Track | null {
  for (const s of sources) {
    const segs = s.split("/");
    for (let i = segs.length - 1; i >= 0; i--) {
      const init = bySlug.get(segs[i]!);
      if (init) return normalizeTrack(init.track, state.tracks);
    }
  }
  return null;
}

/**
 * 순수 projection(INV-4) — 저작 mermaid raw → track 그룹 배열(최종 표시 순서).
 * · frontmatter 파싱 + 첫 ```mermaid 블록 추출(블록 없는 그림 제외)
 * · track = sources→이니셔티브→track 파생(ADR-0002), 없으면 시스템/공통(track=null)
 * · 그룹 순서 = 시스템/공통 first → computeTrackOrder(present) · 그룹 내 = M-ID asc
 */
export function buildStructure(raw: RawMermaidDoc[], state: ProjectState): StructureGroup[] {
  const bySlug = new Map(state.initiatives.map((i) => [i.slug, i]));

  const byKey = new Map<string, { track: Track | null; diagrams: StructureDiagram[] }>();
  for (const d of raw) {
    const { body } = frontmatter(d.content);
    const code = extractMermaidBlock(body);
    if (!code) continue; // 코드 블록 없는 그림 제외
    const info = parseMermaid(d.content);
    const track = deriveTrack(info.sources, state, bySlug);
    const diagram: StructureDiagram = {
      id: info.id,
      title: info.title,
      status: info.status === "superseded" ? "superseded" : "living",
      code,
      sources: info.sources,
    };
    const key = track?.key ?? SYSTEM;
    let g = byKey.get(key);
    if (!g) {
      g = { track, diagrams: [] };
      byKey.set(key, g);
    }
    g.diagrams.push(diagram);
  }

  // 그룹 순서 = 시스템 first → computeTrackOrder(present) → (방어) 잔여 append.
  const ordered: string[] = [];
  if (byKey.has(SYSTEM)) ordered.push(SYSTEM);
  for (const k of computeTrackOrder(state)) {
    if (k !== SYSTEM && byKey.has(k) && !ordered.includes(k)) ordered.push(k);
  }
  for (const k of byKey.keys()) if (!ordered.includes(k)) ordered.push(k);

  return ordered.map((k) => {
    const g = byKey.get(k)!;
    return { track: g.track, diagrams: [...g.diagrams].sort((a, b) => a.id.localeCompare(b.id)) };
  });
}
