import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { Placement } from "@gootte/contract";
import type { PlanWritePlan } from "@gootte/core";

/**
 * 계획 저장소 — SQLite, gootte 자기 저장소(INV-2 — 관리대상에는 아무것도 안 쓴다. INV-2 가
 * 예외로 열어 둔 `.gootte/` 네임스페이스조차 쓰지 않는다).
 *
 * 표는 둘뿐이다(spec §저장 형태). 옛 스키마(트랙·순위·왜·왜 닻·opinion_request·extra·history.md)는
 * plan-board/01 이 걷어냈다.
 *
 * 🔴 **여기 담기는 것은 사람이 정한 것뿐이다**(INV-5). 문서를 다시 읽어 같은 값이 나오는 것
 * (티켓 상태·막힘·완료·제목)은 한 칸도 없다 — 그래서 이 표와 문서가 갈라질 두 축이 되지 않는다.
 *
 * `node:sqlite` 를 정적 import 하지 않고 `process.getBuiltinModule` 로 런타임에 얻는 이유는
 * vitest(vite)의 이 버전이 이 builtin 을 externalize 목록에 못 알아채기 때문(실측: `Failed to load url sqlite`).
 */
type DatabaseSyncCtor = new (path: string) => DatabaseSyncType;
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

/** 저장 자리 기본값 — 기계마다 다를 수 있어 호출자가 env `GOOTTE_DATA_DIR` 로 덮어쓴다(backend 몫). */
export function defaultPlanDataDir(): string {
  return join(homedir(), ".gootte");
}

function dbFile(dataDir: string): string {
  return join(dataDir, "plan.db");
}

/**
 * 표 둘 — spec §저장 형태 그대로.
 *
 * 🔴 `area` 에 **대기가 없다.** 자리 행이 없다는 것이 곧 대기이므로(spec §다섯 자리) 대기를 뜻하는
 * 값을 이 칸에 두지 않는다. CHECK 이 그것을 스키마 수준에서 못 박는다 — 손으로 고친 DB 라도
 * "waiting" 같은 값이 들어앉아 두 번째 표현이 되는 일은 없다.
 *
 * `step` 표는 firstmate 가 티켓마다 매기는 정수 하나다(spec §단계). 매기고 떼는 것은 05 가 쓴다 —
 * 표는 여기서 함께 세운다(스키마 자리가 두 군데로 갈라지지 않게).
 */
const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS placement (
    project   TEXT NOT NULL,
    feature   TEXT NOT NULL,
    area      TEXT NOT NULL CHECK (area IN ('active', 'reserved', 'discarded', 'done')),
    seq       INTEGER NOT NULL,
    closed_at TEXT,
    PRIMARY KEY (project, feature)
  );
  CREATE TABLE IF NOT EXISTS step (
    project TEXT NOT NULL,
    feature TEXT NOT NULL,
    ticket  TEXT NOT NULL,
    step    INTEGER NOT NULL,
    PRIMARY KEY (project, feature, ticket)
  );
`;

function schemaMismatchError(err: unknown): Error {
  const reason = err instanceof Error ? err.message : String(err);
  return new Error(
    `gootte 계획 DB 스키마가 지금 코드와 안 맞는다 — 저장소 루트에서 \`pnpm gootte db migrate\` 를 실행해라. (원인: ${reason})`,
  );
}

function open(dataDir: string): DatabaseSyncType {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbFile(dataDir));
  try {
    db.exec(SCHEMA_DDL);
  } catch (err) {
    db.close();
    throw schemaMismatchError(err);
  }
  return db;
}

export interface SchemaMigrationResult {
  addedColumns: string[];
  droppedColumns: string[];
}

/**
 * `db migrate` — 표가 없으면 만든다. 이미 있으면 바뀐 것이 없다고 그대로 말한다(멱등).
 * DB 는 잃어도 되는 물건이라(spec §범위 밖 — 옛 16행은 버린다) 버전 이력 없이 지금 스키마에
 * 맞추는 이 한 자리로 충분하다.
 */
export function migratePlanDb(dataDir: string): SchemaMigrationResult {
  open(dataDir).close();
  return { addedColumns: [], droppedColumns: [] };
}

interface PlacementRow {
  feature: string;
  area: string;
  seq: number;
  closed_at: string | null;
}

/**
 * 한 프로젝트의 자리 행 전부 — **있는 행만** 돌려준다.
 *
 * 🔴 없는 기능을 "대기" 로 채워 넣지 않는다. 대기는 이 목록에 **없음**으로 표현되고,
 * 다섯 칸으로 가르는 것은 `splitIntoAreas`(core) 한 곳뿐이다(spec §판정 자리는 하나뿐).
 *
 * 값은 계약(zod)으로 검증해 통과시킨다 — 스키마 CHECK 을 우회해 들어온 값이 있으면
 * 조용히 버리지 않고 여기서 멈춘다(경계 검증).
 */
export function readPlacements(dataDir: string, project: string): Placement[] {
  const db = open(dataDir);
  try {
    const rows = db
      .prepare(`SELECT feature, area, seq, closed_at FROM placement WHERE project = ?`)
      .all(project) as unknown as PlacementRow[];
    return rows.map((r) =>
      Placement.parse({ feature: r.feature, area: r.area, seq: r.seq, closedAt: r.closed_at }),
    );
  } finally {
    db.close();
  }
}

/**
 * 한 프로젝트의 단계 행 전부 — 05 가 읽어 쓸 자리이고, 지금은 03 의 쓰기가 실제로 닿았는지
 * 테스트가 확인하는 데 쓴다.
 */
export interface StoredStep {
  feature: string;
  ticket: string;
  step: number;
}

export function readSteps(dataDir: string, project: string): StoredStep[] {
  const db = open(dataDir);
  try {
    return db
      .prepare(`SELECT feature, ticket, step FROM step WHERE project = ? ORDER BY feature, ticket`)
      .all(project) as unknown as StoredStep[];
  } finally {
    db.close();
  }
}

/**
 * `step` 명령이 티켓 하나에 단계를 매긴다(plan-board/05) — firstmate 가 쓰는 유일한 칸.
 * 🔴 **판정은 여기 없다.** 이 기능이 작업 대상에 있는지, 이 티켓이 실제로 있는지는 호출자
 * (`cli`)가 먼저 확인한다 — 저장소는 쓰기만 한다(`writePlanMove`와 같은 관례).
 */
export function writeStep(dataDir: string, project: string, feature: string, ticket: string, step: number): void {
  const db = open(dataDir);
  try {
    db.prepare(
      `INSERT INTO step (project, feature, ticket, step) VALUES (?, ?, ?, ?)
       ON CONFLICT (project, feature, ticket) DO UPDATE SET step = excluded.step`,
    ).run(project, feature, ticket, step);
  } finally {
    db.close();
  }
}

/** `step --clear` — 단계 행 하나를 뗀다. 없는 행을 지워도 조용히 끝난다(멱등). */
export function clearStep(dataDir: string, project: string, feature: string, ticket: string): void {
  const db = open(dataDir);
  try {
    db.prepare(`DELETE FROM step WHERE project = ? AND feature = ? AND ticket = ?`).run(
      project,
      feature,
      ticket,
    );
  } finally {
    db.close();
  }
}

/**
 * 캡틴이 옮긴 결과를 적는다(plan-board/03) — `core` 의 `planMove` 가 이미 정한 것을 **그대로** 쓴다.
 *
 * 🔴 이름은 "옮김" 이지만 이 함수가 `PlanWritePlan` 을 표에 앉히는 **유일한 자리**다 —
 * 저절로 닫히는 순간(04, `planAutoClose`)도 여기를 지난다. 쓰는 자리를 둘로 만들지 않는다.
 *
 * 🔴 **여기에는 판정이 한 줄도 없다.** 어느 칸으로 갈지, 순서가 몇 번인지, 단계를 지울지 붙일지는
 * 전부 순수 함수가 정한 값이다(spec §판정 자리는 하나뿐) — 저장소가 조금이라도 다시 정하면
 * 그 순간 화면과 CLI 가 서로 다른 판을 본다.
 *
 * 🔴 **덮어쓰기뿐 — 이력을 남기지 않는다**(티켓 03 §이 티켓이 하지 않는다).
 *
 * 한 트랜잭션이다. 자리는 옮겼는데 단계가 남거나 그 반대인 중간 상태가 보이면, 그 순간의 판은
 * 아무도 정하지 않은 계획이 된다.
 */
export function writePlanMove(dataDir: string, project: string, plan: PlanWritePlan): void {
  const db = open(dataDir);
  try {
    db.exec("BEGIN");
    try {
      const removePlacement = db.prepare(
        `DELETE FROM placement WHERE project = ? AND feature = ?`,
      );
      const upsertPlacement = db.prepare(
        `INSERT INTO placement (project, feature, area, seq, closed_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (project, feature) DO UPDATE SET area = excluded.area, seq = excluded.seq, closed_at = excluded.closed_at`,
      );
      const clearSteps = db.prepare(`DELETE FROM step WHERE project = ? AND feature = ?`);
      const setStep = db.prepare(
        `INSERT INTO step (project, feature, ticket, step) VALUES (?, ?, ?, ?)
         ON CONFLICT (project, feature, ticket) DO UPDATE SET step = excluded.step`,
      );

      for (const feature of plan.remove) removePlacement.run(project, feature);
      for (const p of plan.upsert) upsertPlacement.run(project, p.feature, p.area, p.seq, p.closedAt);
      for (const feature of plan.clearSteps) clearSteps.run(project, feature);
      // 붙이기 전에 먼저 턴다 — 문서에서 사라진 티켓의 옛 단계 행이 남아 새 계획인 척하지 않게.
      for (const feature of new Set(plan.setSteps.map((s) => s.feature))) {
        clearSteps.run(project, feature);
      }
      for (const s of plan.setSteps) setStep.run(project, s.feature, s.ticket, s.step);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } finally {
    db.close();
  }
}
