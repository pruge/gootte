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

describe("applyBacklogStatus — T04: Time: 줄 3단 규칙(finishedAt/startedAt/없음)", () => {
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
    joinFailed: false,
    startedAt: undefined,
    finishedAt: undefined,
    ...overrides,
  });

  it("finishedAt 있는 티켓 → done (git 커밋 없어도, 백로그 상태와 무관)", () => {
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
    const [joined] = applyBacklogStatus([withNew], [], "widget");
    expect(joined?.newTickets?.[0]?.status).toBe("done");
    expect(joined?.newTickets?.[0]?.joinFailed).toBe(false);
  });

  it("startedAt만 있는 티켓 → in_progress (백로그 in_flight와 일치해도 Time: 줄이 기준)", () => {
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
    const [joined] = applyBacklogStatus([withNew], [PARENT, task({ id: "widget-tauri-t04", section: "in_flight" })], "widget");
    expect(joined?.newTickets?.[0]?.status).toBe("in_progress");
    expect(joined?.newTickets?.[0]?.joinFailed).toBe(false);
  });

  it("Time: 줄이 없는 티켓 → pending (백로그 done이라도 done으로는 안 씀)", () => {
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
    const [joined] = applyBacklogStatus([withNew], [PARENT, task({ id: "widget-tauri-t04", section: "done", checked: true, since: "2026-08-25" })], "widget");
    expect(joined?.newTickets?.[0]?.status).toBe("pending");
    expect(joined?.newTickets?.[0]?.joinFailed).toBe(false);
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
    const [joined] = applyBacklogStatus([withNew], [], "widget");
    expect(joined?.newTickets?.[0]?.status).toBe("done");
    expect(joined?.newTickets?.[0]?.statusKnown).toBe(true);
    expect(joined?.newTickets?.[0]?.joinFailed).toBe(false);
  });

  it("문서 resolved는 백로그 in_flight보다 우선 (하이브리드 D5)", () => {
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
    const tasks = [PARENT, task({ id: "widget-tauri-t04", section: "in_flight" })];
    const [joined] = applyBacklogStatus([withNew], tasks, "widget");
    expect(joined?.newTickets?.[0]?.status).toBe("done");
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
    const [joined] = applyBacklogStatus([withNew], [], "widget");
    expect(joined?.newTickets?.[0]?.status).toBe("dropped");
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

  it("전부 done(finishedAt 있음)으로 조인되면 배지는 완료다", () => {
    const f = newConventionFeature([
      newTicket("01", { finishedAt: "2026-08-27T13:00:00+09:00", startedAt: "2026-08-27T12:00:00+09:00" }),
      newTicket("02", { finishedAt: "2026-08-27T14:00:00+09:00", startedAt: "2026-08-27T13:00:00+09:00" }),
    ]);
    const [joined] = applyBacklogStatus([f], [], "widget");
    expect(joined?.sourceStatus).toBe("완료");
    expect(joined?.status).toBe("done");
    expect(joined?.statusKnown).toBe(true);
  });

  it("in_progress(startedAt만 있음) 티켓이 하나라도 있으면 배지는 처리중이다", () => {
    const f = newConventionFeature([
      newTicket("01", { finishedAt: "2026-08-27T13:00:00+09:00", startedAt: "2026-08-27T12:00:00+09:00" }),
      newTicket("02", { startedAt: "2026-08-27T14:00:00+09:00", finishedAt: undefined }),
    ]);
    const [joined] = applyBacklogStatus([f], [], "widget");
    expect(joined?.sourceStatus).toBe("처리중");
    expect(joined?.status).toBe("in_progress");
  });

  it("대기·착수 가능이 섞였으면 배지는 남음이다", () => {
    // 🔴 T04 — 빈 백로그면 조인 실패(joinFailed)로 배지가 null 이 된다(D5). 그래서 "남음" 배지를
    // 내려면 백로그에 queued 로 **조인 성공**한 pending 티켓이 필요하다.
    const f = newConventionFeature([newTicket("01", { startedAt: undefined, finishedAt: undefined })]);
    const parent = task({ id: "widget-tauri", note: "Artifacts: docs/features/tauri-desktop-app/." });
    const child = task({ id: "widget-tauri-t01", section: "queued" });
    const [joined] = applyBacklogStatus([f], [parent, child], "widget");
    expect(joined?.newTickets?.[0]?.joinFailed).toBe(false);
    expect(joined?.sourceStatus).toBe("남음");
    expect(joined?.status).toBe("pending");
  });

  it("조인되지 않은 티켓(joinFailed true)이 하나라도 있으면 배지를 안 띄운다 — 추측 금지(D5)", () => {
    const f = newConventionFeature([
      newTicket("01", { finishedAt: "2026-08-27T13:00:00+09:00", startedAt: "2026-08-27T12:00:00+09:00" }),
      newTicket("02", { startedAt: undefined, finishedAt: undefined, joinFailed: true }), // joinFailed true
    ]);
    const [joined] = applyBacklogStatus([f], [], "widget");
    expect(joined?.sourceStatus).toBeNull();
    expect(joined?.statusKnown).toBe(false);
  });

  it("구관례(newTickets 없음) 기능은 배지도 나머지도 한 글자도 안 바뀐다", () => {
    const base = feature("tauri-desktop-app", [{ num: "01", status: "pending" }]);
    expect(base.sourceStatus).toBe("draft");
    const [joined] = applyBacklogStatus([base], [], "widget");
    expect(joined).toEqual(base);
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
    const [joined] = applyBacklogStatus([f], [], "widget");
    expect(joined?.newTickets?.[0]?.status).toBe("done");
    expect(joined?.newTickets?.[1]?.status).toBe("dropped");
    expect(joined?.newTickets?.[1]?.startable).toBe(false);
    expect(hasOpenWork(allTickets(joined as NonNullable<typeof joined>))).toBe(false);
    expect(joined?.newTickets?.[1]?.joinFailed).toBe(false);
  });

  it("취소 배지는 조인 실패(빈 백로그)에도 배지를 '취소'로 낸다 — null(숨김) 이 아니다(D5 예외)", () => {
    const f = cancelledFeature([
      newTicket("01", { finishedAt: "2026-08-27T13:00:00+09:00", startedAt: "2026-08-27T12:00:00+09:00" }),
      newTicket("02", { startedAt: undefined, finishedAt: undefined }),
    ]);
    // 빈 백로그 → 개별 티켓은 조인 실패(joinFailed)지만 취소 결정이 있으므로 배지는 '취소' 다.
    const [joined] = applyBacklogStatus([f], [], "widget");
    expect(joined?.sourceStatus).toBe("취소");
    expect(joined?.status).toBe("dropped");
    expect(joined?.statusKnown).toBe(true);
    // 🔴 D4 — finishedAt 티켓(T01)은 done 으로 남고, 미완 티켓(T02)은 dropped 로 내려간다.
    expect(joined?.newTickets?.[0]?.status).toBe("done");
    expect(joined?.newTickets?.[1]?.status).toBe("dropped");
    // 🔴 취소는 조인 실패를 이긴다 — 모든 티켓의 joinFailed 가 false 로 정정된다.
    expect(joined?.newTickets?.every((t) => t.joinFailed === false)).toBe(true);
  });

  it("구관례의 취소는 지금 그대로 — spec wontfix 배지 verbatim, 티켓 사상은 mapFirstmateStatus 몫", () => {
    const base = {
      ...feature("tauri-desktop-app", [{ num: "01", status: "dropped" as const }]),
      status: "dropped" as const,
      sourceStatus: "wontfix",
      statusKnown: true,
    };
    const [joined] = applyBacklogStatus([base], [], "widget");
    expect(joined).toEqual(base);
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
    workedBy: [],
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
    const [joined] = applyBacklogStatus([withNew], [], "widget", NOW);
    expect(joined?.newTickets?.[0]?.elapsed).toBe("약 14분");
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
    const [joined] = applyBacklogStatus([withNew], [PARENT, task({ id: "widget-tauri-t04", section: "in_flight" })], "widget", NOW);
    expect(joined?.newTickets?.[0]?.elapsed).toBe("약 1시간 30분 진행 중");
  });

  it("티켓에 Time: 줄이 없으면 elapsed 가 없다", () => {
    const withNew = {
      ...feature("tauri-desktop-app"),
      newTickets: [newTicket("04", { startedAt: undefined, finishedAt: undefined })],
    };
    const [joined] = applyBacklogStatus([withNew], [], "widget", NOW);
    expect(joined?.newTickets?.[0]?.elapsed).toBeUndefined();
  });

  it("백로그에 time: 줄이 있어도 티켓 문서의 Time: 가 우선된다(완전 교체)", () => {
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
    const tasks = [PARENT, task({ id: "widget-tauri-t04", section: "in_flight" })];
    const [joined] = applyBacklogStatus([withNew], tasks, "widget", NOW);
    expect(joined?.newTickets?.[0]?.elapsed).toBe("약 1시간");
  });

  it("done 도 티켓 문서의 시각을 쓴다 (resolver 없음 — finishedAt으로 판정)", () => {
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
    const [joined] = applyBacklogStatus([withNew], [], "widget", NOW);
    expect(joined?.newTickets?.[0]?.status).toBe("done");
    expect(joined?.newTickets?.[0]?.elapsed).toBe("약 1시간");
  });
});

describe("applyBacklogStatus — 구관례(issues/) 티켓의 Time: 줄도 elapsed 로 표시(INV-3)", () => {
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
    workedBy: [],
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
    const [joined] = applyBacklogStatus([withIssues], [], "widget");
    const t = joined!.tickets[0]!;
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
    const [joined] = applyBacklogStatus([withIssues], [], "widget");
    expect(joined!.tickets[0]!.elapsed).toBeUndefined();
  });
});