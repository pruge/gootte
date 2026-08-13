import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { Feature } from "@gootte/contract";
import { Placement } from "@gootte/contract";
import { planAutoClose, type PlanWritePlan } from "@gootte/core";

/**
 * 계획 저장소 — SQLite, gootte 자기 저장소(INV-2 — 관리대상에는 아무것도 안 쓴다. INV-2 가
 * 예외로 열어 둔 `.gootte/` 네임스페이스조차 쓰지 않는다).
 *
 * 표는 `placement`·`step` 둘이 spec §저장 형태 그대로다. `read_mark`·`read_seed` 는
 * unread-tickets-show-themselves/01 이 같은 자리에 더한 것 — 읽음도 "사람이 정한 것"이라
 * 저장 자격이 있다(INV-5). 옛 스키마(트랙·순위·왜·왜 닻·opinion_request·extra·history.md)는
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
 * `step` 표는 firstmate 와 캡틴(08, `process` 탭 끌어 놓기)이 티켓마다 매기는 단계 하나다
 * (spec §단계). 매기고 떼는 것은 05 가, 사이에 끼워 넣는 것은 08 이 쓴다 — 표는 여기서 함께
 * 세운다(스키마 자리가 두 군데로 갈라지지 않게).
 *
 * 🔴 **`step.step` 은 REAL 이다(08).** 1단계와 2단계 사이에 새 단계를 끼워 넣으려면 그 자리에
 * 쓸 숫자가 있어야 하는데 정수에는 1 과 2 사이가 없다(spec §사이에 끼워 넣으려면 저장 숫자가
 * 정수여선 안 된다) — 화면은 이미 압축해 보여주므로(05) 성긴 저장이 캡틴 눈에 비치지 않는다.
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
    step    REAL NOT NULL,
    PRIMARY KEY (project, feature, ticket)
  );
  CREATE TABLE IF NOT EXISTS read_mark (
    project TEXT NOT NULL,
    feature TEXT NOT NULL,
    path    TEXT NOT NULL,
    PRIMARY KEY (project, feature, path)
  );
  CREATE TABLE IF NOT EXISTS read_seed (
    project   TEXT NOT NULL PRIMARY KEY,
    seeded_at TEXT NOT NULL
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

/** `step` 표의 `step` 칸이 지금 어떤 선언 타입을 갖는가 — 표가 아직 없으면 null. */
function declaredStepColumnType(db: DatabaseSyncType): string | null {
  const rows = db.prepare(`PRAGMA table_info(step)`).all() as unknown as { name: string; type: string }[];
  return rows.find((r) => r.name === "step")?.type ?? null;
}

/**
 * `db migrate` — 표가 없으면 만든다. 이미 있으면 바뀐 것이 없다고 그대로 말한다(멱등).
 * DB 는 잃어도 되는 물건이라(spec §범위 밖 — 옛 16행은 버린다) 버전 이력 없이 지금 스키마에
 * 맞추는 이 한 자리로 충분하다.
 *
 * 🔴 **08 이 `step.step` 을 INTEGER → REAL 로 바꾼다.** SQLite 는 선언 타입이 INTEGER 여도
 * 실수를 잃지 않고 담지만(타입 유사성), 스키마는 정직해야 하므로 옛 칸을 만나면 표를
 * 통째로 다시 만든다 — 계획 DB 는 잃어도 되는 물건이라 옛 단계 값은 되살리지 않는다
 * (spec §스키마 변경은 이미 있는 `db migrate` 가 받는다).
 */
export function migratePlanDb(dataDir: string): SchemaMigrationResult {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbFile(dataDir));
  try {
    const before = declaredStepColumnType(db);
    if (before !== null && before.toUpperCase() !== "REAL") {
      db.exec(`DROP TABLE step`);
      db.exec(SCHEMA_DDL);
      return { addedColumns: [], droppedColumns: [`step.step (${before} → REAL, 옛 단계 값은 버렸다)`] };
    }
    db.exec(SCHEMA_DDL);
    return { addedColumns: [], droppedColumns: [] };
  } finally {
    db.close();
  }
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

/**
 * 판을 읽기 전에 자동 닫힘(04, `planAutoClose`)부터 태우고, 자리 행을 다시 읽어 돌려준다 —
 * **판을 보는 모든 길이 지나는 한 자리**(HTTP `readBoard` 도, CLI `board`·`next` 도).
 *
 * 🔴 **판정은 한 줄도 여기 없다** — 무엇이 닫히는지는 `planAutoClose`(core) 하나뿐이고,
 * 여기는 그 결과를 쓰고(`writePlanMove`) 다시 읽을 뿐이다(spec §판정 자리는 하나뿐). 이 함수를
 * 부르지 않고 `readPlacements` 를 직접 부르는 길이 하나라도 남으면, 그 길은 화면·다른 길과
 * 다른 판을 본다 — 이 저장소가 고치는 문제가 그것이다.
 *
 * 🔴 **쓴 뒤에는 자리 행을 다시 읽는다** — 방금 쓴 값으로 조립하면 DB 의 2차 사본이 생긴다(INV-1).
 */
export function readPlacementsWithAutoClose(
  dataDir: string,
  project: string,
  features: readonly Feature[],
): Placement[] {
  const closing = planAutoClose(features, readPlacements(dataDir, project));
  if (closing) writePlanMove(dataDir, project, closing);
  return readPlacements(dataDir, project);
}

interface ReadMarkRow {
  feature: string;
  path: string;
}

/**
 * 이 프로젝트에서 읽은 티켓 전부 — `"<기능>/<경로>"` 키 집합(unread-tickets-show-themselves/01).
 * 판정(`applyReadState`, core)이 이 집합을 그대로 받아 견준다 — 여기서는 읽기만 한다.
 */
export function readReadMarks(dataDir: string, project: string): Set<string> {
  const db = open(dataDir);
  try {
    const rows = db
      .prepare(`SELECT feature, path FROM read_mark WHERE project = ?`)
      .all(project) as unknown as ReadMarkRow[];
    return new Set(rows.map((r) => `${r.feature}/${r.path}`));
  } finally {
    db.close();
  }
}

/** 티켓 원문을 열면 읽음이 된다 — 이미 읽은 티켓을 다시 열어도 조용히 끝난다(멱등). */
export function markDocRead(dataDir: string, project: string, feature: string, path: string): void {
  const db = open(dataDir);
  try {
    db.prepare(`INSERT OR IGNORE INTO read_mark (project, feature, path) VALUES (?, ?, ?)`).run(
      project,
      feature,
      path,
    );
  } finally {
    db.close();
  }
}

/**
 * 이 기능이 이 프로젝트에서 처음 올라간 순간, 그때 있던 티켓을 전부 읽음으로 깐다
 * (spec §첫 화면이 통째로 초록이면 안 된다).
 *
 * 🔴 **한 번만 선다** — `read_seed` 행이 이미 있으면 그대로 끝난다. 이 판정을 "읽은 티켓이
 * 하나도 없으면 깐다" 같은 값 기준으로 하면 서버를 다시 띄울 때마다 새 티켓까지 읽음으로
 * 깔리는 조용한 실패가 난다(티켓 01 §첫 화면이 통째로 초록이면 안 된다) — 그래서 판정은
 * **행의 존재**뿐이고 값을 보지 않는다.
 */
export function ensureReadSeed(dataDir: string, project: string, features: readonly Feature[]): void {
  const db = open(dataDir);
  try {
    const already = db.prepare(`SELECT 1 FROM read_seed WHERE project = ?`).get(project);
    if (already) return;
    db.exec("BEGIN");
    try {
      const insertMark = db.prepare(
        `INSERT OR IGNORE INTO read_mark (project, feature, path) VALUES (?, ?, ?)`,
      );
      for (const f of features) for (const t of f.tickets) insertMark.run(project, f.slug, t.path);
      db.prepare(`INSERT INTO read_seed (project, seeded_at) VALUES (?, ?)`).run(
        project,
        new Date().toISOString(),
      );
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  } finally {
    db.close();
  }
}
