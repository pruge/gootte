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

// `docs/features/<기능>/issues/<파일>.md`(옛 관례) · `docs/features/<기능>/tickets/T<NN>.md`
// (신관례, T04) — git 이 주는 경로는 저장소 루트 기준 POSIX 다. 폴더까지 잡는 이유는 신관례의
// `T<NN>.md` 형태 검사 때문이다(아래 parseTicketPath).
const TICKET_PATH = /^docs\/features\/([^/]+)\/(issues|tickets)\/([^/]+)\.md$/i;

/**
 * 경로 한 줄 → 티켓 참조. 티켓 파일이 아니면 null.
 *
 * 🔴 두 관례 다 본다(실제 결함 2026-08) — 옛 관례만 보던 시절엔 신관례(`tickets/T01.md`)
 * 작업이 티켓 참조로 해소되지 않아 무조건 '티켓 미상'으로 세어졌다.
 *
 * 신관례 폴더는 `T<NN>.md` 만 티켓이다 — 실물 리더(core-io/src/features.ts)가 실재하는
 * 것만 그 모양으로 줍는다(INV-4), README 같은 안내문은 티켓 후보조차 아니다.
 *
 * 번호는 접두 `T` 를 걷어서 읽는다 — 신관례 파일명 `T04.md` 의 num 은 `"04"` 로,
 * 파서가 채우는 `FeatureTicket.num` 과 같은 값이다(계약 주석).
 *
 * `spec.md`·`adr/` 같은 같은 폴더의 다른 문서는 티켓이 아니다 — 그것들을 고쳤다고
 * 어느 티켓 작업인지 정해지지 않는다. 정해지지 않는 것은 **미상으로 남긴다**(추정 금지).
 */
export function parseTicketPath(path: string): TicketPathRef | null {
  const m = TICKET_PATH.exec(path.trim());
  if (!m) return null;
  const [, feature, dir, file] = m;
  if (!feature || !dir || !file) return null;
  // file 에는 확장자가 이미 없다(정규식이 .md 를 밖에서 소비한다).
  if (dir.toLowerCase() === "tickets" && !/^t\d+$/i.test(file)) return null;
  return { feature, slug: file, num: /^[Tt]?(\d{1,3})/.exec(file)?.[1] ?? "" };
}
