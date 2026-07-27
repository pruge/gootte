/** cling 상태 이모지 → InitiativeStatus. ledger `- 상태:` 와 blueprint `## phases` 표가 공유. */
export const STATUS_EMOJI: Record<string, string> = {
  "🔜": "active",
  "✅": "shipped",
  "⬜": "planned",
  "⚫": "superseded",
};

/** 텍스트에 포함된 상태 이모지 → 상태 문자열. 없으면 null. 결정적(INV-4). */
export function statusFromEmoji(text: string): string | null {
  for (const [emoji, s] of Object.entries(STATUS_EMOJI)) {
    if (text.includes(emoji)) return s;
  }
  return null;
}
