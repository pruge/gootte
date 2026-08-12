import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { migratePlanDb, readPlacements, readSteps, writePlanMove } from "./plan-store";

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
