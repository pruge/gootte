import yaml from "js-yaml";
import { KickoffEvent } from "@gootte/contract";

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

const STATUS_EMOJI: Record<string, string> = {
  "🔜": "active",
  "✅": "shipped",
  "⬜": "planned",
  "⚫": "superseded",
};

function sectionBody(content: string, heading: string): string | null {
  // m 플래그 없이 — 있으면 $ 가 매 줄 끝에 매칭돼 섹션이 첫 줄에서 잘린다.
  const re = new RegExp(`(?:^|\\n)##\\s+${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);
  return content.match(re)?.[1] ?? null;
}

export function parseLedger(initiative: string, content: string): LedgerInfo {
  const header = content.match(/^-\s*상태:\s*(.+)$/m)?.[1] ?? "";
  let status = "active";
  for (const [emoji, s] of Object.entries(STATUS_EMOJI)) {
    if (header.includes(emoji)) status = s;
  }
  const word = header.match(/\b(active|shipped|planned|superseded)\b/)?.[1];
  if (word) status = word;

  const track = header.match(/트랙:\s*([^·\n]+)/)?.[1]?.trim() ?? null;
  const depsRaw = header.match(/의존:\s*([^·\n]+)/)?.[1]?.trim() ?? "";
  const deps =
    depsRaw && !/없음|none|^-$/.test(depsRaw) ? depsRaw.split(/[,\s]+/).filter(Boolean) : [];

  // 하이브리드 구조화 경로: ## events
  const events: KickoffEvent[] = [];
  const evBody = sectionBody(content, "events");
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
  const supBody = sectionBody(content, "supersede");
  if (supBody) {
    for (const m of supBody.matchAll(/supersedes?\s+([^\s—·(),]+)/g)) {
      const ref = m[1];
      if (ref && ref !== "—") supersedes.push(ref);
    }
  }

  return { initiative, status, track, deps, events, supersedes };
}
