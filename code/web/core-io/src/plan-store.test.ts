import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { Feature, FeatureTicket } from "@gootte/contract";
import {
  dropOrder,
  dropStaleCompleted,
  insertTicketStep,
  migratePlanDb,
  moveFeatureOrder,
  moveTicketStep,
  readPlanOrder,
  renameTrack,
  setFeatureOrder,
  setTicketOrder,
} from "./plan-store";

/** 옛 모양 DB 를 만들 때만 쓴다 — 나머지는 전부 이 모듈의 store 함수로 만든다(머리말과 같은 이유). */
type DatabaseSyncCtor = new (path: string) => DatabaseSyncType;
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

function ticket(num: string, overrides: Partial<FeatureTicket> = {}): FeatureTicket {
  return {
    num,
    slug: `${num}-x`,
    title: `티켓 ${num}`,
    status: "pending",
    sourceStatus: "ready-for-agent",
    statusKnown: true,
    blockedBy: [],
    unreadableBlockedBy: [],
    waitingOn: [],
    startable: true,
    workedBy: [],
    needsCaptainEye: false,
    ...overrides,
  };
}

function feature(slug: string, tickets: FeatureTicket[]): Feature {
  return { slug, title: slug, status: "pending", sourceStatus: null, statusKnown: true, tickets, docs: [] };
}

/** 임시 디렉토리 픽스처 — 이 저장소 자신의 문서를 픽스처로 쓰지 않는다(AGENTS.md §Verify gate). */
let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-plan-"));
});

describe("plan-store — 덮어쓰기만(INV-5, 이력 테이블 없음)", () => {
  it("set-feature 두 번 같은 키 → 뒤엣것만 남는다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "먼저" });
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 20, why: "나중" });
    const order = readPlanOrder(dataDir, "p");
    expect(order.features).toHaveLength(1);
    expect(order.features[0]).toMatchObject({ rank: 20, why: "나중" });
  });

  it("set 두 번 같은 티켓 → 뒤엣것만 남는다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "먼저" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 2, why: "나중" });
    const order = readPlanOrder(dataDir, "p");
    expect(order.tickets).toHaveLength(1);
    expect(order.tickets[0]).toMatchObject({ step: 2, why: "나중" });
  });

  it("set — step 생략하면 기존 값 유지, kind 만 바뀐다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 3, why: "계획" });
    const updated = setTicketOrder(dataDir, {
      project: "p",
      feature: "a",
      ticket: "01",
      why: "이유를 다시 적었다",
    });
    expect(updated.step).toBe(3);
  });

  it("처음 등록인데 step 이 없으면 거절한다", () => {
    expect(() =>
      setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", why: "…" }),
    ).toThrow(/--step/);
  });

  it("이웃 사이에 끼워도 다른 줄은 안 바뀐다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "a" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "b" });
    setFeatureOrder(dataDir, { project: "p", feature: "c", track: "web", rank: 15, why: "끼움" });
    const order = readPlanOrder(dataDir, "p");
    expect(order.features.map((f) => [f.feature, f.rank])).toEqual([
      ["a", 10],
      ["c", 15],
      ["b", 20],
    ]);
  });

  it("drop — 티켓 지정이면 그 티켓만, 아니면 기능 순위만 지운다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    dropOrder(dataDir, "p", "a", "01");
    let order = readPlanOrder(dataDir, "p");
    expect(order.tickets).toHaveLength(0);
    expect(order.features).toHaveLength(1);

    dropOrder(dataDir, "p", "a");
    order = readPlanOrder(dataDir, "p");
    expect(order.features).toHaveLength(0);
  });

  it("프로젝트가 다르면 섞이지 않는다(키의 일부)", () => {
    setFeatureOrder(dataDir, { project: "p1", feature: "a", track: "web", rank: 10, why: "…" });
    setFeatureOrder(dataDir, { project: "p2", feature: "a", track: "web", rank: 20, why: "…" });
    expect(readPlanOrder(dataDir, "p1").features[0]?.rank).toBe(10);
    expect(readPlanOrder(dataDir, "p2").features[0]?.rank).toBe(20);
  });

  it("history.md — 변경마다 한 줄 는다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    const history = readFileSync(join(dataDir, "history.md"), "utf8").trim().split("\n");
    expect(history).toHaveLength(2);
  });

  it("set — 새로 등록되면 whyNeedsReview 는 false", () => {
    const entry = setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    expect(entry.whyNeedsReview).toBe(false);
  });
});

describe("스키마 마이그레이션 — 옛 모양 DB(캡틴 DB 재현, 🔴 새 DB 만으로는 이 결함을 못 잡는다)", () => {
  /** `why_needs_review` 가 생기기 전의 원시 `feature_order`/`ticket_order` 모양을 그대로 만든다. */
  function oldShapeDb(): DatabaseSyncType {
    const db = new DatabaseSync(join(dataDir, "plan.db"));
    db.exec(`
      CREATE TABLE feature_order (
        project TEXT NOT NULL, feature TEXT NOT NULL, track TEXT NOT NULL,
        rank REAL NOT NULL, why TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (project, feature)
      );
      CREATE TABLE ticket_order (
        project TEXT NOT NULL, feature TEXT NOT NULL, ticket TEXT NOT NULL,
        step INTEGER NOT NULL, why TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY (project, feature, ticket)
      );
    `);
    return db;
  }

  it("feature_order 에 닻 칸이 없는 옛 DB — 실측 오류(no such column)를 이제 안 낸다", () => {
    const db = oldShapeDb();
    db.prepare(
      `INSERT INTO feature_order (project, feature, track, rank, why, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("p", "a", "web", 10, "옛 이유", "2026-01-01T00:00:00.000Z");
    db.close();

    // 🔴 이 줄은 닻(왜를 마지막으로 적었을 때의 자리)이 한 번도 기록된 적 없다 — "제자리인지
    // 모른다" 를 조용히 "제자리다" 로 접지 않는다(development-order/15 후속). `set` 을 다시
    // 하면 사라진다(끄는 길은 있다) — 옛 DB 로 읽고 쓴 뒤 테스트가 그것을 고정한다.
    const order = readPlanOrder(dataDir, "p");
    expect(order.features).toHaveLength(1);
    expect(order.features[0]).toMatchObject({ feature: "a", track: "web", rank: 10, whyNeedsReview: true });
  });

  it("옛 DB 로 읽고 쓴 뒤에도 다른 칸은 그대로다", () => {
    const db = oldShapeDb();
    db.prepare(
      `INSERT INTO ticket_order (project, feature, ticket, step, why, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("p", "a", "01", 1, "옛 이유", "2026-01-01T00:00:00.000Z");
    db.close();

    const updated = setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", why: "새 이유" });
    expect(updated).toMatchObject({ step: 1, why: "새 이유", whyNeedsReview: false });
  });

  it("db migrate — 옛 DB 를 올리면 추가된 칸을 보고한다", () => {
    oldShapeDb().close();
    const result = migratePlanDb(dataDir);
    expect(result.addedColumns).toEqual(
      expect.arrayContaining(["feature_order.why_track", "feature_order.why_rank", "ticket_order.why_step"]),
    );
  });

  it("db migrate — 이미 최신인 DB 는 아무것도 안 바꾼다(멱등)", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    const result = migratePlanDb(dataDir);
    expect(result).toEqual({ addedColumns: [], droppedColumns: [] });
  });

  it("db migrate 를 두 번 돌려도 두 번째는 아무것도 안 바꾼다", () => {
    oldShapeDb().close();
    migratePlanDb(dataDir);
    const second = migratePlanDb(dataDir);
    expect(second).toEqual({ addedColumns: [], droppedColumns: [] });
  });

  /**
   * `why_needs_review` 플래그가 있던 DB(티켓 04 시절 모양, 지금 실제로 이 저장소가 겪은 모양) —
   * 닻 모델로 옮긴 뒤(development-order/15 후속) 컬럼을 지운다. `oldShapeDb`(그 칸조차 없던 훨씬
   * 더 옛 모양)와는 다른 마이그레이션 경로를 탄다 — 둘 다 실측이라 따로 고정한다.
   */
  function reviewFlagShapeDb(): DatabaseSyncType {
    const db = new DatabaseSync(join(dataDir, "plan.db"));
    db.exec(`
      CREATE TABLE feature_order (
        project TEXT NOT NULL, feature TEXT NOT NULL, track TEXT NOT NULL,
        rank REAL NOT NULL, why TEXT NOT NULL, why_needs_review INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL, PRIMARY KEY (project, feature)
      );
      CREATE TABLE ticket_order (
        project TEXT NOT NULL, feature TEXT NOT NULL, ticket TEXT NOT NULL,
        step INTEGER NOT NULL, why TEXT NOT NULL, why_needs_review INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL, PRIMARY KEY (project, feature, ticket)
      );
    `);
    return db;
  }

  it("🔴 why_needs_review 가 0(깨끗)이던 줄은 지금 자리에 닻을 내려 조용하다", () => {
    const db = reviewFlagShapeDb();
    db.prepare(
      `INSERT INTO ticket_order (project, feature, ticket, step, why, why_needs_review, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    ).run("p", "a", "01", 3, "옛 이유", "2026-01-01T00:00:00.000Z");
    db.close();

    const order = readPlanOrder(dataDir, "p");
    expect(order.tickets[0]).toMatchObject({ step: 3, whyNeedsReview: false });
  });

  it("🔴 why_needs_review 가 1(더러움)이던 줄은 마이그레이션 뒤에도 확인 필요가 그대로다", () => {
    const db = reviewFlagShapeDb();
    db.prepare(
      `INSERT INTO ticket_order (project, feature, ticket, step, why, why_needs_review, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
    ).run("p", "a", "01", 3, "옛 이유", "2026-01-01T00:00:00.000Z");
    db.close();

    const order = readPlanOrder(dataDir, "p");
    expect(order.tickets[0]).toMatchObject({ step: 3, whyNeedsReview: true });

    // `set` 을 다시 하면 그때 비로소 닻이 지금 자리에 내려 조용해진다(끄는 길).
    const updated = setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", why: "다시 확인함" });
    expect(updated.whyNeedsReview).toBe(false);
  });

  it("db migrate — why_needs_review 가 있던 DB 는 그 컬럼을 지웠다고 보고한다", () => {
    reviewFlagShapeDb().close();
    const result = migratePlanDb(dataDir);
    expect(result.addedColumns).toEqual(
      expect.arrayContaining(["feature_order.why_track", "feature_order.why_rank", "ticket_order.why_step"]),
    );
    expect(result.droppedColumns).toEqual(
      expect.arrayContaining(["feature_order.why_needs_review", "ticket_order.why_needs_review"]),
    );
  });
});

describe("moveTicketStep — 티켓 칩을 다른 단계 줄로(티켓 04, 🔴 첫 커버)", () => {
  it("단계가 바뀌고 why 는 그대로, whyNeedsReview 가 선다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "원래 이유" });
    const moved = moveTicketStep(dataDir, { project: "p", feature: "a", ticket: "01", step: 3 });
    expect(moved).toMatchObject({ step: 3, why: "원래 이유", whyNeedsReview: true });
    const order = readPlanOrder(dataDir, "p");
    expect(order.tickets[0]).toMatchObject({ step: 3, whyNeedsReview: true });
  });

  it("다른 티켓의 단계는 안 바뀐다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "02", step: 2, why: "…" });
    moveTicketStep(dataDir, { project: "p", feature: "a", ticket: "01", step: 2 });
    const order = readPlanOrder(dataDir, "p");
    const t02 = order.tickets.find((t) => t.ticket === "02");
    expect(t02).toMatchObject({ step: 2, whyNeedsReview: false });
  });

  it("계획에 없는 티켓을 옮기려 하면 거절한다", () => {
    expect(() => moveTicketStep(dataDir, { project: "p", feature: "a", ticket: "99", step: 1 })).toThrow();
  });

  it("history.md 에 drag 한 줄이 남는다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    moveTicketStep(dataDir, { project: "p", feature: "a", ticket: "01", step: 2 });
    const history = readFileSync(join(dataDir, "history.md"), "utf8");
    expect(history).toContain("drag p a/01");
  });
});

describe("insertTicketStep — 줄 사이에 놓으면 새 단계가 생기고 뒤가 밀린다(티켓 04, 🔴 첫 커버)", () => {
  it("새 단계를 받고 그 이후 단계는 전부 +1 씩 밀린다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "02", step: 2, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "03", step: 3, why: "…" });

    const moved = insertTicketStep(dataDir, { project: "p", feature: "a", ticket: "03", afterStep: 1 });
    expect(moved.step).toBe(2);

    const order = readPlanOrder(dataDir, "p");
    const byTicket = Object.fromEntries(order.tickets.map((t) => [t.ticket, t.step]));
    expect(byTicket).toEqual({ "01": 1, "03": 2, "02": 3 });
  });

  it("옮긴 티켓만 whyNeedsReview 가 선다 — 밀린 줄은 안 바뀐다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "02", step: 2, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "b", ticket: "01", step: 5, why: "…" });

    // afterStep=3 → a/02 는 2 에서 4 로(닻과 갈라진다), b/01 은 밀려서 5 에서 6 으로(닻도 같이 밀린다).
    insertTicketStep(dataDir, { project: "p", feature: "a", ticket: "02", afterStep: 3 });

    const order = readPlanOrder(dataDir, "p");
    const moved = order.tickets.find((t) => t.feature === "a" && t.ticket === "02");
    const shifted = order.tickets.find((t) => t.feature === "b" && t.ticket === "01");
    expect(moved).toMatchObject({ step: 4, whyNeedsReview: true });
    expect(shifted).toMatchObject({ step: 6, whyNeedsReview: false }); // 밀렸지만 확인 필요는 안 붙는다
  });

  it("🔴 놓인 자리가 닻(마지막으로 이유를 적은 단계)과 같으면 확인 필요가 안 선다 — 돌아오면 꺼진다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "02", step: 4, why: "닻 = 4" });

    // afterStep=1 → newStep=2 (닻과 다르다) → 확인 필요가 선다.
    const away = insertTicketStep(dataDir, { project: "p", feature: "a", ticket: "02", afterStep: 1 });
    expect(away).toMatchObject({ step: 2, whyNeedsReview: true });

    // moveTicketStep 으로 닻(4)까지 그대로 돌려놓으면 확인 필요가 저절로 꺼진다.
    const back = moveTicketStep(dataDir, { project: "p", feature: "a", ticket: "02", step: 4 });
    expect(back).toMatchObject({ step: 4, whyNeedsReview: false });
  });

  it("history.md 에 drag 한 줄이 남는다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    insertTicketStep(dataDir, { project: "p", feature: "a", ticket: "01", afterStep: 0 });
    const history = readFileSync(join(dataDir, "history.md"), "utf8");
    expect(history).toContain("drag p a/01");
    expect(history).toContain("새 단계");
  });
});

describe("moveFeatureOrder — 기능 카드를 끈다(티켓 04, 🔴 첫 커버)", () => {
  it("같은 트랙 안 이웃 사이에 끼우면 그 순위만 바뀐다 — 다른 줄은 그대로", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "…" });

    const moved = moveFeatureOrder(dataDir, {
      project: "p",
      feature: "b",
      track: "web",
      beforeRank: 10,
      afterRank: 20,
    });
    expect(moved).toMatchObject({ rank: 15, track: "web", whyNeedsReview: true });

    const order = readPlanOrder(dataDir, "p");
    expect(order.features.find((f) => f.feature === "a")).toMatchObject({ rank: 10, whyNeedsReview: false });
  });

  it("맨 앞에 놓으면(beforeRank null) 그 이웃보다 작은 순위를 받는다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "…" });
    const moved = moveFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", beforeRank: null, afterRank: 10 });
    expect(moved.rank).toBeLessThan(10);
  });

  it("맨 끝에 놓으면(afterRank null) 가장 큰 순위보다 크다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "…" });
    const moved = moveFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", beforeRank: 20, afterRank: null });
    expect(moved.rank).toBeGreaterThan(20);
  });

  it("다른 트랙으로 끌면 트랙이 바뀐다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    const moved = moveFeatureOrder(dataDir, {
      project: "p",
      feature: "a",
      track: "backend",
      beforeRank: null,
      afterRank: null,
    });
    expect(moved.track).toBe("backend");
    expect(moved.rank).toBe(10); // 빈 트랙의 첫 자리
  });

  it("`why` 는 그대로다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "원래 이유" });
    const moved = moveFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", beforeRank: null, afterRank: null });
    expect(moved.why).toBe("원래 이유");
  });

  it("계획에 없는 기능을 옮기려 하면 거절한다", () => {
    expect(() =>
      moveFeatureOrder(dataDir, { project: "p", feature: "no-such", track: "web", beforeRank: null, afterRank: null }),
    ).toThrow();
  });

  // 🔴 첫 커버 — 캡틴이 실제로 겪은 버그(2026-08-11): "feature를 원래 자리로 돌려놓아도
  // '확인 필요'가 뜬다." `set-feature` 로 성긴 값(10·20)이 아닌 임의 순위(25)를 적어 둔 솔로
  // 기능을 다른 트랙으로 끌었다 되돌리면, 비어 있던 트랙에 다시 들어갈 때 `firstRank()`(고정
  // 상수 10)가 원래 순위(25)를 덮어써 닻과 영영 안 맞았다 — 자리는 같은데 번호만 바뀌었다.
  it("성긴 값이 아닌 임의 순위로 등록한 솔로 기능을 다른 트랙으로 끌었다 되돌리면 — 확인 필요가 꺼진다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 25, why: "닻 = web/25" });

    const away = moveFeatureOrder(dataDir, { project: "p", feature: "a", track: "backend", beforeRank: null, afterRank: null });
    expect(away.whyNeedsReview).toBe(true); // 트랙이 달라졌으니 맞다

    const back = moveFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", beforeRank: null, afterRank: null });
    expect(back).toMatchObject({ track: "web", rank: 25, whyNeedsReview: false });
  });

  it("이웃과 함께 있어도 지금 순위가 이미 요청한 자리에 들어맞으면 번호를 안 바꾼다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 25, why: "…" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 30, why: "…" });
    // a(25)는 이미 [0, 30) 사이 — 그 자리를 다시 요청하면 25 그대로 남아야 한다(중간값 15로 안 바뀐다).
    const moved = moveFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", beforeRank: null, afterRank: 30 });
    expect(moved.rank).toBe(25);
  });

  it("🔴 놓인 자리(트랙·순위)가 닻과 같으면 확인 필요가 안 선다 — 돌아오면 꺼진다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "닻 = web/10" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "…" });

    const away = moveFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", beforeRank: 20, afterRank: null });
    expect(away.rank).toBeGreaterThan(20);
    expect(away.whyNeedsReview).toBe(true);

    const back = moveFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", beforeRank: null, afterRank: 20 });
    expect(back).toMatchObject({ track: "web", rank: 10, whyNeedsReview: false });
  });
});

// 🔴 첫 커버 — 캡틴 지시(2026-08-11): "track 이름을 내가 수정 가능하게 해." 이름만 바꾼다,
// 그 트랙에 있던 모든 기능이 한꺼번에 새 이름을 받는다. 순위·왜·닻은 이름만 따라간다 —
// 사람이 그 기능을 옮긴 게 아니므로 확인 필요가 새로 서면 안 된다.
describe("renameTrack — 트랙 이름표만 바꾼다(🔴 첫 커버)", () => {
  it("그 트랙의 모든 기능이 새 이름을 받는다 — 순위·왜는 그대로", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "이유 A" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "이유 B" });
    setFeatureOrder(dataDir, { project: "p", feature: "c", track: "backend", rank: 10, why: "안 건드림" });

    renameTrack(dataDir, { project: "p", track: "web", newTrack: "frontend" });

    const order = readPlanOrder(dataDir, "p");
    const a = order.features.find((f) => f.feature === "a");
    const b = order.features.find((f) => f.feature === "b");
    const c = order.features.find((f) => f.feature === "c");
    expect(a).toMatchObject({ track: "frontend", rank: 10, why: "이유 A" });
    expect(b).toMatchObject({ track: "frontend", rank: 20, why: "이유 B" });
    expect(c).toMatchObject({ track: "backend", rank: 10 }); // 다른 트랙은 안 건드린다
  });

  it("이름만 바뀐 것이지 사람이 옮긴 게 아니다 — 확인 필요가 새로 안 선다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "닻 = web/10" });
    renameTrack(dataDir, { project: "p", track: "web", newTrack: "frontend" });
    const order = readPlanOrder(dataDir, "p");
    expect(order.features.find((f) => f.feature === "a")).toMatchObject({
      track: "frontend",
      whyNeedsReview: false,
    });
  });

  it("이미 확인 필요였던 기능은(닻이 어긋나 있던) 이름만 바뀌어도 그대로 확인 필요다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setFeatureOrder(dataDir, { project: "p", feature: "b", track: "web", rank: 20, why: "…" });
    moveFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", beforeRank: 20, afterRank: null }); // 닻(10)과 다른 순위로 옮겨 어긋나게 만든다
    const before = readPlanOrder(dataDir, "p").features.find((f) => f.feature === "a")!;
    expect(before.whyNeedsReview).toBe(true);

    renameTrack(dataDir, { project: "p", track: "web", newTrack: "frontend" });
    const after = readPlanOrder(dataDir, "p").features.find((f) => f.feature === "a")!;
    expect(after).toMatchObject({ track: "frontend", whyNeedsReview: true });
  });

  it("그런 트랙이 없으면 거절한다", () => {
    expect(() => renameTrack(dataDir, { project: "p", track: "no-such", newTrack: "x" })).toThrow();
  });

  it("새 이름이 비어 있으면 거절한다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    expect(() => renameTrack(dataDir, { project: "p", track: "web", newTrack: "   " })).toThrow();
  });

  it("새 이름이 지금 이름과 같으면 아무 것도 안 바뀐다(조용히 끝)", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    const before = readPlanOrder(dataDir, "p");
    renameTrack(dataDir, { project: "p", track: "web", newTrack: "web" });
    expect(readPlanOrder(dataDir, "p")).toEqual(before);
  });
});

describe("dropStaleCompleted — 완료되면 스스로 빠진다(development-order/08, 🔴 첫 커버)", () => {
  it("완료된 티켓만 지우고, 지운 목록을 돌려준다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "02", step: 2, why: "…" });
    const features = [feature("a", [ticket("01", { status: "done" }), ticket("02")])];

    const dropped = dropStaleCompleted(dataDir, "p", features);
    expect(dropped).toEqual([{ feature: "a", ticket: "01" }]);

    const order = readPlanOrder(dataDir, "p");
    expect(order.tickets.map((t) => t.ticket)).toEqual(["02"]);
  });

  it("wontfix(dropped)도 완료로 본다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    const features = [feature("a", [ticket("01", { status: "dropped" })])];
    const dropped = dropStaleCompleted(dataDir, "p", features);
    expect(dropped).toEqual([{ feature: "a", ticket: "01" }]);
  });

  it("완료 안 된 티켓은 안 건드린다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    const features = [feature("a", [ticket("01")])];
    expect(dropStaleCompleted(dataDir, "p", features)).toEqual([]);
    expect(readPlanOrder(dataDir, "p").tickets).toHaveLength(1);
  });

  it("다른 프로젝트의 계획은 안 건드린다", () => {
    setTicketOrder(dataDir, { project: "p1", feature: "a", ticket: "01", step: 1, why: "…" });
    setTicketOrder(dataDir, { project: "p2", feature: "a", ticket: "01", step: 1, why: "…" });
    const features = [feature("a", [ticket("01", { status: "done" })])];
    dropStaleCompleted(dataDir, "p1", features);
    expect(readPlanOrder(dataDir, "p1").tickets).toHaveLength(0);
    expect(readPlanOrder(dataDir, "p2").tickets).toHaveLength(1); // p2 는 안 건드림
  });

  it("feature_order(기능 트랙·순위)는 안 건드린다 — 티켓 줄만 지운다", () => {
    setFeatureOrder(dataDir, { project: "p", feature: "a", track: "web", rank: 10, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    const features = [feature("a", [ticket("01", { status: "done" })])];
    dropStaleCompleted(dataDir, "p", features);
    const order = readPlanOrder(dataDir, "p");
    expect(order.features).toHaveLength(1);
    expect(order.tickets).toHaveLength(0);
  });

  it("history.md 에 drop 한 줄이 남는다", () => {
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    const features = [feature("a", [ticket("01", { status: "done" })])];
    dropStaleCompleted(dataDir, "p", features);
    const history = readFileSync(join(dataDir, "history.md"), "utf8");
    expect(history).toContain("drop p a/01");
  });
});
