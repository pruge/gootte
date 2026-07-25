import type { Track } from "@gootte/contract";

/**
 * 대분류(track) 원문 → canonical {key,label}. 순수·결정적(INV-4).
 * 지능(어느 track)은 write-time(ledger)이 캡처, 여기선 정규화·label 릴레이만(요약·추론 X).
 *
 * @param raw   ledger track 원문(frontmatter key 또는 프로즈 `트랙:` 값). null/공백 = 미분류.
 * @param vocab profile `## Tracks` 어휘(key→label). 있으면 canonical label(SoT), 없으면 프로즈 파생.
 */
export function normalizeTrack(raw: string | null | undefined, vocab: Map<string, string>): Track | null {
  if (!raw) return null;
  let s = raw
    .replace(/\(.*$/s, "") // 괄호 설명 이후 제거(불균형 포함)
    .replace(/\*/g, "") // 볼드 마커
    .replace(/\p{Extended_Pictographic}/gu, "") // 이모지(🔴 등)
    .replace(/^\s*track\s+/i, "") // 선행 "Track "
    .trim();
  if (!s) return null;

  // 복수 track 표기(`A … / E — …`) = 선두 채택. label 내부 '/'(실시간 / 게이트웨이)는 보존.
  const compound = s.match(/^(.*?)\s*\/\s*[A-Z]\s*[—-]/);
  if (compound?.[1]) s = compound[1].trim();

  // key 추출: 선두 대문자 1자(뒤가 공백/대시/콜론/슬래시/끝) = key. 아니면 도메인 slug(첫 토큰).
  // `C/F`(공백없는 이중표기)도 선두 C 채택 — vocab 있으면 canonical 로 해소.
  const m = s.match(/^([A-Z])(?=$|[\s—:/-])/);
  let key: string;
  let proseLabel: string;
  if (m?.[1]) {
    key = m[1];
    proseLabel = s.slice(1).replace(/^\s*[—:/-]\s*/, "").trim();
  } else {
    key = s.split(/\s+/)[0] ?? s;
    proseLabel = s;
  }

  const label = vocab.get(key) ?? (proseLabel || key);
  return { key, label };
}

/**
 * profile `## Tracks` 어휘 표 파싱 → key→label Map. 순수.
 * 표 헤더(`| key | label |`)·구분선(`|---|`)·플레이스홀더(`<…>`) skip.
 */
export function parseProfileTracks(content: string): Map<string, string> {
  const vocab = new Map<string, string>();
  const sec = content.match(/(?:^|\n)##\s+Tracks[^\n]*\n([\s\S]*?)(?=\n##\s|$)/);
  if (!sec?.[1]) return vocab;
  for (const line of sec[1].split("\n")) {
    const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (!m?.[1] || !m[2]) continue;
    const key = m[1].trim();
    const label = m[2].trim();
    if (!key || key.toLowerCase() === "key") continue; // 헤더
    if (/^[-:\s]+$/.test(key)) continue; // 구분선
    if (/^<.*>$/.test(key) || /^<.*>$/.test(label)) continue; // 플레이스홀더
    vocab.set(key, label);
  }
  return vocab;
}
