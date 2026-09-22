import type { TicketTimeRecord } from "@gootte/contract";

/**
 * 티켓 시간 레코드 키 — `<기능 슬러그>/<티켓 슬러그>` 형태.
 * 기존 @gootte/core의 timeRecordKey와 동일한 동작.
 */
export function timeRecordKey(feature: string, ticket: string): string {
  return `${feature}/${ticket}`;
}

/**
 * 기능 목록에 시간 레코드를 조인 — 순수·결정적 함수.
 * records가 없으면 모든 티켓을 pending으로 정규화.
 * records가 있으면 레코드가 권위.
 */
export function applyTimeRecords(
  features: readonly import("@gootte/contract").Feature[],
  records: Readonly<Record<string, TicketTimeRecord>>,
): import("@gootte/contract").Feature[] {
  return features.map((f) => {
    const tickets = f.tickets.map((t) => {
      const key = timeRecordKey(f.slug, t.slug);
      const rec = records[key];
      if (!rec) return resetTicket(t);
      return joinedTicket(t, rec);
    });
    const newTickets = f.newTickets?.map((t) => {
      const key = timeRecordKey(f.slug, t.slug);
      const rec = records[key];
      if (!rec) return resetTicket(t);
      return joinedTicket(t, rec);
    });
    return { ...f, tickets, ...(newTickets ? { newTickets } : {}) };
  });
}

function joinedTicket(
  t: import("@gootte/contract").FeatureTicket,
  rec: TicketTimeRecord,
): import("@gootte/contract").FeatureTicket {
  const times = {
    startedAt: rec.startedAt ?? undefined,
    finishedAt: rec.finishedAt ?? undefined,
    pauses: rec.pauses.map((p) => ({ pausedAt: p.pausedAt, resumedAt: p.resumedAt })),
  };

  if (rec.finishedAt !== null && rec.statusRaw !== "wontfix") {
    return { ...t, ...times, status: "done", sourceStatus: null, statusKnown: true, completedAt: rec.finishedAt };
  }
  if (rec.startedAt !== null && rec.statusRaw !== "wontfix") {
    return { ...t, ...times, status: "in_progress", sourceStatus: null, statusKnown: true, completedAt: undefined };
  }
  if (rec.statusRaw !== null) {
    return {
      ...t, ...times,
      status: mapStatus(rec.statusRaw),
      sourceStatus: rec.statusRaw,
      statusKnown: true,
      completedAt: undefined,
    };
  }
  return { ...t, ...times, status: "pending", sourceStatus: null, statusKnown: true, completedAt: undefined };
}

function resetTicket(
  t: import("@gootte/contract").FeatureTicket,
): import("@gootte/contract").FeatureTicket {
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

function mapStatus(statusRaw: string): import("@gootte/contract").TodoStatus {
  if (statusRaw === "resolved" || statusRaw === "done") return "done";
  if (statusRaw === "wontfix") return "dropped";
  if (statusRaw === "blocked" || statusRaw === "ready-for-agent" || statusRaw === "ready-for-human") return "pending";
  return "pending";
}
