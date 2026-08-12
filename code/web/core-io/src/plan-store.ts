import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { Placement } from "@gootte/contract";

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
