import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { migratePlanDb, readPlacements } from "./plan-store";

/**
 * 계획 저장소 — 임시 디렉토리 픽스처(이 저장소 자신의 `~/.gootte` 를 건드리지 않는다).
 *
 * 🔴 쓰기는 **테스트가 직접 SQL 로** 넣는다. 02 는 자리를 옮기지 않으므로(03 이 한다) 쓰기 함수를
 * 미리 만들어 두지 않는다 — 대신 이 테스트가 스키마의 실제 칸 이름까지 함께 못 박는다.
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
