import { describe, expect, it } from "vitest";
import type { BacklogTaskDoc } from "../parse/backlog";
import type { FeatureTicket } from "@gootte/contract";
import { applyBacklogStatus, joinTicketBacklog } from "./backlog-join";
import { allTickets, hasOpenWork } from "./features";
import { feature } from "../plan/fixtures";

function task(overrides: Partial<BacklogTaskDoc>): BacklogTaskDoc {
  return {
    id: "widget-tauri-t04",
    checked: false,
    section: "in_flight",
    repo: "widget",
    url: null,
    since: null,
    note: "",
    ...overrides,
  };
}

const PARENT = task({
  id: "widget-tauri",
  note: "Artifacts: projects/widget/docs/features/tauri-desktop-app/.",
});

describe("joinTicketBacklog", () => {
  it("부모 메모의 docs/features/<slug>/ 문구로 부모를 찾고 <parent>-t<NN> 로 자식을 찾는다", () => {
    const child = task({ id: "widget-tauri-t04", section: "in_flight" });
    const result = joinTicketBacklog([PARENT, child], "widget", "tauri-desktop-app", "04");
    expect(result).toEqual({ status: "in_progress", url: null, completedAt: null });
  });

  it("완료(Done) 절은 done + 완료일을 싣는다", () => {
    const child = task({ id: "widget-tauri-t03", section: "done", checked: true, since: "2026-08-25", url: "https://x/pr/1" });
    const result = joinTicketBacklog([PARENT, child], "widget", "tauri-desktop-app", "03");
    expect(result).toEqual({ status: "done", url: "https://x/pr/1", completedAt: "2026-08-25" });
  });

  it("Queued 절은 pending 이다", () => {
    const child = task({ id: "widget-tauri-t05", section: "queued" });
    const result = joinTicketBacklog([PARENT, child], "widget", "tauri-desktop-app", "05");
    expect(result?.status).toBe("pending");
  });

  it("부모를 못 찾으면 null(추측하지 않는다)", () => {
    const child = task({ id: "widget-tauri-t04" });
    expect(joinTicketBacklog([child], "widget", "tauri-desktop-app", "04")).toBeNull();
  });

  it("repo 가 다르면 부모로 안 본다", () => {
    const child = task({ id: "widget-tauri-t04" });
    expect(joinTicketBacklog([PARENT, child], "other-repo", "tauri-desktop-app", "04")).toBeNull();
  });

  it("자식 id 가 없으면 null", () => {
    expect(joinTicketBacklog([PARENT], "widget", "tauri-desktop-app", "09")).toBeNull();
  });

  it("번호가 비어 있으면 null", () => {
    expect(joinTicketBacklog([PARENT], "widget", "tauri-desktop-app", "")).toBeNull();
  });

  it("산문이 기능 경로를 인용하는 자식 항목들이 목록 앞에 있어도 진짜 부모가 뽑힌다(every-home T01)", () => {
    // 실물 배열: in-flight/queued 자식들이 Done 부모보다 앞에 온다. 각 자식 메모는 자기 티켓
    // 경로(docs/features/<slug>/tickets/T<NN>.md)를 인용하므로 needle 이 반드시 걸린다 —
    // 과거 버그(findParentId hits 가 t03·t02·t01)가 바로 이 배치였다.
    const childQuoting = (id: string, section: BacklogTaskDoc["section"], checked = false) =>
      task({
        id,
        section,
        checked,
        note: "티켓: projects/widget/docs/features/tauri-desktop-app/tickets/T04.md",
      });
    const result = joinTicketBacklog(
      [childQuoting("widget-tauri-t03", "done", true), childQuoting("widget-tauri-t04", "in_flight"), PARENT],
      "widget",
      "tauri-desktop-app",
      "04",
    );
    expect(result).toEqual({ status: "in_progress", url: null, completedAt: null });
  });

  it("후보가 여럿이면 목록에서 먼저 오는 것 — 호출자(홈 병합)는 지도부 홈을 앞에 놓는다(T02 계약)", () => {
    // 지도부(MAIN) 항목이 앞, 세컨드메이트(MATE)의 산문 인용 항목이 뒤 — T02 병합 순서의 계약.
    // 메모 산문이 남의 기능 경로를 인용하는 항목은 자식 배제만으로 걸러지지 않으므로 순서 계약이
    // 유일한 방어선이다(every-home-reports-its-status spec §함께 고쳐야 하는 것).
    const mateQuoter = task({
      id: "gootte-backlog-join",
      repo: "gootte",
      note: "지금 규칙은 docs/features/both-conventions-are-first-class/ 문자열의 첫 항목이다.",
    });
    const mainParent = task({ id: "gootte-both-conventions", repo: "gootte", note: "Artifacts: projects/gootte/docs/features/both-conventions-are-first-class/." });
    const mainChild = task({ id: "gootte-both-conventions-t01", repo: "gootte", section: "done", checked: true, since: "2026-08-26", note: "티켓: docs/features/both-conventions-are-first-class/tickets/T01.md" });
    const result = joinTicketBacklog([mainParent, mainChild, mateQuoter], "gootte", "both-conventions-are-first-class", "01");
    expect(result).toEqual({ status: "done", url: null, completedAt: "2026-08-26" });
  });

  // 실물 done-archive.md 모양 — 여러 줄 메모 안에 경로가 산문으로 섞인 인용 행(이번 결함의
  // 실물: gootte-backlog-join 이 자기 결함 재현 기록에서 남의 기능 경로를 인용). 파서는 들여쓴
  // 줄을 trim 해 \n 로 잇는다(parseBacklog), 그래서 픽스처도 그 결과 모양이다.
  const quoterNote = [
    "## 결함 (실측)",
    "",
    "2026-08-26 실측(진짜 data/backlog.md 로 재현): `gootte-both-conventions` 의 파싱 노트가",
    "첫 문단 한 줄만 남고 `docs/features/both-conventions-are-first-class/` 문구(67행)가 버려짐.",
    "findParentId hits 가 t03·t02·t01(자식 셋), join 결과 전부 null. 데이터는 완전하고 코드만 틀렸다.",
  ].join("\n");

  it("인용 행이 목록 앞에 와도, 자식 행을 가진 진짜 부모가 이긴다(gootte-quoted-path T01)", () => {
    // 실물 배열: 가짜 후보(자식 없음)가 Done 절에서 먼저 온다 — 선착순만으론 가짜가 이긴다.
    const quoter = task({ id: "gootte-backlog-join", repo: "gootte", note: quoterNote });
    const realParent = task({ id: "gootte-both-conventions", repo: "gootte", note: "두 관례 모두 일급으로… 기획: docs/features/both-conventions-are-first-class/ (spec.md, tickets/T01~T03)" });
    const children = ["01", "02", "03"].map((n) =>
      task({ id: `gootte-both-conventions-t${n}`, repo: "gootte", section: "done" as const, checked: true, since: `2026-08-26`, note: `티켓: docs/features/both-conventions-are-first-class/tickets/T${n}.md` }),
    );
    expect(joinTicketBacklog([quoter, realParent, ...children], "gootte", "both-conventions-are-first-class", "01"))
      .toEqual({ status: "done", url: null, completedAt: "2026-08-26" });
    expect(joinTicketBacklog([quoter, realParent, ...children], "gootte", "both-conventions-are-first-class", "03"))
      .toEqual({ status: "done", url: null, completedAt: "2026-08-26" });
  });

  it("자식 행을 가진 후보가 둘 이상이면 선착순이 유지된다(T02 지도부 우선 계약)", () => {
    // 좁혀진 집합 안에서는 순서 규칙 그대로 — 먼저 오는 쪽이 이긴다. 둘 다 자기 t02 를 가지되
    // 상태가 다르다: 세컨드메이트(beta)를 앞에 놓으면 beta 의 done 이 나와야 한다.
    const parentBeta = task({ id: "gootte-beta", repo: "gootte", note: "참고: docs/features/quoted-path/ 검토.", section: "done" as const, checked: true });
    const childBeta = task({ id: "gootte-beta-t02", repo: "gootte", section: "done" as const, checked: true, since: "2026-08-27" });
    const parentAlpha = task({ id: "gootte-alpha", repo: "gootte", note: "Artifacts: docs/features/quoted-path/." });
    const childAlpha = task({ id: "gootte-alpha-t02", repo: "gootte", section: "in_flight" as const });
    expect(joinTicketBacklog([parentBeta, childBeta, parentAlpha, childAlpha], "gootte", "quoted-path", "02"))
      .toEqual({ status: "done", url: null, completedAt: "2026-08-27" });
    // 순서만 뒤집으면 alpha(in_flight)가 이긴다 — 판정은 배열 순서의 결정적 함수다(INV-4).
    expect(joinTicketBacklog([parentAlpha, childAlpha, parentBeta, childBeta], "gootte", "quoted-path", "02"))
      .toEqual({ status: "in_progress", url: null, completedAt: null });
  });

  it("자식 행을 가진 후보가 하나도 없으면 기존대로 선착순 첫 후보(D3, 기획 직후 방어)", () => {
    // 자식 행이 아직 백로그에 없어도 부모는 잃지 않는다 — 두 후보 모두 자식 없음 → 첫째.
    const first = task({ id: "gootte-plan-a", repo: "gootte", note: "Artifacts: docs/features/fresh-plan/." });
    const second = task({ id: "gootte-plan-b", repo: "gootte", note: "참고: docs/features/fresh-plan/ 검토.", section: "queued" as const });
    expect(joinTicketBacklog([first, second], "gootte", "fresh-plan", "01")).toBeNull(); // 첫 후보 id 로 자식을 찾지만 없음
    // 조인 자체는 null 이지만 부모 판정이 첫 후보였다는 것은, 자식을 얹으면 바로 보인다:
    const child = task({ id: "gootte-plan-a-t01", repo: "gootte", section: "queued" as const });
    expect(joinTicketBacklog([first, second, child], "gootte", "fresh-plan", "01"))
      .toEqual({ status: "pending", url: null, completedAt: null });
  });

  it("후보가 아예 없으면 null — 추측하지 않는다(기존 규칙 유지)", () => {
    expect(joinTicketBacklog([], "gootte", "no-such-feature", "01")).toBeNull();
  });

  it("자식 id 모양(<...>-t<NN>)은 부모 후보가 아니다(every-home T01)", () => {
    // 자식 t01 의 메모가 자기 티켓 경로를 인용한다 — needle 이 반드시 걸린다.
    const childQuoting = task({ id: "widget-tauri-t01", note: "Artifacts: projects/widget/docs/features/tauri-desktop-app/." });
    expect(joinTicketBacklog([childQuoting], "widget", "tauri-desktop-app", "04")).toBeNull();
  });
});

describe("applyBacklogStatus", () => {
  it("newTickets 만 조인하고 tickets(issues 관례)는 그대로 둔다", () => {
    const base = feature("tauri-desktop-app", ["01"]);
    const withNew = {
      ...base,
      newTickets: [
        {
          num: "04",
          slug: "T04",
          path: "tickets/T04.md",
          title: "신관례 문서 표시",
          status: "pending" as const,
          sourceStatus: null,
          statusKnown: false,
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          workedBy: [],
          needsCaptainEye: false,
          docConvention: "tickets" as const,
          backlogStatus: null,
          backlogUrl: null,
        },
      ],
    };
    const child = task({ id: "widget-tauri-t04", section: "in_flight" });
    const [joined] = applyBacklogStatus([withNew], [PARENT, child], "widget");

    expect(joined?.newTickets?.[0]?.status).toBe("in_progress");
    expect(joined?.newTickets?.[0]?.backlogStatus).toBe("in_progress");
    expect(joined?.tickets[0]?.sourceStatus).toBe("draft"); // issues 관례는 안 건드린다
  });

  it("미조인이면 손대지 않는다", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        {
          num: "09",
          slug: "T09",
          path: "tickets/T09.md",
          title: "아직 백로그에 없는 티켓",
          status: "pending" as const,
          sourceStatus: null,
          statusKnown: false,
          blockedBy: [],
          unreadableBlockedBy: [],
          waitingOn: [],
          startable: true,
          workedBy: [],
          needsCaptainEye: false,
          docConvention: "tickets" as const,
          backlogStatus: null,
          backlogUrl: null,
        },
      ],
    };
    const [joined] = applyBacklogStatus([withNew], [PARENT], "widget");
    expect(joined?.newTickets?.[0]?.backlogStatus).toBeNull();
  });

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
    workedBy: [],
    needsCaptainEye: false,
    docConvention: "tickets",
    backlogStatus: null,
    backlogUrl: null,
    ...overrides,
  });

  it("🔴 조인으로 선행이 완료되면 신관례 티켓의 대기도 풀린다 — 낡은 뷰 금지(INV-3, T01)", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        newTicket("01"),
        newTicket("02", { blockedBy: ["01"], waitingOn: ["01"], startable: false }),
      ],
    };
    // T01 은 Done, T02 는 Queued — T02 의 대기가 풀려 착수 가능이어야 한다.
    const tasks = [PARENT, task({ id: "widget-tauri-t01", section: "done", checked: true }), task({ id: "widget-tauri-t02", section: "queued" })];
    const [joined] = applyBacklogStatus([withNew], tasks, "widget");
    expect(joined?.newTickets?.[0]?.status).toBe("done");
    const t2 = joined?.newTickets?.[1];
    expect(t2?.waitingOn).toEqual([]);
    expect(t2?.startable).toBe(true);
  });

  it("조인 후에도 선행이 미완이면 대기로 남는다(T01)", () => {
    const base = feature("tauri-desktop-app");
    const withNew = {
      ...base,
      newTickets: [
        newTicket("01"),
        newTicket("02", { blockedBy: ["01"], waitingOn: ["01"], startable: false }),
      ],
    };
    const tasks = [PARENT, task({ id: "widget-tauri-t01", section: "in_flight" }), task({ id: "widget-tauri-t02", section: "queued" })];
    const [joined] = applyBacklogStatus([withNew], tasks, "widget");
    const t2 = joined?.newTickets?.[1];
    expect(t2?.waitingOn).toEqual(["01"]);
    expect(t2?.startable).toBe(false);
  });

  // ── 머리글 배지 파생(the-header-agrees-with-its-tickets/T01) ───────────────────

  describe("머리글 배지 파생(T01)", () => {
  /** 신관례 기능 — spec 의 낡은 `Status:` 글자를 이미 달고 있는 모양(문제 1의 실물). */
  const newConventionFeature = (tickets: FeatureTicket[]) => ({
    ...feature("tauri-desktop-app", []),
    status: "pending" as const,
    sourceStatus: "ready-for-agent",
    statusKnown: true,
    newTickets: tickets,
  });

  it("전부 done 으로 조인되면 배지는 완료다 — 남은 일 0 과 모순하지 않는다", () => {
    const f = newConventionFeature([newTicket("01"), newTicket("02")]);
    const tasks = [
      PARENT,
      task({ id: "widget-tauri-t01", section: "done", checked: true }),
      task({ id: "widget-tauri-t02", section: "done", checked: true }),
    ];
    const [joined] = applyBacklogStatus([f], tasks, "widget");
    expect(joined?.sourceStatus).toBe("완료");
    expect(joined?.status).toBe("done");
    expect(joined?.statusKnown).toBe(true);
  });

  it("in_flight 티켓이 하나라도 있으면 배지는 처리중이다", () => {
    const f = newConventionFeature([newTicket("01"), newTicket("02")]);
    const tasks = [
      PARENT,
      task({ id: "widget-tauri-t01", section: "done", checked: true }),
      task({ id: "widget-tauri-t02", section: "in_flight" }),
    ];
    const [joined] = applyBacklogStatus([f], tasks, "widget");
    expect(joined?.sourceStatus).toBe("처리중");
    expect(joined?.status).toBe("in_progress");
  });

  it("대기·착수 가능이 섞였으면 배지는 남음이다", () => {
    const f = newConventionFeature([newTicket("01")]);
    const tasks = [PARENT, task({ id: "widget-tauri-t01", section: "queued" })];
    const [joined] = applyBacklogStatus([f], tasks, "widget");
    expect(joined?.sourceStatus).toBe("남음");
    expect(joined?.status).toBe("pending");
  });

  it("🔴 조인되지 않은 티켓이 하나라도 있으면 배지를 안 띄운다 — 추측 금지(D5)", () => {
    // T01 은 조인됨(done), T02 는 백로그에 아직 없음 — 완료나 착수 가능으로 읽으면 INV-4 위반.
    const f = newConventionFeature([newTicket("01"), newTicket("02")]);
    const tasks = [PARENT, task({ id: "widget-tauri-t01", section: "done", checked: true })];
    const [joined] = applyBacklogStatus([f], tasks, "widget");
    expect(joined?.sourceStatus).toBeNull();
    expect(joined?.statusKnown).toBe(false);
  });

  it("구관례(newTickets 없음) 기능은 배지도 나머지도 한 글자도 안 바뀐다", () => {
    const base = feature("tauri-desktop-app", [{ num: "01", status: "pending" }]);
    expect(base.sourceStatus).toBe("draft"); // 픽스처가 spec 줄 verbatim 을 드는 모양
    const [joined] = applyBacklogStatus([base], [], "widget");
    expect(joined).toEqual(base);
  });
  });

  // ── 취소 선언이 계산을 이긴다(the-header-agrees-with-its-tickets/T02) ────────────

  describe("취소(wontfix)가 계산을 이긴다(T02)", () => {
    /** spec 에 `Status: wontfix` 를 선언한 신관례 기능 — buildFeature 직후의 모양. */
    const cancelledFeature = (tickets: FeatureTicket[]) => ({
      ...feature("tauri-desktop-app", []),
      status: "dropped" as const,
      sourceStatus: "wontfix",
      statusKnown: true,
      newTickets: tickets,
    });

    it("취소 + 완료 티켓 혼합 — 안 끝난 티켓은 dropped, done 은 done 으로 남는다(D4)", () => {
      const f = cancelledFeature([newTicket("01"), newTicket("02")]);
      const tasks = [
        PARENT,
        task({ id: "widget-tauri-t01", section: "done", checked: true }),
        task({ id: "widget-tauri-t02", section: "queued" }),
      ];
      const [joined] = applyBacklogStatus([f], tasks, "widget");
      expect(joined?.newTickets?.[0]?.status).toBe("done"); // 착지한 일은 없던 일로 만들지 않는다
      expect(joined?.newTickets?.[1]?.status).toBe("dropped");
      expect(joined?.newTickets?.[1]?.startable).toBe(false);
      expect(hasOpenWork(allTickets(joined as NonNullable<typeof joined>))).toBe(false);
      expect(joined?.newTickets?.[1]?.backlogStatus).toBe("pending"); // 조인 사실은 지키고, 취급만 dropped
    });

    it("🔴 취소 배지는 T01 파생과 조인 실패를 모두 이긴다(D3·D5)", () => {
      // 백로그에 아예 없어 전부 미조인 — D5 로는 배지를 안 띄지만, 기능 전체가 취소면 취소로 보인다.
      const f = cancelledFeature([newTicket("01"), newTicket("02")]);
      const [joined] = applyBacklogStatus([f], [], "widget");
      expect(joined?.sourceStatus).toBe("취소");
      expect(joined?.status).toBe("dropped");
      expect(joined?.statusKnown).toBe(true);
      expect(joined?.newTickets?.every((t) => t.status === "dropped")).toBe(true);
    });

    it("구관례의 취소는 지금 그대로 — spec wontfix 배지 verbatim, 티켓 사상은 mapFirstmateStatus 몫", () => {
      const base = {
        ...feature("tauri-desktop-app", [{ num: "01", status: "dropped" as const }]),
        status: "dropped" as const,
        sourceStatus: "wontfix",
        statusKnown: true,
      };
      const [joined] = applyBacklogStatus([base], [], "widget");
      expect(joined).toEqual(base); // 한 글자도 안 바뀐다
    });
  });
});
