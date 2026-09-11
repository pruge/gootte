import type { Feature, FeatureTicket, TicketTimeRecord } from "@gootte/contract";
import { mapFirstmateStatus, parseStatusLine } from "../parse/feature";

/**
 * 티켓 시간·상태 레코드(`state.json` v2 `tickets` 맵)를 기능 목록에 얹는 조인 —
 * 순수·결정적(INV-4). `applyInProgress`·`finalizeFeatureStatus`와 같은 패턴이다.
 *
 * 🔴 **이 함수를 부른다는 것 자체가 "이 프로젝트는 레코드가 권위다"(v2 모드)라는 뜻이다**
 * (time-records-to-state-store D2 — 모드는 프로젝트 단위로 이분법). 그래서:
 * - 레코드가 **있으면** MD 파싱값을 이긴다 — MD `Time:`/`Status:` 줄은 이 모드에서 무시된다
 *   (이중 SoT 금지 — cancel 뒤의 낡은 MD 줄이 되살아나지 않게).
 * - 레코드가 **없으면** 미시작 pending으로 정규화한다 — "MD에 있지만 레코드에 없는 값"은
 *   이관이 놓친 것이 아니라 "없다"가 정답이다(migrate-time이 전수 이관을 검증한다).
 * 폴백 프로젝트(v2 없음)는 이 함수를 아예 부르지 않는다 — 호출부(`readFeaturesWithTime`)가 모드를 판정한다.
 *
 * 상태 판정 우선순위(joinedTicket) — Time 기록이 정본, statusRaw 는 시각이 말해주지
 * 않는 티켓의 분류만:
 * 1. `finishedAt` → **done**(완료의 단일 출처 — 어떤 statusRaw 값도 이기지 못한다)
 * 2. `startedAt` → **in_progress**(처리중은 Time 기록으로만, ADR 0001)
 * 3. `statusRaw` → `parseStatusLine` → `mapFirstmateStatus`(미착수 분류: wontfix→dropped,
 *    resolved→done, blocked/ready-*→pending, 미인식→경고)
 * 4. 레코드 전부 null → pending(미시작, 아는 상태)
 * 예외는 wontfix 하나 — 취소 선언이 계산을 이긴다(T02 D3), finished 가 있어도 dropped.
 */

/** 키 규약 — `<기능 슬러그>/<티켓 슬러그>`("auth/01-session"). 파일명 basename이 티켓 슬러그다(F3). */
export function timeRecordKey(feature: string, ticket: string): string {
  return `${feature}/${ticket}`;
}

function joinedTicket(t: FeatureTicket, rec: TicketTimeRecord): FeatureTicket {
  const times = {
    startedAt: rec.startedAt ?? undefined,
    finishedAt: rec.finishedAt ?? undefined,
    pauses: rec.pauses.map((p) => ({ pausedAt: p.pausedAt, resumedAt: p.resumedAt })),
  };
  const statusLine = rec.statusRaw !== null
    ? parseStatusLine(`**Status:** ${rec.statusRaw}`)
    : null;

  // 🔴 **finishedAt 이 정본이다**(실제 결함 2026-09-09, jinwooauto 캡틴 보고 — v2 상태 분류가
  // finished 를 무시하고 stale statusRaw 로 완료 티켓을 pending 으로 오분류). 규칙(issue-tracker):
  // "완료는 finished= 로 읽는다, 어떤 Status 값도 아니다" — finishedAt 이 있으면 **done 으로
  // 확정**한다. statusRaw 가 'open'·미인식·bare 'done' 이어도, migrate 가 옛 MD 줄을 그대로
  // 옮겨온 stale 원문이 이걸 가리면 안 된다. 예외는 wontfix 하나뿐(D3 — 취소 선언이 계산을
  // 이긴다): 폐기된 티켓은 finished 가 있어도 dropped 로 남는다.
  if (rec.finishedAt !== null && statusLine?.value !== "wontfix") {
    return {
      ...t,
      ...times,
      status: "done",
      sourceStatus: null,
      statusKnown: true,
      completedAt: rec.finishedAt,
    };
  }
  // 🔴 startedAt 도 같은 우선순위다 — 시작 기록이 있으면 stale statusRaw 가 pending 으로
  // 되돌리지 않는다(jinwooauto 'open' 원문이 처리중 티켓을 pending 으로 깎는 같은 결함).
  // 예외는 wontfix(D3) — 폐기 선언은 진행 중이어도 유지된다.
  if (rec.startedAt !== null && statusLine?.value !== "wontfix") {
    return {
      ...t,
      ...times,
      status: "in_progress",
      sourceStatus: null,
      statusKnown: true,
      completedAt: undefined,
    };
  }
  if (statusLine !== null) {
    // 시각 기록이 없는 티켓 — statusRaw 가 분류의 유일한 근거다(미착수·대기·폐기).
    // statusRaw 는 옛 `Status:` 줄과 동일 verbatim — 같은 파서로 해석한다(INV-4 릴레이).
    return {
      ...t,
      ...times,
      status: mapFirstmateStatus(statusLine.value),
      sourceStatus: statusLine.raw,
      statusKnown: statusLine.value !== null,
      completedAt: statusLine.completedAt ?? undefined,
    };
  }
  // statusRaw 없음 — 미시작 pending(레코드의 "없다"는 값). statusKnown 은 **참**이다 —
  // 아는 상태다. MD 모드 parseNewTicket 이 Time: 줄 없는 신관례 티켓을 statusKnown=true 로
  // 세는 것과 같아야 한다(회귀 가드: false 로 두면 v2 프로젝트의 모든 신관례 티켓에
  // "상태 줄 없음" 경고가 뜬다 — 실제 결함 2026-09-09, 캡틴 보고).
  return {
    ...t,
    ...times,
    status: "pending",
    sourceStatus: null,
    statusKnown: true,
    completedAt: undefined,
  };
}

export function applyTimeRecords(
  features: readonly Feature[],
  records: Readonly<Record<string, TicketTimeRecord>>,
): Feature[] {
  return features.map((f) => {
    const tickets = f.tickets.map((t) => {
      const rec = records[timeRecordKey(f.slug, t.slug)];
      return rec ? joinedTicket(t, rec) : resetTicket(t);
    });
    const newTickets = f.newTickets?.map((t) => {
      const rec = records[timeRecordKey(f.slug, t.slug)];
      return rec ? joinedTicket(t, rec) : resetTicket(t);
    });
    return { ...f, tickets, ...(newTickets ? { newTickets } : {}) };
  });
}

/** 레코드 없는 티켓의 정규화 — 권위 모드에서 "없다"는 값이다. 지어내지 않는다(INV-4).
 * 🔴 statusKnown 은 **참**이다 — 레코드 부재 = "미시작" 이라는 **아는** 상태다(v2 가 권위,
 * D2). MD 모드 parseNewTicket 도 Time: 줄 없는 신관례 티켓을 statusKnown=true 로 세서
 * 경고를 안 띄웠다 — 그것이 회귀 기준이다. "상태 줄 없음" 경고는 알 수 없는 원문
 * (statusRaw 가 아홉 값 밖)에만 뜬다. */
function resetTicket(t: FeatureTicket): FeatureTicket {
  return {
    ...t,
    status: "pending",
    sourceStatus: null,
    statusKnown: true,
    completedAt: undefined,
    startedAt: undefined,
    finishedAt: undefined,
    pauses: undefined,
  };
}
