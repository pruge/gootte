import type {
  Feature,
  FeatureTicket,
  InProgressSummary,
  UnclaimedTicket,
  UnmappedWork,
  UnreadableCopy,
} from "@gootte/contract";
import { parseTicketPath } from "../parse/ticket-path";
import { allTickets, sortFeatures } from "./features";

/**
 * "지금 붙들려 있는 일" 계산 — 순수(INV-4). 입력은 **격리 사본 관측 결과**지 문서가 아니다.
 * 정규 여덟 값에 처리중이 없는 것은 결함이 아니라 설계다 — 그 사실은 파일에 적을 것이 아니라
 * 관측할 것이고, 관측한 것을 파일에 되쓰지도 않는다(INV-1·INV-2).
 */

/**
 * 사본 하나의 상태. 🔴 **"모른다" 가 "유휴" 와 다른 값이라는 것이 요점이다** —
 * 둘을 한 값으로 합치는 순간 읽기 실패가 "아무도 안 붙들었다" 로 둔갑한다.
 */
export type CopyState =
  | "working" // 작업 가지 위 — 확인됨
  | "idle" // detached — 확인됨
  | "no-repo" // 슬롯에서 저장소를 못 찾음
  | "git-failed"; // git 이 답하지 않음

/** 격리 사본 하나에서 관측한 날것. core-io 가 채우고 해석은 여기서 한다(계층 경계). */
export interface ObservedCopy {
  /** `<풀>/<슬롯>` — 사람이 찾아갈 수 있는 식별자. */
  slug: string;
  path: string;
  state: CopyState;
  /** 작업 가지 이름. `state === "working"` 일 때만 값이 있다. */
  branch: string;
  /** 그 브랜치의 커밋이 건드린 경로(저장소 루트 기준). 그 외 상태는 빈 배열. */
  touched: string[];
}

/** 사본 뿌리 한 번의 스캔 결과. 뿌리가 없어도 예외가 아니라 `rootExists:false` 다. */
export interface CopyScan {
  root: string;
  rootExists: boolean;
  copies: ObservedCopy[];
}

const key = (feature: string, slug: string): string => `${feature}/${slug}`;

/** 이 사본이 붙들고 있는 티켓 키 — **목록에 실제로 있는 티켓만**. 중복은 한 번. */
function heldTickets(copy: ObservedCopy, known: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const path of copy.touched) {
    const ref = parseTicketPath(path);
    if (!ref) continue;
    const k = key(ref.feature, ref.slug);
    if (known.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

function markTicket(ticket: FeatureTicket, branches: readonly string[]): FeatureTicket {
  // 끝나거나 취소된 티켓은 상태만 지키는 것으로 부족하다 — 붙들린 가지도 싣지 않는다.
  // 값이 실려 있으면 줄이 그걸로 처리중을 그린다(사양 §설계 1).
  if (ticket.status === "done" || ticket.status === "dropped") return ticket;
  if (branches.length === 0) return ticket;
  return { ...ticket, status: "in_progress", workedBy: [...branches] };
}

/**
 * 할일 목록 + 사본 관측 → 처리중이 표시된 목록과 요약.
 *
 * - 사본이 **작업 가지 위에 있으면** 작업중, detached 면 유휴(F7).
 * - 그 작업이 어느 티켓인지는 **그 가지의 커밋이 건드린 티켓 파일**로만 잇는다(결정 Q1 = 안 B).
 * - 🔴 **이어지지 않은 작업중 사본은 감추지 않는다** — `unknown` 에 그대로 실어 "티켓 미상 · 작업중"
 *   으로 세어진다. 조용히 삼키면 화면이 "아무도 아무것도 안 하는 중" 이라고 거짓말한다.
 * - 🔴 **상태를 못 읽은 사본도 감추지 않는다** — `unreadable` 로 센다. 읽기 실패를 유휴로 접으면
 *   같은 거짓말이 되고, 그쪽은 `unknown` 과 달리 세어지지도 않아 더 조용히 사라진다.
 * - 한 티켓을 두 사본이 붙들어도 **티켓은 하나로 센다**. 두 브랜치는 `workedBy` 에 나란히 실린다.
 * - 🔴 **문서가 `claimed` 라고 말하는데 붙든 사본이 없으면** 처리중으로 그리지 않고, 대신 `unclaimed`
 *   에 실어 감추지 않는다 — 지우다 만 흔적이지 진행 중이 아니다(work-claims-its-ticket/01 §D).
 * - 🔴 **반환하는 `features` 는 이미 정렬돼 있다**(`sortFeatures`, 티켓 03) — 처리중이 얹혀야
 *   비로소 무리 안에서 누가 위로 오는지 정해지므로, 여기가 사실이 다 모이는 자리이자 정렬하는
 *   유일한 자리다. `readFeatures` 는 정렬하지 않는다.
 */
export function applyInProgress(
  features: readonly Feature[],
  scan: CopyScan,
): { features: Feature[]; inProgress: InProgressSummary } {
  const known = new Set<string>();
  // 🔴 두 관례 다 본다(실제 결함 2026-08) — 옛 관례만 세던 시절엔 신관례 티켓을 건드린 작업이
  // 무조건 '티켓 미상'으로 세어졌다.
  for (const f of features) for (const t of allTickets(f)) known.add(key(f.slug, t.slug));

  const branchesByTicket = new Map<string, string[]>();
  const unknown: UnmappedWork[] = [];
  const unreadable: UnreadableCopy[] = [];
  let working = 0;

  for (const copy of scan.copies) {
    if (copy.state === "idle") continue;
    if (copy.state !== "working") {
      unreadable.push({ slug: copy.slug, path: copy.path, reason: copy.state });
      continue;
    }
    working += 1;
    const held = heldTickets(copy, known);
    if (held.length === 0) {
      unknown.push({ slug: copy.slug, branch: copy.branch, path: copy.path });
      continue;
    }
    for (const k of held) {
      const branches = branchesByTicket.get(k) ?? [];
      if (!branches.includes(copy.branch)) branches.push(copy.branch);
      branchesByTicket.set(k, branches);
    }
  }

  let tickets = 0;
  const unclaimed: UnclaimedTicket[] = [];
  const marked = features.map((f) => {
    // 두 관례를 같은 함수로 심는다 — 신관례 티켓도 처리중이 되고 workedBy 를 실린다.
    // 'claimed 인데 사본 없음' 판정은 옛 관례의 원문 상태에서만 걸린다(신관례 sourceStatus 는
    // 백로그 SoT 앞에서 늘 null 이다).
    const mark = (t: FeatureTicket): FeatureTicket => {
      const next = markTicket(t, branchesByTicket.get(key(f.slug, t.slug)) ?? []);
      if (next.status === "in_progress") tickets += 1;
      else if (t.sourceStatus === "claimed") {
        unclaimed.push({ feature: f.slug, ticket: t.slug, title: t.title });
      }
      return next;
    };
    return {
      ...f,
      tickets: f.tickets.map(mark),
      newTickets: f.newTickets?.map(mark),
    };
  });

  // 정렬은 여기서 한 번만 일어난다(티켓 03) — `marked` 라야 처리중이 실려 있다.
  // `features`(입력, 문서만 본 순서)는 아직 처리중을 모르니 여기가 그 사실이 다 모이는 자리다.
  return {
    features: sortFeatures(marked),
    inProgress: {
      root: scan.root,
      rootExists: scan.rootExists,
      copies: scan.copies.length,
      working,
      tickets,
      unknown,
      unreadable,
      unclaimed,
    },
  };
}
