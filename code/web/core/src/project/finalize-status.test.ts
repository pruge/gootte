import { describe, expect, it } from "vitest";
import type { FeatureTicket } from "@gootte/contract";
import { finalizeFeatureStatus } from "./finalize-status";
import { allTickets, hasOpenWork } from "./features";
import { feature } from "../plan/fixtures";

describe("finalizeFeatureStatus — T04: Time: 줄 3단 규칙(finishedAt/startedAt/없음)", () => {
  /** 신관례 티켓 한 장 — blockedBy 를 줄 수 있다(T01). */
  const newTicket = (
    num: string,
    overrides: Partial<FeatureTicket> = {},
  ): FeatureTicket => ({
    num,
    slug: `T${num}`,
    path: `tickets/T${num}.md`,
    title: `티켓 T${num}`,
    status: "pending",
    sourceStatus: null,
    statusKnown: false,
    blockedBy: [],
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    needsCaptainEye: false,
    docConvention: "tickets",
    joinFailed: false,
    startedAt: undefined,
    finishedAt: undefined,
    ...overrides,
  });

  it("finishedAt 있는 티켓 → done (git 커밋 없어도)", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        newTicket("04", {
          finishedAt: "2026-08-27T13:02:43+09:00",
          startedAt: "2026-08-27T12:48:43+09:00",
        }),
      ],
    };
    const [finalized] = finalizeFeatureStatus([withNew]);
    expect(finalized?.newTickets?.[0]?.status).toBe("done");
    expect(finalized?.newTickets?.[0]?.joinFailed).toBe(false);
  });

  it("startedAt만 있는 티켓 → in_progress (Time: 줄이 기준)", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        newTicket("04", {
          startedAt: "2026-08-27T12:00:00+09:00",
          finishedAt: undefined,
        }),
      ],
    };
    const [finalized] = finalizeFeatureStatus([withNew]);
    expect(finalized?.newTickets?.[0]?.status).toBe("in_progress");
    expect(finalized?.newTickets?.[0]?.joinFailed).toBe(false);
  });

  it("Time: 줄이 없는 티켓 → pending (문서만으로 pending)", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        newTicket("04", {
          startedAt: undefined,
          finishedAt: undefined,
        }),
      ],
    };
    const [finalized] = finalizeFeatureStatus([withNew]);
    expect(finalized?.newTickets?.[0]?.status).toBe("pending");
    expect(finalized?.newTickets?.[0]?.joinFailed).toBe(false);
  });

  it("문서에 Status: resolved 있으면 Time: 줄과 무관하게 done (문서가 SoT)", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        newTicket("04", {
          status: "done",
          statusKnown: true,
          sourceStatus: "resolved",
          completedAt: "2026-08-28",
          startedAt: undefined,
          finishedAt: undefined,
        }),
      ],
    };
    const [finalized] = finalizeFeatureStatus([withNew]);
    expect(finalized?.newTickets?.[0]?.status).toBe("done");
    expect(finalized?.newTickets?.[0]?.statusKnown).toBe(true);
    expect(finalized?.newTickets?.[0]?.joinFailed).toBe(false);
  });

  it("문서 resolved는 문서가 SoT (하이브리드 D5)", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        newTicket("04", {
          status: "done",
          statusKnown: true,
          sourceStatus: "resolved",
          startedAt: undefined,
          finishedAt: undefined,
        }),
      ],
    };
    const [finalized] = finalizeFeatureStatus([withNew]);
    expect(finalized?.newTickets?.[0]?.status).toBe("done");
  });

  it("문서 wontfix는 dropped (Time: 줄이 있어도 문서가 이김)", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        newTicket("04", {
          status: "dropped",
          statusKnown: true,
          sourceStatus: "wontfix",
          startedAt: "2026-08-27T12:00:00+09:00",
          finishedAt: "2026-08-27T13:00:00+09:00",
        }),
      ],
    };
    const [finalized] = finalizeFeatureStatus([withNew]);
    expect(finalized?.newTickets?.[0]?.status).toBe("dropped");
  });

  // ── 머리글 배지 파생 ───────────────────

  /** 신관례 기능 — spec 의 낡은 `Status:` 글자를 이미 달고 있는 모양(문제 1의 실물). */
  const newConventionFeature = (tickets: FeatureTicket[]) => ({
    ...feature("tauri-desktop-app", []),
    status: "pending" as const,
    sourceStatus: "ready-for-agent",
    statusKnown: true,
    newTickets: tickets,
  });

  it("전부 done(finishedAt 있음)이면 배지는 완료다", () => {
    const f = newConventionFeature([
      newTicket("01", { finishedAt: "2026-08-27T13:00:00+09:00", startedAt: "2026-08-27T12:00:00+09:00" }),
      newTicket("02", { finishedAt: "2026-08-27T14:00:00+09:00", startedAt: "2026-08-27T13:00:00+09:00" }),
    ]);
    const [finalized] = finalizeFeatureStatus([f]);
    expect(finalized?.sourceStatus).toBe("완료");
    expect(finalized?.status).toBe("done");
    expect(finalized?.statusKnown).toBe(true);
  });

  it("in_progress(startedAt만 있음) 티켓이 하나라도 있으면 배지는 처리중이다", () => {
    const f = newConventionFeature([
      newTicket("01", { finishedAt: "2026-08-27T13:00:00+09:00", startedAt: "2026-08-27T12:00:00+09:00" }),
      newTicket("02", { startedAt: "2026-08-27T14:00:00+09:00", finishedAt: undefined }),
    ]);
    const [finalized] = finalizeFeatureStatus([f]);
    expect(finalized?.sourceStatus).toBe("처리중");
    expect(finalized?.status).toBe("in_progress");
  });

  it("대기·착수 가능이 섞였으면 배지는 남음이다", () => {
    // 신관례 티켓은 문서가 자급하므로 막히지 않은 티켓은 착수 가능으로 본다(캡틴 결정 2026-08).
    // 그래서 "남음" 배지를 내리려면 문서상 열린 일이면 충분하다.
    const f = newConventionFeature([newTicket("01", { startedAt: undefined, finishedAt: undefined })]);
    const [finalized] = finalizeFeatureStatus([f]);
    expect(finalized?.newTickets?.[0]?.joinFailed).toBe(false);
    expect(finalized?.sourceStatus).toBe("남음");
    expect(finalized?.status).toBe("pending");
  });

  it("문서만으로 상태를 아는 신관례 티켓은 숨기지 않는다 — 막히지 않았으면 착수 가능", () => {
    // T01 은 done, T02 는 상태 줄·Time 없이 선행도 없음 → 착수 가능으로 본다(신관례 자급, 캡틴 결정 2026-08).
    const f = newConventionFeature([
      newTicket("01", { finishedAt: "2026-08-27T13:00:00+09:00", startedAt: "2026-08-27T12:00:00+09:00" }),
      newTicket("02", { startedAt: undefined, finishedAt: undefined }),
    ]);
    const [finalized] = finalizeFeatureStatus([f]);
    expect(finalized?.newTickets?.[1]?.joinFailed).toBe(false);
    expect(finalized?.newTickets?.[1]?.status).toBe("pending");
    expect(finalized?.newTickets?.[1]?.startable).toBe(true);
    // 열린 일(착수 가능 T02)이 있으니 머리글은 "남음" — null(숨김) 이 아니다.
    expect(finalized?.sourceStatus).toBe("남음");
    expect(finalized?.statusKnown).toBe(true);
  });

  it("구관례(newTickets 없음) 기능은 배지도 나머지도 한 글자도 안 바뀐다", () => {
    const base = feature("tauri-desktop-app", [{ num: "01", status: "pending" }]);
    expect(base.sourceStatus).toBe("draft");
    const [finalized] = finalizeFeatureStatus([base]);
    expect(finalized).toEqual(base);
  });

  // ── 취소 선언이 계산을 이긴다 ────────────

  /** spec 에 `Status: wontfix` 를 선언한 신관례 기능 — buildFeature 직후의 모양. */
  const cancelledFeature = (tickets: FeatureTicket[]) => ({
    ...feature("tauri-desktop-app", []),
    status: "dropped" as const,
    sourceStatus: "wontfix",
    statusKnown: true,
    newTickets: tickets,
  });

  it("취소 + 완료 티켓 혼합 — 안 끝난 티켓은 dropped, done 은 done 으로 남는다", () => {
    const f = cancelledFeature([
      newTicket("01", { finishedAt: "2026-08-27T13:00:00+09:00", startedAt: "2026-08-27T12:00:00+09:00" }),
      newTicket("02", { startedAt: undefined, finishedAt: undefined }),
    ]);
    const [finalized] = finalizeFeatureStatus([f]);
    expect(finalized?.newTickets?.[0]?.status).toBe("done");
    expect(finalized?.newTickets?.[1]?.status).toBe("dropped");
    expect(finalized?.newTickets?.[1]?.startable).toBe(false);
    expect(hasOpenWork(allTickets(finalized as NonNullable<typeof finalized>))).toBe(false);
    expect(finalized?.newTickets?.[1]?.joinFailed).toBe(false);
  });

  it("취소 배지는 '취소'로 낸다 — null(숨김) 이 아니다", () => {
    const f = cancelledFeature([
      newTicket("01", { finishedAt: "2026-08-27T13:00:00+09:00", startedAt: "2026-08-27T12:00:00+09:00" }),
      newTicket("02", { startedAt: undefined, finishedAt: undefined }),
    ]);
    // 신관례 티켓은 문서 자급(막히지 않으면 착수 가능)이므로 joinFailed 가 아니다 —
    // 취소 결정이 있으니 배지는 '취소' 다.
    const [finalized] = finalizeFeatureStatus([f]);
    expect(finalized?.sourceStatus).toBe("취소");
    expect(finalized?.status).toBe("dropped");
    expect(finalized?.statusKnown).toBe(true);
    // 🔴 D4 — finishedAt 티켓(T01)은 done 으로 남고, 미완 티켓(T02)은 dropped 로 내려간다.
    expect(finalized?.newTickets?.[0]?.status).toBe("done");
    expect(finalized?.newTickets?.[1]?.status).toBe("dropped");
    // 🔴 취소는 막힘을 이긴다 — 모든 티켓의 joinFailed 가 false 다.
    expect(finalized?.newTickets?.every((t) => t.joinFailed === false)).toBe(true);
  });

  it("구관례의 취소는 지금 그대로 — spec wontfix 배지 verbatim, 티켓 사상은 mapFirstmateStatus 몫", () => {
    const base = {
      ...feature("tauri-desktop-app", [{ num: "01", status: "dropped" as const }]),
      status: "dropped" as const,
      sourceStatus: "wontfix",
      statusKnown: true,
    };
    const [finalized] = finalizeFeatureStatus([base]);
    expect(finalized).toEqual(base);
  });
});

// ── T02 — elapsed 경로가 티켓 문서의 Time: 줄로 전환 ──────────────────────

describe("T02 — elapsed 는 티켓 문서의 Time: 줄에서 계산", () => {
  const NOW = "2026-08-27T13:30:00+09:00";

  /** 신관례 티켓 한 장 — blockedBy 를 줄 수 있다(T01). */
  const newTicket = (
    num: string,
    overrides: Partial<FeatureTicket> = {},
  ): FeatureTicket => ({
    num,
    slug: `T${num}`,
    path: `tickets/T${num}.md`,
    title: `티켓 T${num}`,
    status: "pending",
    sourceStatus: null,
    statusKnown: false,
    blockedBy: [],
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    needsCaptainEye: false,
    docConvention: "tickets",
    joinFailed: false,
    startedAt: undefined,
    finishedAt: undefined,
    ...overrides,
  });

  it("티켓에 Time: 줄이 있으면 elapsed 가 계산된다(완료)", () => {
    const withNew = {
      ...feature("tauri-desktop-app"),
      newTickets: [
        newTicket("04", {
          status: "done",
          statusKnown: true,
          sourceStatus: "resolved",
          startedAt: "2026-08-27T12:48:43+09:00",
          finishedAt: "2026-08-27T13:02:43+09:00",
        }),
      ],
    };
    const [finalized] = finalizeFeatureStatus([withNew], NOW);
    expect(finalized?.newTickets?.[0]?.elapsed).toBe("약 14분");
  });

  it("티켓에 Time: 줄이 있으면 elapsed 가 계산된다(진행 중)", () => {
    const withNew = {
      ...feature("tauri-desktop-app"),
      newTickets: [
        newTicket("04", {
          status: "pending",
          statusKnown: false,
          sourceStatus: null,
          startedAt: "2026-08-27T12:00:00+09:00",
          finishedAt: undefined, // 진행 중
        }),
      ],
    };
    const [finalized] = finalizeFeatureStatus([withNew], NOW);
    expect(finalized?.newTickets?.[0]?.elapsed).toBe("약 1시간 30분 진행 중");
  });

  it("티켓에 Time: 줄이 없으면 elapsed 가 없다", () => {
    const withNew = {
      ...feature("tauri-desktop-app"),
      newTickets: [newTicket("04", { startedAt: undefined, finishedAt: undefined })],
    };
    const [finalized] = finalizeFeatureStatus([withNew], NOW);
    expect(finalized?.newTickets?.[0]?.elapsed).toBeUndefined();
  });

  it("elapsed 는 티켓 문서의 Time: 에서 계산된다(다른 출처 없음)", () => {
    const withNew = {
      ...feature("tauri-desktop-app"),
      newTickets: [
        newTicket("04", {
          status: "pending",
          statusKnown: false,
          sourceStatus: null,
          startedAt: "2026-08-27T10:00:00+09:00",
          finishedAt: "2026-08-27T11:00:00+09:00",
        }),
      ],
    };
    const [finalized] = finalizeFeatureStatus([withNew], NOW);
    expect(finalized?.newTickets?.[0]?.elapsed).toBe("약 1시간");
  });

  it("done 도 티켓 문서의 시각을 쓴다 (finishedAt으로 판정)", () => {
    const withNew = {
      ...feature("tauri-desktop-app"),
      newTickets: [
        newTicket("04", {
          status: "pending",
          statusKnown: false,
          sourceStatus: null,
          startedAt: "2026-08-27T12:00:00+09:00",
          finishedAt: "2026-08-27T13:00:00+09:00",
        }),
      ],
    };
    const [finalized] = finalizeFeatureStatus([withNew], NOW);
    expect(finalized?.newTickets?.[0]?.status).toBe("done");
    expect(finalized?.newTickets?.[0]?.elapsed).toBe("약 1시간");
  });
});

describe("finalizeFeatureStatus — 구관례(issues/) 티켓의 Time: 줄도 elapsed 로 표시(INV-3)", () => {
  const newTicket = (num: string, overrides: Partial<FeatureTicket> = {}): FeatureTicket => ({
    num,
    slug: `${num}-x`,
    path: `issues/${num}-x.md`,
    title: `티켓 ${num}`,
    status: "pending",
    sourceStatus: null,
    statusKnown: false,
    blockedBy: [],
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    needsCaptainEye: false,
    joinFailed: false,
    startedAt: undefined,
    finishedAt: undefined,
    ...overrides,
  });

  it("issues 티켓에 Time: 줄이 있으면 상태는 그대로 두고 elapsed 만 계산한다", () => {
    const base = feature("tauri-desktop-app");
    const issueTicket: FeatureTicket = {
      ...newTicket("01", {}),
      path: "issues/01-x.md",
      status: "done",
      sourceStatus: "resolved",
      statusKnown: true,
      startedAt: "2026-08-13T10:00:00+09:00",
      finishedAt: "2026-08-13T11:30:00+09:00",
    };
    const withIssues = { ...base, tickets: [issueTicket], newTickets: [] };
    const [finalized] = finalizeFeatureStatus([withIssues]);
    const t = finalized!.tickets[0]!;
    // 상태 SoT 는 문서 Status: 줄 — 판정이 바뀌지 않는다.
    expect(t.status).toBe("done");
    expect(t.startedAt).toBe("2026-08-13T10:00:00+09:00");
    // 표시용 elapsed 는 새로 계산된다.
    expect(t.elapsed).toBeDefined();
    expect(t.elapsed).toContain("분");
  });

  it("Time: 줄이 없는 issues 티켓은 elapsed 가 없다(지어내지 않음, INV-4)", () => {
    const base = feature("tauri-desktop-app");
    const issueTicket: FeatureTicket = {
      ...newTicket("01", {}),
      path: "issues/01-x.md",
      status: "done",
      sourceStatus: "resolved",
      statusKnown: true,
    };
    const withIssues = { ...base, tickets: [issueTicket], newTickets: [] };
    const [finalized] = finalizeFeatureStatus([withIssues]);
    expect(finalized!.tickets[0]!.elapsed).toBeUndefined();
  });
});
