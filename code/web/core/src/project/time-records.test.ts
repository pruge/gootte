import { describe, expect, test } from "vitest";
import type { Feature, FeatureTicket, TicketTimeRecord } from "@gootte/contract";
import { applyTimeRecords, timeRecordKey } from "./time-records";

/**
 * 레코드 조인(time-records-to-state-store/T02) — 레코드가 권위다(D2).
 * 폴백 모드(레코드 없는 프로젝트)는 이 함수를 부르지 않으므로
 * 여기서 잡는 것은 "권위 모드에서의 정규화"가 옳은가다.
 */

const ticket = (overrides: Partial<FeatureTicket> = {}): FeatureTicket => ({
  num: "01",
  slug: "T01",
  path: "tickets/T01.md",
  title: "티켓 01",
  status: "done", // MD 파싱이 이렇게 말했다 친다 — 레코드가 이기는지 보는 시드
  sourceStatus: "resolved (2026-08-01)",
  statusKnown: true,
  completedAt: "2026-08-01",
  blockedBy: [],
  unreadableBlockedBy: [],
  waitingOn: [],
  startable: true,
  needsCaptainEye: false,
  startedAt: "2026-07-01T09:00:00+09:00", // MD Time: 줄의 흔적 — 레코드가 이기면 사라진다
  finishedAt: "2026-07-02T18:00:00+09:00",
  ...overrides,
});

const feature = (slug: string, tickets: FeatureTicket[], newTickets?: FeatureTicket[]): Feature => ({
  slug,
  title: `${slug} — 제목`,
  status: "pending",
  sourceStatus: "ready-for-agent",
  statusKnown: true,
  docs: [],
  tickets,
  ...(newTickets ? { newTickets } : {}),
});

const rec = (overrides: Partial<TicketTimeRecord> = {}): TicketTimeRecord => ({
  startedAt: null,
  finishedAt: null,
  pauses: [],
  statusRaw: null,
  ...overrides,
});

describe("applyTimeRecords — 레코드가 권위다(D2)", () => {
  test("레코드가 있으면 MD 파싱값(시드의 resolved 흔적)을 이긴다 — startedAt/finishedAt/pauses", () => {
    const out = applyTimeRecords([feature("auth", [ticket()])], {
      "auth/T01": rec({
        startedAt: "2026-09-09T09:00:00+09:00",
        finishedAt: "2026-09-09T10:00:00+09:00",
        pauses: [{ pausedAt: "2026-09-09T09:30:00+09:00", resumedAt: "2026-09-09T09:40:00+09:00" }],
      }),
    });
    const t = out[0]!.tickets[0]!;
    expect(t.startedAt).toBe("2026-09-09T09:00:00+09:00");
    expect(t.finishedAt).toBe("2026-09-09T10:00:00+09:00");
    expect(t.pauses).toEqual([{ pausedAt: "2026-09-09T09:30:00+09:00", resumedAt: "2026-09-09T09:40:00+09:00" }]);
  });

  test("statusRaw verbatim → parseStatusLine 경유 해석 — done + completedAt + sourceStatus", () => {
    const out = applyTimeRecords([feature("auth", [ticket()])], {
      "auth/T01": rec({ statusRaw: "resolved (2026-09-09)" }),
    });
    const t = out[0]!.tickets[0]!;
    expect(t.status).toBe("done");
    expect(t.sourceStatus).toBe("resolved");
    expect(t.statusKnown).toBe(true);
    expect(t.completedAt).toBe("2026-09-09");
  });

  test("wontfix 원문도 같은 어휘로 — dropped(새 어휘 없음)", () => {
    const out = applyTimeRecords([feature("auth", [ticket()])], {
      "auth/T01": rec({ statusRaw: "wontfix (2026-09-01)" }),
    });
    expect(out[0]!.tickets[0]!.status).toBe("dropped");
  });

  test("statusRaw 없이 started 만 — in_progress 로 파생(parseNewTicket 과 같은 규칙)", () => {
    const out = applyTimeRecords([feature("auth", [ticket()])], {
      "auth/T01": rec({ startedAt: "2026-09-09T09:00:00+09:00" }),
    });
    const t = out[0]!.tickets[0]!;
    expect(t.status).toBe("in_progress");
    // 🔴 파생했으므로 상태를 안다 — MD 모드 parseNewTicket 과 동일(statusKnown=true).
    // false 면 v2 프로젝트의 신관례 티켓 전부에 "상태 줄 없음" 경고가 뜬다(실제 결함 2026-09-09).
    expect(t.statusKnown).toBe(true);
    expect(t.sourceStatus).toBeNull();
    expect(t.completedAt).toBeUndefined();
  });

  test("statusRaw 없이 finished 만 — done + completedAt=finishedAt", () => {
    const out = applyTimeRecords([feature("auth", [ticket()])], {
      "auth/T01": rec({ startedAt: "2026-09-09T09:00:00+09:00", finishedAt: "2026-09-09T10:00:00+09:00" }),
    });
    const t = out[0]!.tickets[0]!;
    expect(t.status).toBe("done");
    expect(t.completedAt).toBe("2026-09-09T10:00:00+09:00");
  });

  test("레코드 없는 티켓은 미시작 pending 으로 정규화 — 낡은 MD 줄이 되살아나지 않는다", () => {
    const out = applyTimeRecords([feature("auth", [ticket()])], {});
    const t = out[0]!.tickets[0]!;
    expect(t.status).toBe("pending");
    expect(t.sourceStatus).toBeNull();
    // "없다"도 아는 상태다 — 경고("상태 줄 없음")가 뜨면 안 된다(실제 결함 2026-09-09).
    expect(t.statusKnown).toBe(true);
    expect(t.completedAt).toBeUndefined();
    expect(t.startedAt).toBeUndefined();
    expect(t.finishedAt).toBeUndefined();
    expect(t.pauses).toBeUndefined();
  });

  test("알 수 없는 statusRaw 원문만 경고가 뜬다 — sourceStatus verbatim(INV-4)", () => {
    const out = applyTimeRecords([feature("auth", [ticket()])], {
      "auth/T01": rec({ statusRaw: "진행중" }), // 아홉 값 밖
    });
    const t = out[0]!.tickets[0]!;
    expect(t.status).toBe("pending"); // mapFirstmateStatus(null)
    expect(t.statusKnown).toBe(false); // 못 알아봤다 — 경고 배지의 근거
    expect(t.sourceStatus).toBe("진행중"); // 원문은 감추지 않는다
  });

  // ── finished 가 정본이다(jinwooauto 캡틴 보고 2026-09-09, 버그 #2) ────────────
  describe("finishedAt > statusRaw — 완료의 단일 출처는 finished 이다", () => {
    test("stale 'open' 원문이 있어도 finished 면 done — pending 으로 오분류 금지", () => {
      // migrate 가 옛 MD 줄을 verbatim 으로 옮겨 statusRaw='open' 이 남은 완료 티켓들
      // (studio-query-cache/T01~ 등)이 pending 으로 떴던 실제 결함.
      const out = applyTimeRecords([feature("auth", [ticket()])], {
        "auth/T01": rec({
          startedAt: "2026-09-01T09:00:00+09:00",
          finishedAt: "2026-09-01T10:00:00+09:00",
          statusRaw: "open",
        }),
      });
      const t = out[0]!.tickets[0]!;
      expect(t.status).toBe("done");
      expect(t.completedAt).toBe("2026-09-01T10:00:00+09:00");
      expect(t.statusKnown).toBe(true);
      expect(t.sourceStatus).toBeNull(); // stale 원문은 승계하지 않는다
    });

    test("bare 'done' 원문도 finished 가 이긴다 — 시각이 없는 statusRaw 는 원문으로 남지 않는다", () => {
      const out = applyTimeRecords([feature("auth", [ticket()])], {
        "auth/T01": rec({ startedAt: "2026-09-01T09:00:00+09:00", finishedAt: "2026-09-01T10:00:00+09:00", statusRaw: "done" }),
      });
      const t = out[0]!.tickets[0]!;
      expect(t.status).toBe("done");
      expect(t.completedAt).toBe("2026-09-01T10:00:00+09:00");
    });

    test("예외 wontfix — 폐기 선언이 finished 를 이긴다(D3, 취소가 계산을 이긴다)", () => {
      const out = applyTimeRecords([feature("auth", [ticket()])], {
        "auth/T01": rec({
          startedAt: "2026-09-01T09:00:00+09:00",
          finishedAt: "2026-09-01T10:00:00+09:00",
          statusRaw: "wontfix (2026-09-01)",
        }),
      });
      expect(out[0]!.tickets[0]!.status).toBe("dropped");
    });

    test("stale 'open' + started 만(진행 중) — in_progress 로 파생, pending 으로 깎이지 않는다", () => {
      const out = applyTimeRecords([feature("auth", [ticket()])], {
        "auth/T01": rec({ startedAt: "2026-09-09T09:00:00+09:00", finishedAt: null, statusRaw: "open" }),
      });
      const t = out[0]!.tickets[0]!;
      expect(t.status).toBe("in_progress");
      expect(t.statusKnown).toBe(true);
    });

    test("finished 없는 blocked/ready-for-agent 원문은 그대로 pending 분류 — 미착수 티켓의 근거로만 쓴다", () => {
      const out = applyTimeRecords([feature("auth", [ticket()])], {
        "auth/T01": rec({ statusRaw: "blocked (상류 릴리스 대기)" }),
      });
      const t = out[0]!.tickets[0]!;
      expect(t.status).toBe("pending");
      expect(t.sourceStatus).toBe("blocked");
      expect(t.statusKnown).toBe(true); // 아홉 값 안이라 안다
      expect(t.startedAt).toBeUndefined();
    });
  });

  test("빈 레코드(전부 null)도 미시작 정규화 — cancel 의 흔적과 같은 값이다", () => {
    const out = applyTimeRecords([feature("auth", [ticket()])], { "auth/T01": rec() });
    const t = out[0]!.tickets[0]!;
    expect(t.status).toBe("pending");
    expect(t.startedAt).toBeUndefined();
    expect(t.finishedAt).toBeUndefined();
  });

  test("newTickets 도 같은 키 규약으로 조인한다", () => {
    const out = applyTimeRecords([feature("auth", [], [ticket({ slug: "T09", path: "tickets/T09.md" })])], {
      "auth/T09": rec({ startedAt: "2026-09-09T09:00:00+09:00" }),
    });
    expect(out[0]!.newTickets![0]!.status).toBe("in_progress");
  });

  test("timeRecordKey — <기능>/<티켓>", () => {
    expect(timeRecordKey("time-records-to-state-store", "T01")).toBe("time-records-to-state-store/T01");
  });

  test("기능 객체의 나머지 필드(spec 상태·docs·blockedBy)는 건드리지 않는다", () => {
    const f = feature("auth", [ticket()]);
    const out = applyTimeRecords([f], {});
    expect(out[0]!.status).toBe(f.status);
    expect(out[0]!.sourceStatus).toBe(f.sourceStatus);
    expect(out[0]!.docs).toEqual(f.docs);
    expect(out[0]!.tickets[0]!.blockedBy).toEqual([]);
    expect(out[0]!.tickets[0]!.waitingOn).toEqual([]);
  });
});
