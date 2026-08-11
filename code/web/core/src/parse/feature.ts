import { FirstmateStatus, type TodoStatus } from "@gootte/contract";

/**
 * firstmate 문서(`docs/features/`) 파서 — 문자열 → 구조. 순수·결정적(INV-4).
 * 서식 SoT = 관리대상의 `docs/agents/triage-labels.md` · `issue-tracker.md`.
 */

type Status = FirstmateStatus;

/** 정규 아홉 값 — 사상표의 왼쪽 열. */
export const FIRSTMATE_STATUSES: readonly Status[] = FirstmateStatus.options;

/** `**Status:** <값>` 한 줄에서 읽어낸 것. 값을 못 알아봐도 원문은 버리지 않는다. */
export interface StatusLine {
  /** 원문 verbatim(값 토큰만). `Status:` 줄이 아예 없으면 null. */
  raw: string | null;
  /** 아홉 값 중 하나면 그 값, 아니면 null. */
  value: Status | null;
  /** `resolved` 에 동반된 완료일(YYYY-MM-DD). 다른 상태의 괄호 날짜는 읽지 않는다. */
  completedAt: string | null;
}

// `**Status:** x` 와 `Status: x` 둘 다 — spec.md 는 굵게 없이 쓰기도 한다.
const STATUS_LINE = /^[ \t]*(?:\*\*)?Status:(?:\*\*)?[ \t]*(.*)$/m;
const BLOCKED_LINE = /^[ \t]*(?:\*\*)?Blocked by:(?:\*\*)?[ \t]*(.*)$/m;
const H1 = /^#[ \t]+(.+)$/m;
// 제목 앞의 번호 접두("02 — ", "02 - ", "02. ") — 번호는 파일명이 준다.
const TITLE_NUM_PREFIX = /^\d+\s*[—–.-]\s*/;
const DATE = /(\d{4}-\d{2}-\d{2})/;

function isStatus(v: string): v is Status {
  return (FIRSTMATE_STATUSES as readonly string[]).includes(v);
}

/**
 * `Status:` 줄 파싱 — **값 하나만** 뽑고 뒤따르는 괄호 사유·날짜·프로즈에는 넘어가지 않는다.
 * 서식이 `<값>[ (짧은 사유 또는 날짜)]` 한 줄로 끝나기 때문이다(triage-labels §서식).
 * 줄이 여러 번 나오면 **첫 줄**(= 파일 상단)이 이긴다 — 하단 `## Comments` 의 인용에 흔들리지 않게.
 */
export function parseStatusLine(content: string): StatusLine {
  const rest = STATUS_LINE.exec(content)?.[1]?.trim();
  if (!rest) return { raw: null, value: null, completedAt: null };
  // 값 토큰 = 공백·여는 괄호 앞까지. 알 수 없는 문자열도 그대로 잡아 원문에 싣는다.
  const raw = /^[^\s(]+/.exec(rest)?.[0] ?? rest;
  const value = isStatus(raw) ? raw : null;
  // 완료일은 완료 상태에만 붙는다 — `ready-for-agent (2026-08-09)` 의 날짜는 완료일이 아니다.
  const completedAt = value === "resolved" ? (DATE.exec(rest)?.[1] ?? null) : null;
  return { raw, value, completedAt };
}

/**
 * 원문 여덟 값 → 계약의 다섯 값(결정 Q3). 원문은 뭉개지 않고 호출자가 따로 싣는다.
 * 🔴 `in_progress` 는 여기서 나오지 않는다 — 문서가 아니라 격리 사본 관측이 만든다.
 */
export function mapFirstmateStatus(value: Status | null): TodoStatus {
  if (value === "resolved") return "done";
  if (value === "wontfix") return "dropped";
  return "pending"; // 나머지 일곱(claimed 포함) + 알 수 없는 값
}

// "선행 없음" 선언 — 관례가 명시를 요구한다(issue-tracker §Blocked by: "빈칸으로 두지 않는다").
// 뒤에 사유가 따라와도(`없음 — 05,03 과 모두 독립이다`) 그 안의 숫자는 선행이 아니다.
const NO_DEPS = /^(?:없음|없다|none|n\/a|[-—–])(?:\b|$|\s)/i;
// 항목 맨 앞의 티켓 번호 — `02`, `#02`, `[02](02-x.md)`, `02 — 사유` 를 모두 같은 번호로 읽는다.
const LEADING_NUM = /^\[?#?(\d{1,3})\]?\b/;
// "없음" 앞에 붙는 꾸밈(이모지·마크다운 강조 `**`·여는 괄호·공백) — 낱말 자체(한글·숫자)는 걷지 않는다.
const DECORATION_PREFIX = /^[\p{S}\p{P}\s]+/u;

/**
 * `없음` 계열 선언인지 본다. **원문을 먼저** 그대로 시험하고, 실패할 때만 앞머리 꾸밈을 걷어내
 * 다시 시험한다 — 꾸미지 않은 `-`·`—` 한 글자짜리 선언(NO_DEPS 자체가 그 꾸밈 문자를 포함하는
 * 경우)을 걷어내 버려 못 알아보게 되는 일이 없도록, 원문이 이미 통과하면 걷어내지 않는다.
 */
function isNoDeps(text: string): boolean {
  if (NO_DEPS.test(text)) return true;
  const stripped = text.replace(DECORATION_PREFIX, "");
  return stripped !== text && NO_DEPS.test(stripped);
}

/** `parseBlockedByLine` 의 결과 — 읽어낸 선행과, 못 읽어낸 산문을 함께 싣는다. */
export interface BlockedByParse {
  /** 선행 번호(또는 번호로 해소되지 않는 산문 그대로) — 착수 가능 판정이 기다리는 값. */
  blockedBy: string[];
  /** 번호도 "없음" 도 못 알아들은 산문 — verbatim. 막지 않되 감추지 않는다(어긋남으로 드러낸다). */
  unreadable: string[];
}

/**
 * `**Blocked by:** 01, 02` → { blockedBy: ["01","02"], unreadable: [] }. 쉼표(·가운뎃점 포함)로
 * 나눈 항목 하나 = 선행 하나.
 *
 * - 항목이 **번호로 시작하면** 그 번호다 — 뒤에 붙은 사유·링크·괄호는 값이 아니라 주석이다
 *   (`Status:` 줄과 같은 서식 원리).
 * - 줄이 `없음` 으로 시작하면 선행이 없다 — 이모지·굵게·괄호로 꾸며져 있어도 같다(`isNoDeps`).
 *   뒤따르는 사유 속 숫자·가운뎃점에 넘어가지 않는다.
 * - 번호로 시작하지 않는데 숫자가 섞인 항목(예: "그리고 **자매 기능 X 의 티켓 01**")은
 *   **문구 그대로** `blockedBy` 에 싣는다. 🔴 그 `01` 을 이 기능의 01 번으로 읽지 않는다 —
 *   다른 기능의 번호일 수 있고, 비슷하니 아마 이것이겠거니 하는 추정이 곧 INV-4 위반이다.
 *   번호로 해소되지 않아 계속 기다린다.
 * - 줄에서 번호를 **하나도** 못 찾았고 `없음` 도 아니면, 그 줄 전체가 번호도 "없음" 도 없는
 *   산문이다 — **선행으로 세지 않는다**(`blockedBy` 는 비운다). 대신 원문 `rest` 를 통째로
 *   `unreadable` 에 실어 못 읽었다는 사실 자체를 드러낸다. 조용히 버리면(선행도 아니고 표시도
 *   안 하면) 진짜 막힘과 구분이 안 되는 것처럼 보이고, 막힘으로 세면(반대 방향으로 느슨해지면)
 *   착수 가능한 티켓이 조용히 숨는다.
 * - 🔴 번호가 **하나라도** 이미 있으면, 숫자 없는 나머지 항목은 그 번호의 사유·설명으로 보고
 *   무시한다(줄을 가운뎃점으로 더 나누면 한국어 낱말 나열 "읽기·쓰기·복제" 까지 항목으로 갈려
 *   실제 서식(jinwooauto/user-grant-console/02)에서 헛된 어긋남을 만든다 — 번호 뒤 사유는
 *   애초에 주석이라는 원칙을 그대로 지킨다).
 */
export function parseBlockedByLine(content: string): BlockedByParse {
  const rest = BLOCKED_LINE.exec(content)?.[1]?.trim();
  if (!rest || isNoDeps(rest)) return { blockedBy: [], unreadable: [] };
  const blockedBy: string[] = [];
  for (const raw of rest.split(/[,、·]/)) {
    const part = raw.trim();
    if (!part) continue;
    const leading = LEADING_NUM.exec(part)?.[1];
    if (leading !== undefined) {
      if (!blockedBy.includes(leading)) blockedBy.push(leading);
      continue;
    }
    if (/\d/.test(part) && !blockedBy.includes(part)) blockedBy.push(part);
  }
  if (blockedBy.length > 0) return { blockedBy, unreadable: [] };
  return { blockedBy: [], unreadable: [rest] };
}

/** `parseBlockedByLine(content).blockedBy` — 선행만 필요한 호출자를 위한 좁은 창구. */
export function parseBlockedBy(content: string): string[] {
  return parseBlockedByLine(content).blockedBy;
}

/** 파일 한 장에서 읽어낸 티켓(막힘 해제는 아직 계산 전 — 그건 같은 기능의 다른 티켓을 알아야 한다). */
export interface TicketDoc {
  num: string;
  slug: string;
  title: string;
  status: TodoStatus;
  sourceStatus: string | null;
  statusKnown: boolean;
  completedAt: string | null;
  blockedBy: string[];
  /** `Blocked by:` 에서 번호도 "없음" 도 못 알아들은 산문 — verbatim(감추지 않는다). */
  unreadableBlockedBy: string[];
}

/** 기능 사양 한 장 — 표제와 상태. */
export interface FeatureSpecDoc {
  title: string;
  status: TodoStatus;
  sourceStatus: string | null;
  statusKnown: boolean;
}

function heading(content: string): string | null {
  return H1.exec(content)?.[1]?.trim() ?? null;
}

/**
 * `issues/<NN>-<슬러그>.md` 한 장 → 티켓. `fileName` 은 basename(확장자 포함/생략 무관).
 * 번호는 **파일명**이 SoT 다(F3) — 표제의 번호는 장식이라 접두만 걷어낸다.
 * 번호가 없는 파일도 버리지 않는다(num = "") — 목록에서 사라지면 화면이 거짓말을 한다.
 */
export function parseTicket(fileName: string, content: string): TicketDoc {
  const slug = fileName.replace(/\.md$/i, "");
  const num = /^(\d+)/.exec(slug)?.[1] ?? "";
  const { raw, value, completedAt } = parseStatusLine(content);
  const { blockedBy, unreadable } = parseBlockedByLine(content);
  return {
    num,
    slug,
    title: heading(content)?.replace(TITLE_NUM_PREFIX, "").trim() || slug,
    status: mapFirstmateStatus(value),
    sourceStatus: raw,
    statusKnown: value !== null,
    completedAt,
    blockedBy,
    unreadableBlockedBy: unreadable,
  };
}

/** `spec.md` 한 장 → 기능 표제·상태. 같은 여덟 값 어휘를 쓴다. */
export function parseFeatureSpec(slug: string, content: string): FeatureSpecDoc {
  const { raw, value } = parseStatusLine(content);
  return {
    title: heading(content) || slug,
    status: mapFirstmateStatus(value),
    sourceStatus: raw,
    statusKnown: value !== null,
  };
}
