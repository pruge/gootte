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
  /**
   * `resolved` 에 동반된 완료일 — `YYYY-MM-DD` 또는 `YYYY-MM-DD HH:MM`(캡틴 결정 2026-08-12, 06).
   * 시각이 없으면 날짜만 담긴다 — 지어내지 않는다. 다른 상태의 괄호 날짜는 읽지 않는다.
   */
  completedAt: string | null;
}

// `**Status:** x` 와 `Status: x` 둘 다 — spec.md 는 굵게 없이 쓰기도 한다.
const STATUS_LINE = /^[ \t]*(?:\*\*)?Status:(?:\*\*)?[ \t]*(.*)$/m;
const BLOCKED_LINE = /^[ \t]*(?:\*\*)?Blocked by:(?:\*\*)?[ \t]*(.*)$/m;
const H1 = /^#[ \t]+(.+)$/m;
// 제목 앞의 번호 접두("02 — ", "02 - ", "02. ") — 번호는 파일명이 준다.
const TITLE_NUM_PREFIX = /^\d+\s*[—–.-]\s*/;
// 날짜 뒤에 시각이 붙을 수도(06) — `(?: HH:MM)?` 는 없으면 그냥 날짜만 잡는다. 없는 시각을 지어내지 않는다.
const DATE = /(\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?)/;

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
// 🔴 낱말 바로 뒤에 닫는 꾸밈(`**없음**`·`(없음)`)이 붙을 수 있어 그 꾸밈까지 걷어낸 뒤에
// 경계·공백·끝을 본다 — 안 걷으면 "굵게·괄호로 닫은 없음"이 여기서 안 걸리고, 아래
// parseBlockedByLine 이 번호 없는 산문으로 오인해 development-order/17 의 뒤집힌 규칙이
// 잘못 걸린다(11 이 지킨 "꾸민 없음은 막힘 없음이다" 가 깨진다).
const NO_DEPS = /^(?:없음|없다|none|n\/a|[-—–])[\p{S}\p{P}]*(?:\b|$|\s)/imu;
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
  /**
   * 번호도 "없음" 도 없는 산문 — verbatim. 🔴 **막는다(위 `blockedBy` 에도 같은 값이 실린다) —
   * 동시에 감추지 않는다(어긋남으로 드러낸다).** 번호가 없어 선행이 끝나도 자동으로 안 풀리므로
   * 어긋남만이 사람을 부르는 수단이다(development-order/17).
   */
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
 * - 🔴 줄 전체에 진짜 티켓 번호가 **하나도** 없으면(우연히 섞인 날짜 등 숫자가 있든 없든 같다),
 *   사람이 번호 없이 적은 진짜 막힘으로 읽는다 — **막힘으로 세면서 동시에** `unreadable` 에도
 *   verbatim 으로 싣는다(development-order/17). 번호가 없으면 선행이 끝나도 자동으로 안 풀리므로
 *   `unreadable` 이 그 사실을 드러내는 유일한 수단이다. **development-order/11 의 "못 알아들은
 *   줄이 착수 가능을 막지 **않는다**" 를 이 경우에 한해 뒤집는다** — 11 이 착지하며 꾸민 "없음"
 *   은 이미 위 `isNoDeps` 가 걸러내므로, 여기까지 남는 것은 더 이상 꾸민 "없음"이 아니라
 *   번호 없이 적힌 진짜 막힘이다.
 */
export function parseBlockedByLine(content: string): BlockedByParse {
  const rest = BLOCKED_LINE.exec(content)?.[1]?.trim();
  if (!rest || isNoDeps(rest)) return { blockedBy: [], unreadable: [] };
  const numbered: string[] = [];
  const proseWithDigits: string[] = [];
  for (const raw of rest.split(/[,、·]/)) {
    const part = raw.trim();
    if (!part) continue;
    const leading = LEADING_NUM.exec(part)?.[1];
    if (leading !== undefined) {
      if (!numbered.includes(leading)) numbered.push(leading);
      continue;
    }
    if (/\d/.test(part) && !proseWithDigits.includes(part)) proseWithDigits.push(part);
  }
  if (numbered.length > 0) return { blockedBy: [...numbered, ...proseWithDigits], unreadable: [] };
  return { blockedBy: [rest], unreadable: [rest] };
}

/** `parseBlockedByLine(content).blockedBy` — 선행만 필요한 호출자를 위한 좁은 창구. */
export function parseBlockedBy(content: string): string[] {
  return parseBlockedByLine(content).blockedBy;
}

// markdown 링크의 목적지 — `[...](<경로>)` 에서 괄호 안만 뗀다. 표시 문구(대괄호 안)는 안 본다 —
// 사람이 이모지·굵게로 아무렇게나 꾸밀 수 있고, 이미 그렇게 쓰이고 있다(cross-feature-blocker/spec).
const MD_LINK_PATH = /]\(([^)]+)\)/;
// 경로에서 "<기능>/issues/<번호>-" 만 뜯는다 — `../../` 깊이는 몇이든 상관없다. 기능과 번호를
// 둘 다 경로 자체가 담고 있으므로 추정이 필요 없다.
const CROSS_FEATURE_PATH = /([^/]+)\/issues\/(\d{1,3})-/;

/** markdown 링크 하나가 가리키는 기능·티켓 — 경로에서만 읽는다(표시 문구는 안 본다). */
export interface CrossFeatureRef {
  feature: string;
  num: string;
}

/**
 * `Blocked by:` 항목 하나(번호로 안 풀린 산문)가 다른 기능의 티켓을 markdown 링크로 가리키는지
 * 본다. 링크가 없거나 `<기능>/issues/<번호>-` 형태로 안 풀리면 null — 그 경우 호출자는 지금처럼
 * `unreadable` 로 남기고 계속 막는다(development-order/17). 여기서는 **경로만** 읽고 그 기능·티켓이
 * 실재하는지는 판단하지 않는다 — 그건 다른 기능들의 문서를 함께 아는 자리(`project/features.ts`)의
 * 몫이다(판정 자리는 하나).
 */
export function parseCrossFeatureRef(text: string): CrossFeatureRef | null {
  const path = MD_LINK_PATH.exec(text)?.[1];
  if (!path) return null;
  const m = CROSS_FEATURE_PATH.exec(path);
  if (!m) return null;
  return { feature: m[1] as string, num: m[2] as string };
}

// H2 헤딩 한 줄("## " 뒤). H3 이상("###")은 이 접두를 매치하지 않는다 — "결과" 회고 문단
// (예: jinwooauto/access-control/01 의 "### 캡틴 확인 결과")과 절 자체를 가른다.
const H2_HEADING = /^##[ \t]+([^\n]*)$/gm;
// 헤딩 텍스트 맨 앞의 꾸밈(이모지 등) — parseBlockedByLine 의 DECORATION_PREFIX 와 같은 원리.
const CAPTAIN_EYE_DECORATION = /^[\p{S}\p{P}\s]+/u;

/**
 * 절이 있나 없나로만 정한다(INV-4, development-order/15 ②) — 표시 줄이 없거나 못 알아본 값일 때
 * 만 쓰는 폴백. 뜻을 짐작하지 않는다: 절 안 내용은 안 읽는다. 유일한 예외는 실측(gootte 13장 +
 * jinwooauto 45장, 2026-08-11)에서 나온 관례 하나 — 헤딩 자체에 **"— 없음"** 이 딸려 있으면
 * (`access-control/03`·`06`, `authorship/02`) 캡틴이 이미 "필요 없다" 고 적어 두신 것이라 세지 않는다.
 */
function needsCaptainEyeFromTitle(content: string): boolean {
  for (const m of content.matchAll(H2_HEADING)) {
    const text = (m[1] ?? "").replace(CAPTAIN_EYE_DECORATION, "");
    if (!text.startsWith("캡틴 확인") && !text.startsWith("캡틴확인")) continue;
    return !text.includes("없음");
  }
  return false;
}

// `**캡틴 확인:** x` 와 `캡틴 확인: x` 둘 다 — Status:/Blocked by: 와 같은 관대함.
const CAPTAIN_EYE_LINE = /^[ \t]*(?:\*\*)?캡틴 확인:(?:\*\*)?[ \t]*(.*)$/m;
// "필요 없음" 이 먼저 — "필요" 의 접두라 순서를 바꾸면 절대 안 걸린다.
const CAPTAIN_EYE_NOT_NEEDED = /^필요\s*없음(?:[\p{S}\p{P}\s]|$)/u;
const CAPTAIN_EYE_NEEDED = /^필요(?:[\p{S}\p{P}\s]|$)/u;
const CAPTAIN_EYE_DONE = /^완료(?:[\p{S}\p{P}\s]|$)/u;

/** `**캡틴 확인:**` 표시 줄에서 읽어낸 것. 값을 못 알아봐도 원문은 버리지 않는다. */
export interface CaptainEyeLine {
  /** 원문 verbatim(값 토큰만, `—` 뒤 자유 문구는 안 싣는다). 줄이 아예 없으면 null. */
  raw: string | null;
  /** 알아본 값이면 그 값, 못 알아봤거나 줄이 없으면 null. */
  known: boolean;
  /** 알아본 값이 말하는 뜻. 못 알아봤으면 null — 지어내지 않는다. */
  needsCaptainEye: boolean | null;
}

/**
 * `**캡틴 확인:** 필요 — <자유 문구>` 줄 파싱(캡틴 결정 2026-08-14, INV-E3) — **앞의 한 낱말**(필요·
 * 필요 없음·완료)만 기계가 읽고, `—` 뒤는 사람 몫이라 안 읽는다. `Status:` 줄과 같은 원리로 값
 * 토큰만 뽑는다.
 */
export function parseCaptainEyeLine(content: string): CaptainEyeLine {
  const rest = CAPTAIN_EYE_LINE.exec(content)?.[1]?.trim();
  if (!rest) return { raw: null, known: false, needsCaptainEye: null };
  // 값 토큰만 raw 에 싣는다(Status: 줄과 같은 원리) — `—` 뒤 자유 문구·괄호 날짜는 안 싣는다.
  if (CAPTAIN_EYE_NOT_NEEDED.test(rest)) return { raw: "필요 없음", known: true, needsCaptainEye: false };
  if (CAPTAIN_EYE_NEEDED.test(rest)) return { raw: "필요", known: true, needsCaptainEye: true };
  if (CAPTAIN_EYE_DONE.test(rest)) return { raw: "완료", known: true, needsCaptainEye: false };
  // 🔴 못 알아본 값을 조용히 버리지 않는다 — 이 경우만 원문 전체를 raw 에 싣는다.
  return { raw: rest, known: false, needsCaptainEye: null };
}

/**
 * 캡틴 눈 판정 — 판정 자리는 하나다(INV-E1). 표시 줄이 있고 알아본 값이면 그 값이 제목보다
 * 세다(INV-E2). 줄이 없거나 못 알아봤으면 오늘 그대로 제목을 읽는다 — 이미 있는 티켓 137장은
 * 표시 줄이 없어 전부 이 폴백을 그대로 탄다(캡틴 결정 2026-08-14, "앞으로만 잘하자").
 */
export function parseNeedsCaptainEye(content: string): boolean {
  const line = parseCaptainEyeLine(content);
  if (line.known) return line.needsCaptainEye as boolean;
  return needsCaptainEyeFromTitle(content);
}

/** 파일 한 장에서 읽어낸 티켓(막힘 해제는 아직 계산 전 — 그건 같은 기능의 다른 티켓을 알아야 한다). */
export interface TicketDoc {
  num: string;
  slug: string;
  /** 기능 폴더 기준 상대 경로("issues/01-x.md") — `fileName` 은 언제나 `issues/` 안의 파일이다. */
  path: string;
  title: string;
  status: TodoStatus;
  sourceStatus: string | null;
  statusKnown: boolean;
  completedAt: string | null;
  blockedBy: string[];
  /**
   * `Blocked by:` 에서 번호도 "없음" 도 없는 산문 — verbatim(감추지 않는다). `blockedBy` 에도
   * 같은 값이 실려 막힘으로 세어진다(development-order/17) — 여기 있는 것은 그 막힘이 번호가
   * 없어 저절로 안 풀린다는 사실을 드러내기 위한 것이다.
   */
  unreadableBlockedBy: string[];
  /** `## 캡틴 확인` 절이 있는가(development-order/15 ②). */
  needsCaptainEye: boolean;
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
    path: `issues/${fileName}`,
    title: heading(content)?.replace(TITLE_NUM_PREFIX, "").trim() || slug,
    status: mapFirstmateStatus(value),
    sourceStatus: raw,
    statusKnown: value !== null,
    completedAt,
    blockedBy,
    unreadableBlockedBy: unreadable,
    needsCaptainEye: parseNeedsCaptainEye(content),
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
