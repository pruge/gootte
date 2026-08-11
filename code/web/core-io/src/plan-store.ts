import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { Feature, FeatureOrderEntry, PlanOrder, TicketOrderEntry } from "@gootte/contract";
import { appendRank, computeMismatches, firstRank, insertBetween, insertStepAfter, renumberSparse } from "@gootte/core";

/**
 * 계획(단계·순위·트랙·왜) 저장소 — SQLite, gootte 자기 저장소(INV-2 — 관리대상에는
 * 아무것도 안 쓴다. INV-2 가 예외로 열어 둔 `.gootte/` 네임스페이스조차 쓰지 않는다).
 *
 * 🔴 덮어쓰기만 한다(INV-5) — 이력 테이블 없음. `history.md` 가 유일한 순차 기록이고
 * 계산에 쓰지 않는다(사람·planner 가 읽는 메모, 티켓 01 §history.md).
 *
 * `node:sqlite` 를 정적 import 하지 않고 `process.getBuiltinModule` 로 런타임에 얻는다 —
 * vitest(vite)의 이 버전이 이 builtin 을 externalize 목록에 못 알아채 정적 import 를
 * 번들러가 해소하려다 실패한다(실측: `Failed to load url sqlite`). 타입만 `import type` 으로 쓴다.
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
function historyFile(dataDir: string): string {
  return join(dataDir, "history.md");
}

const SCHEMA_DDL = `
  CREATE TABLE IF NOT EXISTS feature_order (
    project TEXT NOT NULL,
    feature TEXT NOT NULL,
    track TEXT NOT NULL,
    rank REAL NOT NULL,
    why TEXT NOT NULL,
    why_needs_review INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project, feature)
  );
  CREATE TABLE IF NOT EXISTS ticket_order (
    project TEXT NOT NULL,
    feature TEXT NOT NULL,
    ticket TEXT NOT NULL,
    step INTEGER NOT NULL,
    why TEXT NOT NULL,
    why_needs_review INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (project, feature, ticket)
  );
`;

/**
 * 표마다 있어야 할 칸 — 새 칸을 더할 때 고칠 **한 자리**(spec §원인: 표마다 손으로 ALTER 를
 * 적어 두던 것이 빠뜨리기 쉬운 구조 자체였다). `CREATE TABLE IF NOT EXISTS` 는 이미 있는 표에
 * 칸을 안 붙이므로, 오래 쓴 DB 에는 여기 목록을 보고 빠진 칸만 채운다.
 */
const MIGRATABLE_COLUMNS: readonly { table: string; column: string; ddl: string }[] = [
  { table: "feature_order", column: "why_needs_review", ddl: "INTEGER NOT NULL DEFAULT 0" },
  { table: "ticket_order", column: "why_needs_review", ddl: "INTEGER NOT NULL DEFAULT 0" },
];

function existingColumns(db: DatabaseSyncType, table: string): Set<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((r) => r.name));
}

export interface SchemaMigrationResult {
  addedColumns: string[];
  droppedColumns: string[];
}

/**
 * 표를 만들고(없으면) 빠진 칸을 채운다(있으면 건드리지 않는다 — PRAGMA 로 먼저 확인하지,
 * try/catch 로 아무 에러나 삼키지 않는다). `open()`(매 호출마다 조용히)과
 * `migratePlanDb`(CLI `db migrate`, 사람에게 보고) 둘 다 이 한 함수를 쓴다.
 */
function applySchemaMigrations(db: DatabaseSyncType): SchemaMigrationResult {
  db.exec(SCHEMA_DDL);
  const addedColumns: string[] = [];
  for (const { table, column, ddl } of MIGRATABLE_COLUMNS) {
    if (existingColumns(db, table).has(column)) continue;
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
    addedColumns.push(`${table}.${column}`);
  }
  // 종류(kind) 칸이 있던 DB — 캡틴이 종류를 안 두기로 정하셨다(2026-08-11). 지운다.
  const droppedColumns: string[] = [];
  if (existingColumns(db, "ticket_order").has("kind")) {
    db.exec(`ALTER TABLE ticket_order DROP COLUMN kind`);
    droppedColumns.push("ticket_order.kind");
  }
  return { addedColumns, droppedColumns };
}

function schemaMismatchError(err: unknown): Error {
  const reason = err instanceof Error ? err.message : String(err);
  return new Error(`gootte 계획 DB 스키마가 지금 코드와 안 맞는다 — 저장소 루트에서 \`pnpm db migrate\` 를 실행해라. (원인: ${reason})`);
}

function open(dataDir: string): DatabaseSyncType {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbFile(dataDir));
  try {
    applySchemaMigrations(db);
  } catch (err) {
    db.close();
    throw schemaMismatchError(err);
  }
  return db;
}

/**
 * `db migrate` — 기존 DB 를 지금 스키마로 올린다. 무엇을 고쳤는지 사람이 읽을 수 있게 돌려준다.
 * 이미 최신이면 두 목록 다 비어 있다(멱등) — DB 는 잃어도 되는 물건이라(spec §저장 형태)
 * 이 정도(버전 이력 없이 지금 스키마에 맞추기)로 충분하다.
 */
export function migratePlanDb(dataDir: string): SchemaMigrationResult {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbFile(dataDir));
  try {
    return applySchemaMigrations(db);
  } catch (err) {
    throw schemaMismatchError(err);
  } finally {
    db.close();
  }
}

function appendHistory(dataDir: string, line: string): void {
  mkdirSync(dataDir, { recursive: true });
  appendFileSync(historyFile(dataDir), `- ${new Date().toISOString()} ${line}\n`);
}

interface FeatureOrderRow {
  project: string;
  feature: string;
  track: string;
  rank: number;
  why: string;
  whyNeedsReview: number;
  updatedAt: string;
}

function toFeatureOrderEntry(row: FeatureOrderRow): FeatureOrderEntry {
  return { ...row, rank: Number(row.rank), whyNeedsReview: Boolean(row.whyNeedsReview) };
}

function readFeatureOrderRow(db: DatabaseSyncType, project: string, feature: string): FeatureOrderEntry | null {
  const row = db
    .prepare(
      `SELECT project, feature, track, rank, why, why_needs_review as whyNeedsReview, updated_at as updatedAt
       FROM feature_order WHERE project = ? AND feature = ?`,
    )
    .get(project, feature) as FeatureOrderRow | undefined;
  return row ? toFeatureOrderEntry(row) : null;
}

export interface SetFeatureOrderInput {
  project: string;
  feature: string;
  /** 생략하면 기존 값을 유지 — 처음 등록할 때는 필수. */
  track?: string;
  rank?: number;
  why: string;
}

/** `set-feature` — 트랙·순위를 적는다. 같은 (project, feature) 는 덮어쓴다(INV-5). */
export function setFeatureOrder(dataDir: string, input: SetFeatureOrderInput): FeatureOrderEntry {
  const db = open(dataDir);
  try {
    if (!input.why.trim()) throw new Error("--why 가 필요하다");
    const existing = readFeatureOrderRow(db, input.project, input.feature);
    const track = input.track ?? existing?.track;
    const rank = input.rank ?? existing?.rank;
    if (track === undefined) throw new Error("--track 이 필요하다(처음 등록)");
    if (rank === undefined) throw new Error("--rank 이 필요하다(처음 등록)");
    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO feature_order (project, feature, track, rank, why, why_needs_review, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(project, feature) DO UPDATE SET
         track = excluded.track, rank = excluded.rank, why = excluded.why,
         why_needs_review = 0, updated_at = excluded.updated_at`,
    ).run(input.project, input.feature, track, rank, input.why, updatedAt);
    appendHistory(
      dataDir,
      `set-feature ${input.project} ${input.feature} → track=${track} rank=${rank} — ${input.why}`,
    );
    return { project: input.project, feature: input.feature, track, rank, why: input.why, whyNeedsReview: false, updatedAt };
  } finally {
    db.close();
  }
}

interface TicketOrderRow {
  project: string;
  feature: string;
  ticket: string;
  step: number;
  why: string;
  whyNeedsReview: number;
  updatedAt: string;
}

function toTicketOrderEntry(row: TicketOrderRow): TicketOrderEntry {
  return { ...row, step: Number(row.step), whyNeedsReview: Boolean(row.whyNeedsReview) };
}

const TICKET_ORDER_COLUMNS = `project, feature, ticket, step, why, why_needs_review as whyNeedsReview, updated_at as updatedAt`;

function readTicketOrderRow(
  db: DatabaseSyncType,
  project: string,
  feature: string,
  ticket: string,
): TicketOrderEntry | null {
  const row = db
    .prepare(`SELECT ${TICKET_ORDER_COLUMNS} FROM ticket_order WHERE project = ? AND feature = ? AND ticket = ?`)
    .get(project, feature, ticket) as TicketOrderRow | undefined;
  return row ? toTicketOrderEntry(row) : null;
}

export interface SetTicketOrderInput {
  project: string;
  feature: string;
  ticket: string;
  /** 생략하면 기존 값을 유지 — 처음 등록할 때는 필수. */
  step?: number;
  why: string;
}

/** `set` — 티켓의 단계·종류를 적는다. 같은 (project, feature, ticket) 는 덮어쓴다(INV-5). */
export function setTicketOrder(dataDir: string, input: SetTicketOrderInput): TicketOrderEntry {
  const db = open(dataDir);
  try {
    if (!input.why.trim()) throw new Error("--why 가 필요하다");
    const existing = readTicketOrderRow(db, input.project, input.feature, input.ticket);
    const step = input.step ?? existing?.step;
    if (step === undefined) throw new Error("--step 이 필요하다(처음 등록)");
    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO ticket_order (project, feature, ticket, step, why, why_needs_review, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)
       ON CONFLICT(project, feature, ticket) DO UPDATE SET
         step = excluded.step, why = excluded.why,
         why_needs_review = 0, updated_at = excluded.updated_at`,
    ).run(input.project, input.feature, input.ticket, step, input.why, updatedAt);
    appendHistory(
      dataDir,
      `set ${input.project} ${input.feature}/${input.ticket} → step=${step} — ${input.why}`,
    );
    return {
      project: input.project,
      feature: input.feature,
      ticket: input.ticket,
      step,
      why: input.why,
      whyNeedsReview: false,
      updatedAt,
    };
  } finally {
    db.close();
  }
}

/**
 * `drop` — `ticket` 이 있으면 그 티켓 한 줄만, 없으면 기능 순위 한 줄만 지운다.
 * 다른 줄은 건드리지 않는다.
 */
export function dropOrder(dataDir: string, project: string, feature: string, ticket?: string): void {
  const db = open(dataDir);
  try {
    if (ticket) {
      db.prepare(`DELETE FROM ticket_order WHERE project = ? AND feature = ? AND ticket = ?`).run(
        project,
        feature,
        ticket,
      );
      appendHistory(dataDir, `drop ${project} ${feature}/${ticket}`);
    } else {
      db.prepare(`DELETE FROM feature_order WHERE project = ? AND feature = ?`).run(project, feature);
      appendHistory(dataDir, `drop ${project} ${feature}`);
    }
  } finally {
    db.close();
  }
}

/** `order` — 적힌 계획을 프로젝트 하나 기준으로 그대로 되읽는다. */
export function readPlanOrder(dataDir: string, project: string): PlanOrder {
  const db = open(dataDir);
  try {
    const features = (
      db
        .prepare(
          `SELECT project, feature, track, rank, why, why_needs_review as whyNeedsReview, updated_at as updatedAt
           FROM feature_order WHERE project = ? ORDER BY track, rank`,
        )
        .all(project) as unknown as FeatureOrderRow[]
    ).map(toFeatureOrderEntry);
    const tickets = (
      db
        .prepare(`SELECT ${TICKET_ORDER_COLUMNS} FROM ticket_order WHERE project = ? ORDER BY step, feature, ticket`)
        .all(project) as unknown as TicketOrderRow[]
    ).map(toTicketOrderEntry);
    return { project, features, tickets };
  } finally {
    db.close();
  }
}

// ── 드래그(티켓 04) — 순위·단계만 바꾸고 `왜` 는 그대로 둔다, 대신 확인 필요를 세운다 ──────

function requireExistingTicket(
  db: DatabaseSyncType,
  project: string,
  feature: string,
  ticket: string,
): TicketOrderEntry {
  const existing = readTicketOrderRow(db, project, feature, ticket);
  if (!existing) throw new Error(`계획에 없는 티켓이다: ${project} ${feature}/${ticket}`);
  return existing;
}

function requireExistingFeature(db: DatabaseSyncType, project: string, feature: string): FeatureOrderEntry {
  const existing = readFeatureOrderRow(db, project, feature);
  if (!existing) throw new Error(`계획에 없는 기능이다: ${project} ${feature}`);
  return existing;
}

export interface MoveTicketStepInput {
  project: string;
  feature: string;
  ticket: string;
  /** 놓인 단계 줄의 값 — 그 줄에 이미 있는 티켓들과 같은 단계가 된다(병렬). */
  step: number;
}

/**
 * 티켓 칩을 다른 단계 줄로 끈다 — `왜` 는 그대로, `why_needs_review` 만 선다(spec 04 §왜 는 안 건드린다).
 * `step` 계산은 호출자가 이미 정한 값(놓인 줄의 값)을 그대로 받는다 — 새 단계를 만드는 경우는
 * `insertTicketStep` 이 따로 갖는다.
 */
export function moveTicketStep(dataDir: string, input: MoveTicketStepInput): TicketOrderEntry {
  const db = open(dataDir);
  try {
    const existing = requireExistingTicket(db, input.project, input.feature, input.ticket);
    const updatedAt = new Date().toISOString();
    db.prepare(
      `UPDATE ticket_order SET step = ?, why_needs_review = 1, updated_at = ?
       WHERE project = ? AND feature = ? AND ticket = ?`,
    ).run(input.step, updatedAt, input.project, input.feature, input.ticket);
    appendHistory(
      dataDir,
      `drag ${input.project} ${input.feature}/${input.ticket} → step=${existing.step}→${input.step}(확인 필요) [plan 탭]`,
    );
    return { ...existing, step: input.step, whyNeedsReview: true, updatedAt };
  } finally {
    db.close();
  }
}

export interface InsertTicketStepInput {
  project: string;
  feature: string;
  ticket: string;
  /** 이 단계 바로 다음 줄과의 사이에 놓았다 — 새 단계가 그 사이에 생긴다. */
  afterStep: number;
}

/**
 * 티켓 칩을 줄과 줄 사이에 놓는다 — 새 단계가 생기고 뒤 단계가 밀린다(spec 04 §무엇이 바뀌나,
 * `core` 의 순수 함수 `insertStepAfter` 로 계산). 프로젝트 전체가 같은 단계 번호줄을 공유하므로
 * 밀림도 프로젝트 전체에 미친다.
 */
export function insertTicketStep(dataDir: string, input: InsertTicketStepInput): TicketOrderEntry {
  const db = open(dataDir);
  try {
    const existing = requireExistingTicket(db, input.project, input.feature, input.ticket);
    const { newStep, shiftFrom } = insertStepAfter(input.afterStep);
    const updatedAt = new Date().toISOString();
    db.exec("BEGIN");
    try {
      db.prepare(
        `UPDATE ticket_order SET step = step + 1
         WHERE project = ? AND step >= ? AND NOT (feature = ? AND ticket = ?)`,
      ).run(input.project, shiftFrom, input.feature, input.ticket);
      db.prepare(
        `UPDATE ticket_order SET step = ?, why_needs_review = 1, updated_at = ?
         WHERE project = ? AND feature = ? AND ticket = ?`,
      ).run(newStep, updatedAt, input.project, input.feature, input.ticket);
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
    appendHistory(
      dataDir,
      `drag ${input.project} ${input.feature}/${input.ticket} → 새 단계 step=${newStep}(뒤 단계 밀림, 확인 필요) [plan 탭]`,
    );
    return { ...existing, step: newStep, whyNeedsReview: true, updatedAt };
  } finally {
    db.close();
  }
}

export interface MoveFeatureOrderInput {
  project: string;
  feature: string;
  /** 놓인 트랙 — 같은 트랙 안에서 옮기면 기존 트랙과 같다. */
  track: string;
  /** 드롭 위치 바로 위 이웃의 순위. 맨 앞이면 null. */
  beforeRank: number | null;
  /** 드롭 위치 바로 아래 이웃의 순위. 맨 끝(또는 빈 트랙)이면 null. */
  afterRank: number | null;
}

/** 트랙 안의 다른 기능 순위(끄는 기능 자신은 제외), 오름차순. */
function ranksInTrack(db: DatabaseSyncType, project: string, track: string, excludeFeature: string): number[] {
  const rows = db
    .prepare(`SELECT rank FROM feature_order WHERE project = ? AND track = ? AND feature != ? ORDER BY rank`)
    .all(project, track, excludeFeature) as { rank: number }[];
  return rows.map((r) => Number(r.rank));
}

/**
 * 기능 카드를 끈다 — 같은 트랙 안 순위 재배치, 또는 다른 트랙으로 이동(그 트랙 안 순위도 함께).
 * 순위는 `core` 의 같은 순수 함수(`insertBetween`·`appendRank`·`firstRank`)로 계산한다(spec 04
 * §순위 계산은 01 이 만든 core 의 순수 함수를 쓴다) — 화면에서 다시 짜지 않는다.
 * 틈이 다 찼으면(`insertBetween` 이 null) 그 트랙만 성기게 다시 매긴 뒤 다시 끼운다.
 */
export function moveFeatureOrder(dataDir: string, input: MoveFeatureOrderInput): FeatureOrderEntry {
  const db = open(dataDir);
  try {
    const existing = requireExistingFeature(db, input.project, input.feature);
    const neighbors = ranksInTrack(db, input.project, input.track, input.feature);

    let rank: number;
    if (input.beforeRank === null && input.afterRank === null) {
      rank = neighbors.length === 0 ? firstRank() : appendRank(neighbors);
    } else if (input.beforeRank === null) {
      rank = insertBetween(0, input.afterRank as number) ?? renumberAndRetry(db, input, neighbors, 0, input.afterRank as number);
    } else if (input.afterRank === null) {
      rank = appendRank([input.beforeRank]);
    } else {
      rank =
        insertBetween(input.beforeRank, input.afterRank) ??
        renumberAndRetry(db, input, neighbors, input.beforeRank, input.afterRank);
    }

    const updatedAt = new Date().toISOString();
    db.prepare(
      `UPDATE feature_order SET track = ?, rank = ?, why_needs_review = 1, updated_at = ?
       WHERE project = ? AND feature = ?`,
    ).run(input.track, rank, updatedAt, input.project, input.feature);
    appendHistory(
      dataDir,
      `drag ${input.project} ${input.feature} → track=${existing.track}→${input.track} rank=${existing.rank}→${rank}(확인 필요) [plan 탭]`,
    );
    return { ...existing, track: input.track, rank, whyNeedsReview: true, updatedAt };
  } finally {
    db.close();
  }
}

/**
 * 틈이 다 찼을 때만 — 트랙 전체를 10·20·30 으로 다시 매기고, 같은 상대 위치에 다시 끼운다.
 * 실제 손 조작으로는 거의 안 일어난다(`MIN_GAP` 이 부동소수 정밀도 바로 위) — 안전판.
 */
function renumberAndRetry(
  db: DatabaseSyncType,
  input: MoveFeatureOrderInput,
  neighborsBeforeRenumber: readonly number[],
  before: number,
  after: number,
): number {
  const sorted = [...neighborsBeforeRenumber].sort((a, b) => a - b);
  const renumbered = renumberSparse(sorted.length);
  const updatedAt = new Date().toISOString();
  sorted.forEach((oldRank, i) => {
    const newRank = renumbered[i] as number;
    db.prepare(`UPDATE feature_order SET rank = ?, updated_at = ? WHERE project = ? AND track = ? AND rank = ?`).run(
      newRank,
      updatedAt,
      input.project,
      input.track,
      oldRank,
    );
  });
  const beforeIdx = sorted.indexOf(before);
  const afterIdx = sorted.indexOf(after);
  const newBefore = beforeIdx >= 0 ? (renumbered[beforeIdx] as number) : 0;
  const newAfter = afterIdx >= 0 ? (renumbered[afterIdx] as number) : appendRank(renumbered);
  return insertBetween(newBefore, newAfter) ?? appendRank(renumbered);
}

// ── 완료되면 스스로 빠진다(development-order/08) ──────────────────────────

/**
 * 완료(`done`·`dropped`)됐는데 계획에 남은 티켓을 전부 지운다 — 판정은 `computeMismatches`의
 * `done_but_staged`를 그대로 여과한다(새 술어를 안 만든다, 판정 자리는 하나뿐).
 * 🔴 호출자는 **문서 워처**(server.ts)여야 한다 — 관리대상 문서가 실제로 바뀌었을 때만 부른다.
 * HTTP GET 경로에서 부르지 않는다(backend read-only 관례는 그대로 지킨다).
 * `feature_order`(기능 트랙·순위)는 안 건드린다 — 티켓 단위 판정이라 티켓 줄만 지운다.
 */
export function dropStaleCompleted(
  dataDir: string,
  project: string,
  features: readonly Feature[],
): { feature: string; ticket: string }[] {
  const order = readPlanOrder(dataDir, project);
  const dropped: { feature: string; ticket: string }[] = [];
  for (const m of computeMismatches(features, order.tickets)) {
    if (m.kind !== "done_but_staged" || !m.ticket) continue;
    dropOrder(dataDir, project, m.feature, m.ticket);
    dropped.push({ feature: m.feature, ticket: m.ticket });
  }
  return dropped;
}
