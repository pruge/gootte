import yaml from "js-yaml";
import { KickoffEvent } from "@gootte/contract";
import { frontmatter, str } from "./frontmatter";
import { STATUS_EMOJI } from "./status";

/**
 * initiative `ledger.md` → 상태·트랙·의존 + KickoffEvent(하이브리드) + supersede.
 * 🔴 하이브리드(ADR-0004): `## events` 정형 있으면 구조화 파싱, 없으면 `## supersede` 산문 fallback.
 */
export interface LedgerInfo {
  initiative: string;
  status: string;
  track: string | null;
  deps: string[];
  events: KickoffEvent[];
  supersedes: string[];
}

function sectionBody(content: string, heading: string): string | null {
  // m 플래그 없이 — 있으면 $ 가 매 줄 끝에 매칭돼 섹션이 첫 줄에서 잘린다.
  const re = new RegExp(`(?:^|\\n)##\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  return content.match(re)?.[1] ?? null;
}

export function parseLedger(initiative: string, content: string): LedgerInfo {
  // frontmatter 있으면 분리(없으면 body===content — 레거시 무회귀).
  const { data, body } = frontmatter(content);
  // 볼드 `- **상태**: ✅`(상태**:) · 전각 콜론(：) 관용 — jinwooauto 등 다수 원장이 볼드 표기(트랙 파싱과 동일 부류).
  const header = body.match(/^-\s*\**\s*상태\**\s*[:：]\s*(.+)$/m)?.[1] ?? "";
  let status = "active";
  for (const [emoji, s] of Object.entries(STATUS_EMOJI)) {
    if (header.includes(emoji)) status = s;
  }
  const word = header.match(/\b(active|shipped|planned|superseded)\b/)?.[1];
  if (word) status = word;

  // 하이브리드: frontmatter `track:`(카노니컬) 우선, 없으면 프로즈 `트랙:`(레거시). 원문 반환(정규화는 projection).
  // 🔴 프로즈는 body 전체에서 탐색 — jinwooauto 등은 track 을 상태 줄이 아닌 별도 `- 트랙:` 줄에 둔다.
  // 볼드 `- **트랙**: F`(트랙**:) · 전각 콜론(：)도 허용 — emphasis 마커·콜론 변형을 관용. 값 정규화는 normalizeTrack.
  const proseTrack = body.match(/트랙[*_]*\s*[:：]\s*([^·\n]+)/)?.[1]?.trim();
  const track = str(data.track) ?? proseTrack ?? null;
  const depsRaw = header.match(/의존:\s*([^·\n]+)/)?.[1]?.trim() ?? "";
  const deps =
    depsRaw && !/없음|none|^-$/.test(depsRaw) ? depsRaw.split(/[,\s]+/).filter(Boolean) : [];

  // 하이브리드 구조화 경로: ## events
  const events: KickoffEvent[] = [];
  const evBody = sectionBody(body, "events");
  if (evBody && evBody.trim()) {
    const raw = yaml.load(evBody);
    if (Array.isArray(raw)) {
      for (const e of raw) {
        const parsed = KickoffEvent.safeParse({ initiative, ...(e as Record<string, unknown>) });
        if (parsed.success) events.push(parsed.data);
      }
    }
  }

  // 산문 fallback: ## supersede
  const supersedes: string[] = [];
  const supBody = sectionBody(body, "supersede");
  if (supBody) {
    for (const m of supBody.matchAll(/supersedes?\s+([^\s—·(),]+)/g)) {
      const ref = m[1];
      if (ref && ref !== "—") supersedes.push(ref);
    }
  }

  return { initiative, status, track, deps, events, supersedes };
}
