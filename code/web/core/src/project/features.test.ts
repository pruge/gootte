import { describe, expect, it } from "vitest";
import type { Feature, FeatureTicket } from "@gootte/contract";
import { parseTicket } from "../parse/feature";
import { buildFeature, buildFeatures, countOpenFeatures, sortFeatures } from "./features";

/** 티켓 파일 한 장 합성 — 상단 두 줄이 서식의 전부다(triage-labels). */
function ticket(status: string, blockedBy?: string): string {
  return [
    "# 02 — 할일 목록을 기능 문서에서 읽는다",
    "",
    ...(blockedBy ? [`**Blocked by:** ${blockedBy}`] : []),
    `**Status:** ${status}`,
  ].join("\n");
}

describe("buildFeature — 막힘 해제는 계산된다(INV-1)", () => {
  const docs = (...tickets: { file: string; body: string }[]) => ({
    slug: "f",
    spec: null,
    tickets: tickets.map((t) => parseTicket(t.file, t.body)),
    tree: [],
  });

  it("선행이 전부 완료면 착수 가능 — 파일에 그렇게 적혀 있지 않아도", () => {
    const f = buildFeature(
      docs(
        { file: "01-a.md", body: ticket("resolved (2026-08-01)") },
        { file: "02-b.md", body: ticket("resolved (2026-08-02)") },
        { file: "03-c.md", body: ticket("ready-for-agent", "01, 02") },
      ),
    );
    const c = f.tickets.find((t) => t.num === "03")!;
    expect(c.startable).toBe(true);
    expect(c.waitingOn).toEqual([]);
    expect(c.blockedBy).toEqual(["01", "02"]); // 적힌 것은 그대로 남는다
  });

  it("선행 중 하나가 미완이면 막힘 — 무엇을 기다리는지 보인다", () => {
    const f = buildFeature(
      docs(
        { file: "01-a.md", body: ticket("resolved (2026-08-01)") },
        { file: "02-b.md", body: ticket("ready-for-agent") },
        { file: "03-c.md", body: ticket("ready-for-agent", "01, 02") },
      ),
    );
    const c = f.tickets.find((t) => t.num === "03")!;
    expect(c.startable).toBe(false);
    expect(c.waitingOn).toEqual(["02"]);
  });

  it("선행 줄이 없으면 즉시 착수 가능", () => {
    const f = buildFeature(docs({ file: "01-a.md", body: ticket("ready-for-agent") }));
    expect(f.tickets[0]?.startable).toBe(true);
  });

  it("`01` 과 `1` 은 같은 티켓 — 번호 비교는 숫자로", () => {
    const f = buildFeature(
      docs(
        { file: "01-a.md", body: ticket("resolved (2026-08-01)") },
        { file: "02-b.md", body: ticket("ready-for-agent", "1") },
      ),
    );
    expect(f.tickets.find((t) => t.num === "02")?.startable).toBe(true);
  });

  it("wontfix 선행은 해제하지 않는다 — 관례가 `전부 resolved` 라고 못박는다", () => {
    const f = buildFeature(
      docs(
        { file: "01-a.md", body: ticket("wontfix") },
        { file: "02-b.md", body: ticket("ready-for-agent", "01") },
      ),
    );
    expect(f.tickets.find((t) => t.num === "02")?.waitingOn).toEqual(["01"]);
  });

  it("🔴 산문 선행은 이 기능의 같은 번호가 끝나도 해제되지 않는다 — 다른 기능 얘기일 수 있다(INV-4)", () => {
    const f = buildFeature(
      docs(
        { file: "01-a.md", body: ticket("resolved (2026-08-01)") },
        { file: "02-b.md", body: ticket("ready-for-agent", "자매 기능 `other` 의 티켓 01") },
      ),
    );
    const b = f.tickets.find((t) => t.num === "02")!;
    expect(b.waitingOn).toEqual(["자매 기능 `other` 의 티켓 01"]); // 문구 그대로 보인다
    expect(b.startable).toBe(false);
  });

  it("존재하지 않는 선행 번호는 해제하지 않고 그대로 드러낸다(INV-4)", () => {
    const f = buildFeature(docs({ file: "02-b.md", body: ticket("ready-for-agent", "99") }));
    expect(f.tickets[0]?.startable).toBe(false);
    expect(f.tickets[0]?.waitingOn).toEqual(["99"]);
  });

  it("티켓은 번호순, spec 없으면 표제 = 폴더명", () => {
    const f = buildFeature(
      docs(
        { file: "03-c.md", body: ticket("draft") },
        { file: "01-a.md", body: ticket("draft") },
        { file: "02-b.md", body: ticket("draft") },
      ),
    );
    expect(f.tickets.map((t) => t.num)).toEqual(["01", "02", "03"]);
    expect(f.title).toBe("f");
  });

  it("🔴 claimed 는 정규 값으로 인식된다 — 알 수 없는 상태가 아니다", () => {
    const f = buildFeature(docs({ file: "01-a.md", body: ticket("claimed") }));
    expect(f.tickets[0]?.statusKnown).toBe(true);
    expect(f.tickets[0]?.sourceStatus).toBe("claimed");
    expect(f.tickets[0]?.status).toBe("pending"); // 화면 다섯 값은 안 늘어난다 — 처리중은 관측의 몫
  });

  it("🔴 claimed 다(선행 없음) → 착수 가능에서 빠진다", () => {
    const f = buildFeature(docs({ file: "01-a.md", body: ticket("claimed") }));
    expect(f.tickets[0]?.startable).toBe(false);
    expect(f.tickets[0]?.waitingOn).toEqual([]); // 선행 문제가 아니다 — 임자 문제다
  });

  it("claimed 인데 선행이 안 풀렸다 → 착수 가능이 아니고, 대기 사실도 그대로 보인다", () => {
    const f = buildFeature(
      docs(
        { file: "01-a.md", body: ticket("ready-for-agent") },
        { file: "02-b.md", body: ticket("claimed", "01") },
      ),
    );
    const b = f.tickets.find((t) => t.num === "02")!;
    expect(b.startable).toBe(false);
    expect(b.waitingOn).toEqual(["01"]);
  });

  it("ready-for-agent 이고 선행이 풀렸다 → 지금처럼 착수 가능이다", () => {
    const f = buildFeature(docs({ file: "01-a.md", body: ticket("ready-for-agent") }));
    expect(f.tickets[0]?.startable).toBe(true);
  });

  it("나머지 여덟 값의 해석은 하나도 안 바뀐다", () => {
    for (const status of [
      "draft",
      "needs-triage",
      "needs-info",
      "ready-for-agent",
      "ready-for-human",
      "blocked",
      "resolved (2026-08-01)",
      "wontfix",
    ]) {
      const f = buildFeature(docs({ file: "01-a.md", body: ticket(status) }));
      expect(f.tickets[0]?.startable).toBe(true); // 선행 없음 + claimed 아님
    }
  });

  it("완료 판정은 원문 resolved 하나뿐 — 계산이 어디에도 저장되지 않는다(같은 입력 = 같은 출력)", () => {
    const input = docs(
      { file: "01-a.md", body: ticket("resolved (2026-08-01)") },
      { file: "02-b.md", body: ticket("blocked — 외부 대기", "01") },
    );
    expect(buildFeature(input)).toEqual(buildFeature(input));
    const b = buildFeature(input).tickets.find((t) => t.num === "02")!;
    expect(b.startable).toBe(true); // 선행은 풀렸다
    expect(b.sourceStatus).toBe("blocked"); // 그래도 외부 대기라는 사실은 살아 있다
    expect(b.status).toBe("pending");
  });
});

describe("buildFeatures — 기능 목록", () => {
  const docs = (slug: string) => ({
    slug,
    spec: null,
    tickets: [parseTicket("01-a.md", ticket("draft"))],
    tree: [],
  });

  // 🔴 정렬하지 않는다(티켓 03) — 순서는 처리중이 얹힌 뒤 `sortFeatures` 가 정한다.
  // 여기서는 문서 → 계약 형태 변환만 본다.
  it("문서 순서를 그대로 통과시킨다 — 정렬은 여기서 하지 않는다", () => {
    expect(buildFeatures([docs("zeta"), docs("alpha")]).map((f) => f.slug)).toEqual([
      "zeta",
      "alpha",
    ]);
  });

  it("입력이 없으면 빈 목록", () => {
    expect(buildFeatures([])).toEqual([]);
  });

  const docsWithStatus = (slug: string, ...statuses: string[]) => ({
    slug,
    spec: null,
    tickets: statuses.map((s, i) => parseTicket(`0${i + 1}-x.md`, ticket(s))),
    tree: [],
  });

  const docsWithNoTickets = (slug: string) => ({
    slug,
    spec: null,
    tickets: [],
    tree: [],
  });

  it("티켓이 0개인 기능은 세지 않는다 — 착수할 것이 없다", () => {
    expect(countOpenFeatures(buildFeatures([docsWithNoTickets("empty")]))).toBe(0);
  });

  it("입력이 비면 0", () => {
    expect(countOpenFeatures([])).toBe(0);
  });

  /**
   * 🔴 세기와 정렬은 **같은 판정**이어야 한다 — 갈리는 순간 사이드바 수와 카드 순서가
   * 서로 다른 말을 한다. 그래서 세기를 따로 검증하지 않고 **정렬 맨 앞 무리의 크기와 같은지**로
   * 못박는다. 정렬은 이제 `sortFeatures` 가 하므로 여기서 한 번 더 태운다.
   */
  it("남은 일 있는 기능 수 = 정렬 맨 앞 무리의 크기", () => {
    const docs = [
      docsWithStatus("alpha-open", "ready-for-agent"),
      docsWithStatus("bravo-done", "resolved (2026-08-01)"),
      docsWithNoTickets("delta-empty"),
      docsWithStatus("echo-open", "resolved (2026-08-01)", "blocked"),
      docsWithStatus("foxtrot-dropped", "wontfix"),
    ];
    const built = buildFeatures(docs);
    expect(countOpenFeatures(built)).toBe(2); // alpha-open · echo-open
    expect(
      sortFeatures(built)
        .slice(0, 2)
        .map((f) => f.slug),
    ).toEqual(["alpha-open", "echo-open"]);
  });
});

describe("sortFeatures — 화면 순서(무리 → 처리중 → 폴더명, 티켓 03)", () => {
  const t = (status: FeatureTicket["status"], over: Partial<FeatureTicket> = {}): FeatureTicket => ({
    num: "01",
    slug: "01-x",
    title: "x",
    status,
    sourceStatus: null,
    statusKnown: true,
    blockedBy: [],
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    workedBy: [],
    needsCaptainEye: false,
    ...over,
  });

  const f = (slug: string, tickets: FeatureTicket[]): Feature => ({
    slug,
    title: slug,
    status: "pending",
    sourceStatus: null,
    statusKnown: true,
    tickets,
    docs: [],
  });

  it("남은 일이 있는 기능이 전부 끝난 기능보다 앞에 온다(1단계)", () => {
    expect(
      sortFeatures([
        f("alpha-done", [t("done")]),
        f("zeta-open", [t("pending")]),
      ]).map((x) => x.slug),
    ).toEqual(["zeta-open", "alpha-done"]);
  });

  it("티켓이 0개인 기능은 남은 일 있는 기능보다 뒤, 전부 끝난 기능보다는 앞이다(1단계, 가운데 무리)", () => {
    expect(
      sortFeatures([
        f("alpha-empty", []),
        f("zeta-open", [t("pending")]),
      ]).map((x) => x.slug),
    ).toEqual(["zeta-open", "alpha-empty"]);
    expect(
      sortFeatures([
        f("alpha-done", [t("done")]),
        f("zeta-empty", []),
      ]).map((x) => x.slug),
    ).toEqual(["zeta-empty", "alpha-done"]);
  });

  it("세 무리가 남은 일 → 티켓 없음 → 끝남 순으로 온다 — 각 무리 안은 폴더명 순", () => {
    expect(
      sortFeatures([
        f("zeta-done", [t("done")]),
        f("mike-empty", []),
        f("alpha-open", [t("pending")]),
        f("bravo-done", [t("done")]),
        f("delta-empty", []),
        f("yankee-open", [t("pending")]),
      ]).map((x) => x.slug),
    ).toEqual(["alpha-open", "yankee-open", "delta-empty", "mike-empty", "bravo-done", "zeta-done"]);
  });

  it("dropped(wontfix) 는 done 과 똑같이 끝남으로 취급된다", () => {
    expect(
      sortFeatures([
        f("alpha-dropped", [t("dropped")]),
        f("zeta-open", [t("pending")]),
      ]).map((x) => x.slug),
    ).toEqual(["zeta-open", "alpha-dropped"]);
  });

  // 🔴 이 티켓의 진짜 일 — 2단계. 처리중은 무리를 안 바꾸고 무리 "안" 에서만 앞세운다.
  it("🔴 처리중 있는 기능 + 없는 기능, 폴더명은 없는 쪽이 앞이어도 처리중 있는 쪽이 위(2단계)", () => {
    expect(
      sortFeatures([
        f("alpha-idle", [t("pending")]),
        f("zeta-wip", [t("in_progress")]),
      ]).map((x) => x.slug),
    ).toEqual(["zeta-wip", "alpha-idle"]);
  });

  it("처리중 있는 기능 둘은 자기들끼리 폴더명 순 — 개수로 줄 세우지 않는다", () => {
    expect(
      sortFeatures([
        f("zeta-wip", [t("in_progress")]),
        f("alpha-wip", [t("in_progress"), t("in_progress", { slug: "02-y", num: "02" })]),
      ]).map((x) => x.slug),
    ).toEqual(["alpha-wip", "zeta-wip"]);
  });

  it("🔴 다 끝난 기능 + 처리중 있는 기능 — 완료는 여전히 아래(무리가 이긴다)", () => {
    expect(
      sortFeatures([
        f("alpha-wip", [t("in_progress")]),
        f("zeta-done", [t("done")]),
      ]).map((x) => x.slug),
    ).toEqual(["alpha-wip", "zeta-done"]);
  });

  it("처리중이 하나도 없으면 예전 순서 그대로 — 회귀 고정(이 티켓의 안전선)", () => {
    expect(
      sortFeatures([
        f("zeta-open", [t("pending")]),
        f("alpha-open", [t("pending")]),
        f("delta-done", [t("done")]),
        f("bravo-done", [t("done")]),
      ]).map((x) => x.slug),
    ).toEqual(["alpha-open", "zeta-open", "bravo-done", "delta-done"]);
  });

  it("티켓 없는 기능은 처리중과 무관하게 여전히 가운데 무리다", () => {
    expect(
      sortFeatures([
        f("mike-empty", []),
        f("alpha-wip", [t("in_progress")]),
        f("zeta-done", [t("done")]),
      ]).map((x) => x.slug),
    ).toEqual(["alpha-wip", "mike-empty", "zeta-done"]);
  });
});
