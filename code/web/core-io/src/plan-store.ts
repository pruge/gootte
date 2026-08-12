import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";

/**
 * 계획 저장소 자리 — gootte 자기 저장소(INV-2). 옛 스키마(트랙·순위·왜·왜 닻·opinion_request·
 * extra·history.md)는 plan-board/01 이 걷어냈다 — 02 가 다섯 자리 모델(`placement`·`step` 표)로
 * 다시 세운다(docs/features/plan-board/spec.md §저장 형태).
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

export interface SchemaMigrationResult {
  addedColumns: string[];
  droppedColumns: string[];
}

/**
 * `db migrate` — 지금은 만들 표가 없다(02 가 `placement`·`step` 표를 세우면 여기가 채워진다).
 * DB 파일 자리만 확인하고 빈 결과를 돌려준다 — 이미 최신이라는 뜻과 같다(멱등).
 */
export function migratePlanDb(dataDir: string): SchemaMigrationResult {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbFile(dataDir));
  db.close();
  return { addedColumns: [], droppedColumns: [] };
}
