import type {
  Feature,
  FeatureTicket,
  InProgressSummary,
  UnreadableCopy,
} from "@gootte/contract";
import { allTickets, sortFeatures } from "./features";

/**
 * "지금 붙들려 있는 일" 계산 — 순수(INV-4). 입력은 **격리 사본 관측 결과**지 문서가 아니다.
 * 정규 여덟 값에 처리중이 없는 것은 결함이 아니라 설계다 — 그 사실은 파일에 적을 것이 아니라
 * 관측할 것이고, 관측한 것을 파일에 되쓰지도 않는다(INV-1·INV-2).
 *
 * 🔴 옛 `unknown`(티켓 미상)·`unclaimed`(임자 없음) 분류는 git 제거(time-records)와 함께
 * 삭제됐다 — 사본↔티켓 연결의 유일한 근거가 "커밋이 건드린 티켓 파일"이었는데, git 하위프로세스
 * 제거(T01)로 `touched` 가 항상 빈 배열이 되어 **모든 작업 사본이 미상, 모든 claimed 티켓이
 * 임자 없음** 으로 발화하는 순수 오분류가 됐다(캡틴 지시 2026-09-09). 임자의 유일한 증거는
 * Time 기록이고(ADR 0001) 그것은 티켓 쪽 `in_progress` 로 이미 표시된다.
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
  /** 작업 가지 이름. git 제거로 항상 "" — 계약 호환을 위해 남아 있다. */
  branch: string;
  /** 옛 git 관측의 흔적 — 항상 빈 배열. 사본↔티켓 연결은 Time 기록이 갖는다(ADR 0001). */
  touched: string[];
}

/** 사본 뿌리 한 번의 스캔 결과. 뿌리가 없어도 예외가 아니라 `rootExists:false` 다. */
export interface CopyScan {
  root: string;
  rootExists: boolean;
  copies: ObservedCopy[];
}

const key = (feature: string, slug: string): string => `${feature}/${slug}`;

function markTicket(ticket: FeatureTicket): FeatureTicket {
  // 끝나거나 취소된 티켓은 처리중이 되지 않는다.
  if (ticket.status === "done" || ticket.status === "dropped") return ticket;
  // 🔴 처리중은 **Time 기록(started=, 완료 없음)** 으로만 판정한다(ADR 0001 —
  // work-claims-its-ticket/02, 캡틴 2026-09-02). 브랜치가 티켓 파일을 건드렸다고 해서
  // 자동으로 처리중이 되지 않는다 — 한 worktree 가 여러 티켓 파일을 건드리면 전부 처리중이
  // 되어 "실제로 무엇을 작업하고 있는지" 를 못 본다(실제 결함: studio-function-authoring-ux/T02).
  if (!ticket.startedAt || ticket.finishedAt) return ticket;
  return { ...ticket, status: "in_progress" };
}

/**
 * 할일 목록 + 사본 관측 → 처리중이 표시된 목록과 요약.
 *
 * - 사본이 **작업 가지 위에 있으면** 작업중, detached 면 유휴(F7).
 * - 🔴 **임자의 유일한 증거는 Time 기록이다**(ADR 0001) — 티켓 쪽 `in_progress` 로 표시된다.
 *   사본↔티켓 연결(옛 `unknown`·`unclaimed`)은 git 커밋 관측이 근거였고 git 제거로 소멸했다.
 * - 🔴 **상태를 못 읽은 사본도 감추지 않는다** — `unreadable` 로 센다. 읽기 실패를 유휴로 접으면
 *   "아무도 안 붙들었다" 는 거짓말이 된다.
 * - 🔴 **반환하는 `features` 는 이미 정렬돼 있다**(`sortFeatures`, 티켓 03) — 처리중이 얹혀야
 *   비로소 무리 안에서 누가 위로 오는지 정해지므로, 여기가 사실이 다 모이는 자리이자 정렬하는
 *   유일한 자리다. `readFeatures` 는 정렬하지 않는다.
 */
export function applyInProgress(
  features: readonly Feature[],
  scan: CopyScan,
): { features: Feature[]; inProgress: InProgressSummary } {
  const unreadable: UnreadableCopy[] = [];
  let working = 0;

  for (const copy of scan.copies) {
    if (copy.state === "idle") continue;
    if (copy.state !== "working") {
      unreadable.push({ slug: copy.slug, path: copy.path, reason: copy.state });
      continue;
    }
    working += 1;
  }

  let tickets = 0;
  const marked = features.map((f) => {
    const mark = (t: FeatureTicket): FeatureTicket => {
      const next = markTicket(t);
      if (next.status === "in_progress") tickets += 1;
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
      unreadable,
    },
  };
}
