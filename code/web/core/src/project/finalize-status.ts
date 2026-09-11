import type { Feature, FeatureTicket, TodoStatus } from "@gootte/contract";
import { featureNums, hasOpenWork, resolveWaitingOn, type CrossFeatureIndex } from "./features";
import { elapsedPhrase } from "../parse/elapsed";

/**
 * 기능 목록의 최종 상태 확정 — 백로그 제거(memory-diet-drop-backlog T02) 뒤의 판정 자리.
 *
 * 신관례(`tickets/T<NN>.md`) 티켓 상태의 단일 출처는 티켓 문서다:
 * 명시 `Status:` 줄 → `Time:` 줄(`finishedAt`/`startedAt`) → 문서 의존(`Blocked by`/`Depends on`).
 * 백로그 시절의 빈 목록 조인과 같은 값을 낸다(동등성은 제거 전 characterization 테스트로 입증,
 * `finalize-status.test.ts` 가 거동을 잠근다).
 * 순수·결정적(INV-4), 어디에도 저장하지 않는다(INV-1).
 */

function finalizeTicket(ticket: FeatureTicket, now: string): FeatureTicket {
  // 🔴 문서에 명시 상태(`Status: resolved`/`wontfix`)가 있으면 **그것이 출처**(문서가 SoT).
  if (ticket.sourceStatus !== null) {
    const elapsed = ticket.startedAt ? elapsedPhrase(ticket.startedAt, ticket.finishedAt, now, ticket.pauses) : undefined;
    return { ...ticket, joinFailed: false, ...(elapsed ? { elapsed } : {}) };
  }
  // 🔴 완료(done) 단일 출처 = 티켓 문서의 `Time:` 줄 `finishedAt`.
  if (ticket.finishedAt) {
    const elapsed = ticket.startedAt ? elapsedPhrase(ticket.startedAt, ticket.finishedAt, now, ticket.pauses) : undefined;
    return { ...ticket, status: "done", joinFailed: false, waitingOn: [], ...(elapsed ? { elapsed } : {}) };
  }
  // `finishedAt` 이 없고 `startedAt` 만 있으면 in_progress.
  if (ticket.startedAt) {
    const elapsed = elapsedPhrase(ticket.startedAt, ticket.finishedAt, now, ticket.pauses);
    return { ...ticket, status: "in_progress", joinFailed: false, ...(elapsed ? { elapsed } : {}) };
  }
  // `Time:` 줄도 `Status:` 줄도 없으면 문서 자체로 상태를 안다 — 막히지 않은 티켓은 착수 가능,
  // 막힌 티켓은 대기로 본다. `ticket` 은 toNewTicket 에서 이미 status="pending"·startable 로 세팅돼 있다.
  return { ...ticket, joinFailed: false };
}

// ── 머리글 배지 파생(the-header-agrees-with-its-tickets/T01) ───────────────────

interface FeatureHeaderBadge {
  status: TodoStatus;
  sourceStatus: string;
  statusKnown: true;
}

/** 신관례 티켓 무리 → 머리글 배지. 구관례(빈 목록)는 null — 배지를 띄우지 않는다. */
function deriveHeaderBadge(tickets: readonly FeatureTicket[]): FeatureHeaderBadge | null {
  if (tickets.length === 0) return null; // 구관례 — 문서가 SoT, 지금 그대로(D2)
  if (tickets.some((t) => t.status === "in_progress"))
    return { status: "in_progress", sourceStatus: "처리중", statusKnown: true };
  if (!hasOpenWork(tickets)) return { status: "done", sourceStatus: "완료", statusKnown: true };
  return { status: "pending", sourceStatus: "남음", statusKnown: true };
}

/**
 * 기능 목록에 최종 상태를 얹는다 — `buildFeatures` 뒤, 서빙 직전에 거는 한 단계.
 *
 * 구관례(`issues/`) 티켓에 gootte 가 기록한 `Time:` 줄이 있으면 elapsed 를 얹는다 —
 * 상태 SoT 는 여전히 문서 `Status:` 줄이라 판정은 건드리지 않고 표시용 시각만 계산(INV-3).
 * 마지막에 신관례 기능의 머리글 배지를 티켓 상태에서 다시 파생한다 — 대기 재계산이 끝난
 * 뒤라야 배지가 본 네 수와 같은 입력을 보는 순서다(INV-3).
 * 명시적 취소(`Status: wontfix`)가 계산을 이긴다 — 취소는 티켓까지 내려간다(아직 안 끝난
 * 신관례 티켓은 dropped, 이미 done 인 티켓은 done 으로 남는다).
 */
export function finalizeFeatureStatus(
  features: readonly Feature[],
  now: string = new Date().toISOString(),
): Feature[] {
  const finalized = features.map((f) => ({
    ...f,
    tickets: (f.tickets ?? []).map((t) => {
      if (!t.startedAt) return t;
      const elapsed = elapsedPhrase(t.startedAt, t.finishedAt, now, t.pauses);
      return elapsed ? { ...t, elapsed } : t;
    }),
    newTickets: (f.newTickets ?? []).map((t) => finalizeTicket(t, now)),
  }));
  // 🔴 상태가 바뀌었으니 신관례 티켓의 대기·착수 가능도 **다시** 계산한다(INV-3).
  const index: CrossFeatureIndex = new Map(
    finalized.map((f) => [f.slug, featureNums([...f.tickets, ...(f.newTickets ?? [])])]),
  );
  return finalized.map((f) => {
    const cancelled = f.status === "dropped" && f.statusKnown;
    const nums = index.get(f.slug);
    const rejudged = !nums
      ? f
      : {
          ...f,
          newTickets: (f.newTickets ?? []).map((t) => {
            const waiting = resolveWaitingOn(t.blockedBy, nums.done, index);
            return { ...t, waitingOn: waiting, startable: waiting.length === 0 };
          }),
        };
    const newTickets = rejudged.newTickets ?? [];
    if (newTickets.length === 0) return rejudged; // 구관례·티켓 없음 — 지금 그대로(D2)
    if (cancelled)
      return {
        ...rejudged,
        status: "dropped",
        sourceStatus: "취소",
        statusKnown: true,
        newTickets: newTickets.map((t) =>
          t.status === "done"
            ? { ...t, joinFailed: false }
            : { ...t, status: "dropped", startable: false, joinFailed: false },
        ),
      };
    const badge = deriveHeaderBadge(newTickets);
    return badge ? { ...rejudged, ...badge } : { ...rejudged, sourceStatus: null, statusKnown: false };
  });
}
