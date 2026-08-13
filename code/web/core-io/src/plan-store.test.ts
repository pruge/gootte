import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Feature } from "@gootte/contract";
import {
  clearStep,
  ensureReadSeed,
  markDocRead,
  migratePlanDb,
  readPlacements,
  readPlacementsWithAutoClose,
  readReadMarks,
  readSteps,
  writePlanMove,
  writeStep,
} from "./plan-store";

/** 티켓 하나짜리 기능 — `done` 이면 상자가 채워진 것(04, `ticketBoxState`). */
function feature(slug: string, ticketStatus: "done" | "pending"): Feature {
  return {
    slug,
    title: `${slug} — 제목`,
    status: "pending",
    sourceStatus: null,
    statusKnown: true,
    docs: [],
    tickets: [
      {
        num: "01",
        slug: "01-x",
        path: "issues/01-x.md",
        title: "티켓 01",
        status: ticketStatus,
        sourceStatus: null,
        statusKnown: true,
        blockedBy: [],
        unreadableBlockedBy: [],
        waitingOn: [],
        startable: true,
        workedBy: [],
        needsCaptainEye: false,
      },
    ],
  };
}

/**
 * 계획 저장소 — 임시 디렉토리 픽스처(이 저장소 자신의 `~/.gootte` 를 건드리지 않는다).
 *
 * 🔴 읽기 테스트의 준비는 **테스트가 직접 SQL 로** 넣는다 — 그래야 이 테스트가 스키마의 실제 칸
 * 이름까지 함께 못 박고, 쓰기 함수의 버그가 읽기 테스트를 통과시키는 일이 없다.
 * 쓰기(`writePlanMove`, 03)는 아래에서 따로 잰다.
 */
type DatabaseSyncCtor = new (path: string) => DatabaseSyncType;
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-plan-"));
});
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

function insert(
  project: string,
  feature: string,
  area: string,
  seq: number,
  closedAt: string | null = null,
): void {
  const db = new DatabaseSync(join(dataDir, "plan.db"));
  try {
    db.prepare(`INSERT INTO placement (project, feature, area, seq, closed_at) VALUES (?, ?, ?, ?, ?)`).run(
      project,
      feature,
      area,
      seq,
      closedAt,
    );
  } finally {
    db.close();
  }
}

describe("migratePlanDb — 표 둘(spec §저장 형태)", () => {
  test("표를 만든다 — placement · step", () => {
    migratePlanDb(dataDir);
    const db = new DatabaseSync(join(dataDir, "plan.db"));
    const names = (db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as unknown as {
      name: string;
    }[]).map((r) => r.name);
    db.close();
    expect(names).toContain("placement");
    expect(names).toContain("step");
  });

  test("두 번 돌려도 바뀐 것이 없다(멱등)", () => {
    migratePlanDb(dataDir);
    expect(migratePlanDb(dataDir)).toEqual({ addedColumns: [], droppedColumns: [] });
  });

  test("🔴 08 — 옛 INTEGER `step.step` 칸을 만나면 REAL 로 다시 만든다", () => {
    const db = new DatabaseSync(join(dataDir, "plan.db"));
    db.exec(`
      CREATE TABLE placement (
        project TEXT NOT NULL, feature TEXT NOT NULL,
        area TEXT NOT NULL CHECK (area IN ('active','reserved','discarded','done')),
        seq INTEGER NOT NULL, closed_at TEXT, PRIMARY KEY (project, feature)
      );
      CREATE TABLE step (
        project TEXT NOT NULL, feature TEXT NOT NULL, ticket TEXT NOT NULL,
        step INTEGER NOT NULL, PRIMARY KEY (project, feature, ticket)
      );
    `);
    db.prepare(`INSERT INTO step (project, feature, ticket, step) VALUES (?, ?, ?, ?)`).run(
      "alpha",
      "f",
      "01-x",
      1,
    );
    db.close();

    const result = migratePlanDb(dataDir);
    expect(result.droppedColumns).toHaveLength(1);
    expect(result.droppedColumns[0]).toContain("INTEGER → REAL");
    // 옛 단계 값은 잃어도 되는 물건이다(spec §범위 밖) — 표는 비어서 다시 시작한다.
    expect(readSteps(dataDir, "alpha")).toEqual([]);
    // 새 칸은 정수 아닌 값도 그대로 받는다.
    writeStep(dataDir, "alpha", "f", "01-x", 1.5);
    expect(readSteps(dataDir, "alpha")).toEqual([{ feature: "f", ticket: "01-x", step: 1.5 }]);
  });
});

describe("readPlacements — 있는 행만 돌려준다", () => {
  test("🔴 행이 하나도 없으면 빈 목록 — '대기' 를 채워 넣지 않는다", () => {
    migratePlanDb(dataDir);
    expect(readPlacements(dataDir, "alpha")).toEqual([]);
  });

  test("DB 가 아직 없어도 빈 목록이지 오류가 아니다 — 표를 세우고 읽는다", () => {
    expect(readPlacements(dataDir, "alpha")).toEqual([]);
  });

  test("자리·순서·닫힌 시각을 그대로 읽는다", () => {
    migratePlanDb(dataDir);
    insert("alpha", "auth-login", "active", 0);
    insert("alpha", "shipped", "done", 3, "2026-08-12T09:30:00+09:00");
    const rows = readPlacements(dataDir, "alpha").sort((a, b) => a.feature.localeCompare(b.feature));
    expect(rows).toEqual([
      { feature: "auth-login", area: "active", seq: 0, closedAt: null },
      { feature: "shipped", area: "done", seq: 3, closedAt: "2026-08-12T09:30:00+09:00" },
    ]);
  });

  test("다른 프로젝트의 행은 섞이지 않는다", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "active", 0);
    insert("bravo", "b", "active", 0);
    expect(readPlacements(dataDir, "alpha").map((p) => p.feature)).toEqual(["a"]);
    expect(readPlacements(dataDir, "bravo").map((p) => p.feature)).toEqual(["b"]);
  });

  test("🔴 대기를 뜻하는 값은 area 칸에 들어가지 못한다 — 스키마가 막는다", () => {
    migratePlanDb(dataDir);
    expect(() => insert("alpha", "a", "waiting", 0)).toThrow();
  });

  test("한 기능은 자리를 하나만 갖는다 — 같은 (project, feature) 두 번은 거절", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "active", 0);
    expect(() => insert("alpha", "a", "reserved", 1)).toThrow();
  });
});

/**
 * 캡틴이 옮긴 결과 쓰기(plan-board/03) — **자리·순서 변경이 새로고침 뒤에도 남는가**.
 * 무엇을 쓸지 정하는 규칙은 `core/src/plan/move.test.ts` 가 덮는다(판정 자리는 하나뿐).
 * 여기서 보는 것은 그 값이 실제 표에 그대로 앉는가다.
 */
describe("writePlanMove — 덮어쓰기뿐(이력 없음)", () => {
  const step = (feature: string, ticket: string, s = 9999) => ({ feature, ticket, step: s });

  test("자리 행이 없으면 만든다 — 새로 읽어도 그대로다", () => {
    writePlanMove(dataDir, "alpha", {
      upsert: [{ feature: "a", area: "active", seq: 0, closedAt: null }],
      remove: [],
      clearSteps: [],
      setSteps: [],
    });
    expect(readPlacements(dataDir, "alpha")).toEqual([
      { feature: "a", area: "active", seq: 0, closedAt: null },
    ]);
  });

  test("이미 있는 행은 덮어쓴다 — 자리도 순서도 닫힌 시각도", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "active", 3);
    writePlanMove(dataDir, "alpha", {
      upsert: [{ feature: "a", area: "done", seq: 0, closedAt: "2026-08-12 17:40" }],
      remove: [],
      clearSteps: [],
      setSteps: [],
    });
    expect(readPlacements(dataDir, "alpha")).toEqual([
      { feature: "a", area: "done", seq: 0, closedAt: "2026-08-12 17:40" },
    ]);
  });

  test("🔴 대기로 보내면 행이 사라진다 — 대기를 뜻하는 값을 적지 않는다(INV-B1)", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "active", 0);
    writePlanMove(dataDir, "alpha", { upsert: [], remove: ["a"], clearSteps: [], setSteps: [] });
    expect(readPlacements(dataDir, "alpha")).toEqual([]);
  });

  test("단계를 붙이고 뗀다 — 떠난 기능의 단계 행은 남지 않는다", () => {
    writePlanMove(dataDir, "alpha", {
      upsert: [{ feature: "up", area: "active", seq: 0, closedAt: null }],
      remove: [],
      clearSteps: [],
      setSteps: [step("up", "01-x"), step("up", "02-x")],
    });
    expect(readSteps(dataDir, "alpha")).toEqual([step("up", "01-x"), step("up", "02-x")]);

    writePlanMove(dataDir, "alpha", {
      upsert: [{ feature: "up", area: "reserved", seq: 0, closedAt: null }],
      remove: [],
      clearSteps: ["up"],
      setSteps: [],
    });
    expect(readSteps(dataDir, "alpha")).toEqual([]);
  });

  test("🔴 되올릴 때 옛 단계 행을 먼저 턴다 — 문서에서 사라진 티켓의 숫자가 살아남지 않게", () => {
    writePlanMove(dataDir, "alpha", {
      upsert: [],
      remove: [],
      clearSteps: [],
      setSteps: [step("f", "01-x", 1), step("f", "02-x", 2)],
    });
    // 티켓 02 가 문서에서 사라진 뒤 다시 올린 모양 — 01 만 9999 로 붙는다.
    writePlanMove(dataDir, "alpha", {
      upsert: [],
      remove: [],
      clearSteps: [],
      setSteps: [step("f", "01-x")],
    });
    expect(readSteps(dataDir, "alpha")).toEqual([step("f", "01-x")]);
  });

  test("다른 프로젝트의 행은 건드리지 않는다", () => {
    migratePlanDb(dataDir);
    insert("bravo", "a", "active", 0);
    writePlanMove(dataDir, "alpha", {
      upsert: [{ feature: "a", area: "done", seq: 0, closedAt: null }],
      remove: ["a"],
      clearSteps: ["a"],
      setSteps: [],
    });
    expect(readPlacements(dataDir, "bravo")).toEqual([
      { feature: "a", area: "active", seq: 0, closedAt: null },
    ]);
  });

  test("한 트랜잭션이다 — 중간에 걸리면 아무것도 남지 않는다", () => {
    migratePlanDb(dataDir);
    insert("alpha", "keep", "active", 0);
    expect(() =>
      writePlanMove(dataDir, "alpha", {
        // 두 번째 행의 area 가 스키마 CHECK 을 어긴다 — 첫 행도 함께 되돌아가야 한다.
        upsert: [
          { feature: "keep", area: "reserved", seq: 0, closedAt: null },
          { feature: "bad", area: "waiting" as never, seq: 1, closedAt: null },
        ],
        remove: [],
        clearSteps: [],
        setSteps: [],
      }),
    ).toThrow();
    expect(readPlacements(dataDir, "alpha")).toEqual([
      { feature: "keep", area: "active", seq: 0, closedAt: null },
    ]);
  });

  test("쓸 것이 없으면 아무 일도 없다", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "active", 0);
    writePlanMove(dataDir, "alpha", { upsert: [], remove: [], clearSteps: [], setSteps: [] });
    expect(readPlacements(dataDir, "alpha")).toEqual([
      { feature: "a", area: "active", seq: 0, closedAt: null },
    ]);
  });
});

/**
 * `readPlacementsWithAutoClose` — 판을 보는 모든 길(HTTP `readBoard` 도 CLI `board`·`next` 도)이
 * 지나는 자동 닫힘(04) 자리. 판정(`planAutoClose`)은 core 테스트가 이미 재므로, 여기서는
 * 이 함수가 그 판정을 **쓰고 다시 읽는가**만 잰다.
 */
describe("readPlacementsWithAutoClose — 04 를 태우고 다시 읽는 자리(HTTP 도 CLI 도 여기를 지난다)", () => {
  test("상자가 전부 채워진 기능은 완료 칸으로 닫힌다", () => {
    migratePlanDb(dataDir);
    const placements = readPlacementsWithAutoClose(dataDir, "alpha", [feature("done-one", "done")]);
    expect(placements).toEqual([{ feature: "done-one", area: "done", seq: 0, closedAt: null }]);
    // 쓴 값이 실제로 DB 에 남았다 — 다음 read 도 같은 판을 본다.
    expect(readPlacements(dataDir, "alpha")).toEqual(placements);
  });

  test("상자가 남은 기능은 닫지 않는다", () => {
    migratePlanDb(dataDir);
    insert("alpha", "half-done", "active", 0);
    const placements = readPlacementsWithAutoClose(dataDir, "alpha", [feature("half-done", "pending")]);
    expect(placements).toEqual([{ feature: "half-done", area: "active", seq: 0, closedAt: null }]);
  });

  test("이미 완료 칸에 있는 카드는 다시 쓰지 않는다(멱등)", () => {
    migratePlanDb(dataDir);
    const first = readPlacementsWithAutoClose(dataDir, "alpha", [feature("done-one", "done")]);
    const second = readPlacementsWithAutoClose(dataDir, "alpha", [feature("done-one", "done")]);
    expect(second).toEqual(first);
  });

  /**
   * plan-board/11 — 방아쇠는 읽음 기록(`ticket.unread`)이다. 첫 read 는 항상
   * `ensureReadSeed` 가 그때 있던 티켓을 읽음으로 깐 뒤이므로(spec §첫 화면이 통째로 초록이면
   * 안 된다), "안 읽은 티켓" 을 만들려면 먼저 한 번 깔고 그 뒤에 새 티켓을 더해야 한다 —
   * 아래 테스트들이 공유하는 패턴이다.
   */
  function addTicket(f: Feature, num: string, path: string): Feature {
    const firstTicket = f.tickets[0];
    if (!firstTicket) throw new Error("fixture must have one ticket");
    return { ...f, tickets: [...f.tickets, { ...firstTicket, num, slug: `${num}-x`, path, status: "pending" }] };
  }

  test("🔴 저절로 닫힌 카드에 안 읽은 티켓이 생기면 대기로 돌아온다(plan-board/11) — 자리 행이 사라진다", () => {
    migratePlanDb(dataDir);
    // 저절로 닫힌다(closed_at 없음) — 이 read 가 있던 티켓을 읽음으로 깐다.
    readPlacementsWithAutoClose(dataDir, "alpha", [feature("a", "done")]);
    expect(readPlacements(dataDir, "alpha")).toEqual([
      { feature: "a", area: "done", seq: 0, closedAt: null },
    ]);
    // 안 읽은 새 티켓이 생긴다 — 다음 read 에서 자리 행이 사라진다(대기로 돌아온다, INV-B1).
    const withNewTicket = addTicket(feature("a", "done"), "02", "issues/02-x.md");
    const placements = readPlacementsWithAutoClose(dataDir, "alpha", [withNewTicket]);
    expect(placements).toEqual([]);
    expect(readPlacements(dataDir, "alpha")).toEqual([]);
  });

  test("🔴 캡틴이 손으로 완료에 내려둔 카드(closed_at 있음)도 안 읽은 티켓이 생기면 대기로 돌아온다 — 10 의 반대, 캡틴 결정(plan-board/11)", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "done", 0, "2026-08-01 09:00");
    // 있던 티켓을 읽음으로 깐다.
    readPlacementsWithAutoClose(dataDir, "alpha", [feature("a", "done")]);
    expect(readPlacements(dataDir, "alpha")).toEqual([
      { feature: "a", area: "done", seq: 0, closedAt: "2026-08-01 09:00" },
    ]);
    // 안 읽은 새 티켓이 생긴다 — 캡틴이 손으로 닫아 두었어도 이제는 대기로 돌아온다.
    const withNewTicket = addTicket(feature("a", "done"), "02", "issues/02-x.md");
    const placements = readPlacementsWithAutoClose(dataDir, "alpha", [withNewTicket]);
    expect(placements).toEqual([]);
    expect(readPlacements(dataDir, "alpha")).toEqual([]);
  });

  test("🔴 예약·폐기 칸의 카드도 안 읽은 티켓이 생기면 대기로 올라온다 — 칸이 셋으로 넓어졌다", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "reserved", 0);
    insert("alpha", "b", "discarded", 0);
    readPlacementsWithAutoClose(dataDir, "alpha", [feature("a", "pending"), feature("b", "pending")]);

    const withNewTicketA = addTicket(feature("a", "pending"), "02", "issues/02-x.md");
    const withNewTicketB = addTicket(feature("b", "pending"), "02", "issues/02-x.md");
    const placements = readPlacementsWithAutoClose(dataDir, "alpha", [withNewTicketA, withNewTicketB]);
    expect(placements).toEqual([]);
  });

  test("처음 켠 직후에는 예약·폐기 칸의 카드가 안 움직인다 — 읽음 기록의 첫 깔기가 막는다", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "reserved", 0);
    insert("alpha", "b", "discarded", 0);
    const placements = readPlacementsWithAutoClose(dataDir, "alpha", [
      feature("a", "pending"),
      feature("b", "pending"),
    ]).sort((x, y) => x.feature.localeCompare(y.feature));
    expect(placements).toEqual([
      { feature: "a", area: "reserved", seq: 0, closedAt: null },
      { feature: "b", area: "discarded", seq: 0, closedAt: null },
    ]);
  });

  test("🔴 다 읽은 카드는 안 끝난 티켓을 안고 있어도 그 자리에 그대로다 — 칸이 비워지지 않는다", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "reserved", 0);
    // 있는 티켓(미완, pending)을 읽음으로 깐다 — 처리 여부와 무관하게 조용해야 한다.
    const placements = readPlacementsWithAutoClose(dataDir, "alpha", [feature("a", "pending")]);
    expect(placements).toEqual([{ feature: "a", area: "reserved", seq: 0, closedAt: null }]);
  });

  test("🔴 읽지 않고 도로 예약에 내려놓아도 또 대기로 올라온다 — 캡틴 결정(plan-board/11)", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "reserved", 0);
    readPlacementsWithAutoClose(dataDir, "alpha", [feature("a", "pending")]); // 있던 티켓을 읽음으로 깐다.
    const withNewTicket = addTicket(feature("a", "pending"), "02", "issues/02-x.md");

    // 1) 안 읽은 새 티켓이 생겨 대기로 올라온다(행이 사라진다).
    expect(readPlacementsWithAutoClose(dataDir, "alpha", [withNewTicket])).toEqual([]);

    // 2) 캡틴이 읽지 않고 도로 예약에 내려놓는다.
    writePlanMove(dataDir, "alpha", {
      upsert: [{ feature: "a", area: "reserved", seq: 0, closedAt: null }],
      remove: [],
      clearSteps: [],
      setSteps: [],
    });

    // 3) 다음 read 에서 또 대기로 올라온다 — 내려놓기는 읽음이 아니다.
    expect(readPlacementsWithAutoClose(dataDir, "alpha", [withNewTicket])).toEqual([]);
  });

  test("🔴 읽은 뒤 도로 내려놓으면 그 자리에 남는다", () => {
    migratePlanDb(dataDir);
    insert("alpha", "a", "reserved", 0);
    readPlacementsWithAutoClose(dataDir, "alpha", [feature("a", "pending")]); // 있던 티켓을 읽음으로 깐다.
    const withNewTicket = addTicket(feature("a", "pending"), "02", "issues/02-x.md");
    expect(readPlacementsWithAutoClose(dataDir, "alpha", [withNewTicket])).toEqual([]);

    // 캡틴이 새 티켓을 읽는다.
    markDocRead(dataDir, "alpha", "a", "issues/02-x.md");
    // 그리고 도로 예약에 내려놓는다.
    writePlanMove(dataDir, "alpha", {
      upsert: [{ feature: "a", area: "reserved", seq: 0, closedAt: null }],
      remove: [],
      clearSteps: [],
      setSteps: [],
    });

    // 읽었으니 다음 read 에도 그 자리에 그대로 있다.
    expect(readPlacementsWithAutoClose(dataDir, "alpha", [withNewTicket])).toEqual([
      { feature: "a", area: "reserved", seq: 0, closedAt: null },
    ]);
  });

  test("🔴 읽음 기록을 못 읽으면 대기 복귀만 조용해진다 — 판 자체는 문서만으로 그대로 선다(INV-U1, plan-board/11)", () => {
    const db = new DatabaseSync(join(dataDir, "plan.db"));
    db.exec(`
      CREATE TABLE placement (
        project TEXT NOT NULL, feature TEXT NOT NULL,
        area TEXT NOT NULL CHECK (area IN ('active','reserved','discarded','done')),
        seq INTEGER NOT NULL, closed_at TEXT, PRIMARY KEY (project, feature)
      );
      CREATE TABLE step (
        project TEXT NOT NULL, feature TEXT NOT NULL, ticket TEXT NOT NULL,
        step REAL NOT NULL, PRIMARY KEY (project, feature, ticket)
      );
      -- read_mark 를 일부러 망가뜨린다 — path 칸이 없다. CREATE TABLE IF NOT EXISTS 는 이미 있는
      -- 표를 그대로 두므로, 이 망가진 모양이 open() 을 지나서도 살아남는다.
      CREATE TABLE read_mark (project TEXT NOT NULL, feature TEXT NOT NULL);
      CREATE TABLE read_seed (project TEXT NOT NULL PRIMARY KEY, seeded_at TEXT NOT NULL);
    `);
    db.prepare(`INSERT INTO placement (project, feature, area, seq, closed_at) VALUES (?, ?, ?, ?, ?)`).run(
      "alpha",
      "a",
      "reserved",
      0,
      null,
    );
    db.close();

    const placements = readPlacementsWithAutoClose(dataDir, "alpha", [feature("a", "pending")]);
    // 읽음 기록이 막혀도 판은 문서만으로 그대로 선다 — 다만 대기 복귀는 안 일어난다.
    expect(placements).toEqual([{ feature: "a", area: "reserved", seq: 0, closedAt: null }]);
  });
});

/**
 * `step` · `step --clear` 가 실제로 닿는 칸(plan-board/05) — 판정(누가 매길 수 있는지)은
 * `cli` 몫이고, 여기서는 값이 표에 그대로 앉는가만 잰다.
 */
describe("writeStep / clearStep — firstmate 가 매기고 떼는 칸", () => {
  test("없던 행을 새로 매긴다", () => {
    writeStep(dataDir, "alpha", "f", "01-x", 1);
    expect(readSteps(dataDir, "alpha")).toEqual([{ feature: "f", ticket: "01-x", step: 1 }]);
  });

  test("🔴 08 — 실수 단계도 그대로 담는다(사이에 끼워 넣기)", () => {
    writeStep(dataDir, "alpha", "f", "01-x", 1.5);
    expect(readSteps(dataDir, "alpha")).toEqual([{ feature: "f", ticket: "01-x", step: 1.5 }]);
  });

  test("이미 있는 행은 덮어쓴다 — 두 번째 매김이 이긴다", () => {
    writeStep(dataDir, "alpha", "f", "01-x", 9999);
    writeStep(dataDir, "alpha", "f", "01-x", 1);
    expect(readSteps(dataDir, "alpha")).toEqual([{ feature: "f", ticket: "01-x", step: 1 }]);
  });

  test("clearStep 은 그 행 하나만 뗀다", () => {
    writeStep(dataDir, "alpha", "f", "01-x", 1);
    writeStep(dataDir, "alpha", "f", "02-x", 2);
    clearStep(dataDir, "alpha", "f", "01-x");
    expect(readSteps(dataDir, "alpha")).toEqual([{ feature: "f", ticket: "02-x", step: 2 }]);
  });

  test("없는 행을 지워도 조용히 끝난다(멱등)", () => {
    migratePlanDb(dataDir);
    expect(() => clearStep(dataDir, "alpha", "f", "01-x")).not.toThrow();
  });

  test("다른 프로젝트의 행은 건드리지 않는다", () => {
    writeStep(dataDir, "alpha", "f", "01-x", 1);
    writeStep(dataDir, "bravo", "f", "01-x", 1);
    clearStep(dataDir, "alpha", "f", "01-x");
    expect(readSteps(dataDir, "alpha")).toEqual([]);
    expect(readSteps(dataDir, "bravo")).toEqual([{ feature: "f", ticket: "01-x", step: 1 }]);
  });
});

/** 여러 티켓을 가진 기능 하나 — 깔기(§첫 화면) 시험에 쓴다. */
function featureWithTickets(slug: string, paths: string[]): Feature {
  return {
    slug,
    title: `${slug} — 제목`,
    status: "pending",
    sourceStatus: null,
    statusKnown: true,
    docs: [],
    tickets: paths.map((path, i) => ({
      num: String(i + 1).padStart(2, "0"),
      slug: path.replace(/^issues\//, "").replace(/\.md$/, ""),
      path,
      title: `티켓 ${path}`,
      status: "pending",
      sourceStatus: null,
      statusKnown: true,
      blockedBy: [],
      unreadableBlockedBy: [],
      waitingOn: [],
      startable: true,
      workedBy: [],
      needsCaptainEye: false,
    })),
  };
}

/**
 * 읽음 기록(unread-tickets-show-themselves/01) — 저장·복원과 첫 화면 깔기를 잰다.
 * 판정(무엇이 안 읽음인가)은 `core/src/project/read-state.test.ts` 가 순수 함수로 이미 잰다.
 */
describe("readReadMarks / markDocRead — 읽음 기록 저장", () => {
  test("쓰고 다시 읽으면 그대로 나온다", () => {
    markDocRead(dataDir, "alpha", "f", "issues/01-x.md");
    expect(readReadMarks(dataDir, "alpha")).toEqual(new Set(["f/issues/01-x.md"]));
  });

  test("같은 티켓을 두 번 읽어도 한 번과 같다(멱등)", () => {
    markDocRead(dataDir, "alpha", "f", "issues/01-x.md");
    markDocRead(dataDir, "alpha", "f", "issues/01-x.md");
    expect(readReadMarks(dataDir, "alpha")).toEqual(new Set(["f/issues/01-x.md"]));
  });

  test("기록이 없으면 빈 집합 — 오류가 아니다", () => {
    expect(readReadMarks(dataDir, "alpha")).toEqual(new Set());
  });

  test("다른 프로젝트의 기록은 섞이지 않는다", () => {
    markDocRead(dataDir, "alpha", "f", "issues/01-x.md");
    markDocRead(dataDir, "bravo", "f", "issues/02-x.md");
    expect(readReadMarks(dataDir, "alpha")).toEqual(new Set(["f/issues/01-x.md"]));
    expect(readReadMarks(dataDir, "bravo")).toEqual(new Set(["f/issues/02-x.md"]));
  });
});

describe("ensureReadSeed — 처음 올라간 순간 있던 티켓만 읽음으로 깐다(spec §첫 화면)", () => {
  test("처음 깔면 그때 있던 티켓이 전부 읽음이 된다", () => {
    const features = [featureWithTickets("f", ["issues/01-x.md", "issues/02-x.md"])];
    ensureReadSeed(dataDir, "alpha", features);
    expect(readReadMarks(dataDir, "alpha")).toEqual(
      new Set(["f/issues/01-x.md", "f/issues/02-x.md"]),
    );
  });

  test("🔴 깔기는 한 번만 선다 — 이미 깔린 뒤에 생긴 새 티켓은 안 읽음으로 남는다", () => {
    const before = [featureWithTickets("f", ["issues/01-x.md"])];
    ensureReadSeed(dataDir, "alpha", before);

    // 서버를 다시 띄운 모양 — 같은 프로젝트를 다시 열었는데 그사이 새 티켓이 생겼다.
    const after = [featureWithTickets("f", ["issues/01-x.md", "issues/02-new.md"])];
    ensureReadSeed(dataDir, "alpha", after);

    // 첫 깔기 때 있던 01 만 읽음이고, 그 뒤에 생긴 02 는 안 읽음으로 남아야 한다.
    expect(readReadMarks(dataDir, "alpha")).toEqual(new Set(["f/issues/01-x.md"]));
  });

  test("다른 프로젝트는 따로 깐다", () => {
    ensureReadSeed(dataDir, "alpha", [featureWithTickets("f", ["issues/01-x.md"])]);
    expect(readReadMarks(dataDir, "bravo")).toEqual(new Set());
    ensureReadSeed(dataDir, "bravo", [featureWithTickets("g", ["issues/01-y.md"])]);
    expect(readReadMarks(dataDir, "bravo")).toEqual(new Set(["g/issues/01-y.md"]));
  });
});
