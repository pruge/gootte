/**
 * 커밋이 건드린 경로 → 티켓 참조. 문자열 → 구조, 순수·결정적(INV-4).
 *
 * 🔴 이것이 "어느 작업이 어느 티켓인가"의 **유일한** 규칙이다(사양 §설계 3, 결정 Q1 = 안 B).
 * 브랜치 이름은 보지 않는다 — 이름이 비슷하니 아마 이 티켓이겠거니는 INV-4 위반이고,
 * 번호를 담는 브랜치 규약은 이 저장소가 정할 수 없다. 규약이 생기면 그때 규칙을 하나 더 얹는다.
 */

/** 티켓 파일 한 장을 가리키는 참조 — 기능 폴더 + 파일 basename(= `FeatureTicket.slug`). */
export interface TicketPathRef {
  feature: string;
  /** 파일 basename(확장자 제거) — `FeatureTicket.slug` 와 같은 값이다. */
  slug: string;
  /** 파일명 앞 번호("01"). 번호가 없으면 빈 문자열 — `FeatureTicket.num` 과 같은 규칙. */
  num: string;
}

// `docs/features/<기능>/issues/<파일>.md` — git 이 주는 경로는 저장소 루트 기준 POSIX 다.
const TICKET_PATH = /^docs\/features\/([^/]+)\/issues\/([^/]+)\.md$/i;

/**
 * 경로 한 줄 → 티켓 참조. 티켓 파일이 아니면 null.
 *
 * `spec.md`·`adr/` 같은 같은 폴더의 다른 문서는 티켓이 아니다 — 그것들을 고쳤다고
 * 어느 티켓 작업인지 정해지지 않는다. 정해지지 않는 것은 **미상으로 남긴다**(추정 금지).
 */
export function parseTicketPath(path: string): TicketPathRef | null {
  const m = TICKET_PATH.exec(path.trim());
  if (!m) return null;
  const [, feature, file] = m;
  if (!feature || !file) return null;
  return { feature, slug: file, num: /^(\d+)/.exec(file)?.[1] ?? "" };
}
