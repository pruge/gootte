import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { FeatureOrderEntry, PlanOrder, TicketKind, TicketOrderEntry } from "@gootte/contract";

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

function open(dataDir: string): DatabaseSyncType {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbFile(dataDir));
  db.exec(`
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
      kind TEXT NOT NULL,
      why TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (project, feature, ticket)
    );
  `);
  return db;
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
  kind: TicketKind;
  why: string;
  updatedAt: string;
}

function toTicketOrderEntry(row: TicketOrderRow): TicketOrderEntry {
  return { ...row, step: Number(row.step) };
}

function readTicketOrderRow(
  db: DatabaseSyncType,
  project: string,
  feature: string,
  ticket: string,
): TicketOrderEntry | null {
  const row = db
    .prepare(
      `SELECT project, feature, ticket, step, kind, why, updated_at as updatedAt
       FROM ticket_order WHERE project = ? AND feature = ? AND ticket = ?`,
    )
    .get(project, feature, ticket) as TicketOrderRow | undefined;
  return row ? toTicketOrderEntry(row) : null;
}

export interface SetTicketOrderInput {
  project: string;
  feature: string;
  ticket: string;
  /** 생략하면 기존 값을 유지 — 처음 등록할 때는 필수. */
  step?: number;
  /** 생략하면 기존 값, 그마저 없으면 "planned"(계획대로). */
  kind?: TicketKind;
  why: string;
}

/** `set` — 티켓의 단계·종류를 적는다. 같은 (project, feature, ticket) 는 덮어쓴다(INV-5). */
export function setTicketOrder(dataDir: string, input: SetTicketOrderInput): TicketOrderEntry {
  const db = open(dataDir);
  try {
    if (!input.why.trim()) throw new Error("--why 가 필요하다");
    const existing = readTicketOrderRow(db, input.project, input.feature, input.ticket);
    const step = input.step ?? existing?.step;
    const kind = input.kind ?? existing?.kind ?? "planned";
    if (step === undefined) throw new Error("--step 이 필요하다(처음 등록)");
    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO ticket_order (project, feature, ticket, step, kind, why, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project, feature, ticket) DO UPDATE SET
         step = excluded.step, kind = excluded.kind, why = excluded.why, updated_at = excluded.updated_at`,
    ).run(input.project, input.feature, input.ticket, step, kind, input.why, updatedAt);
    appendHistory(
      dataDir,
      `set ${input.project} ${input.feature}/${input.ticket} → step=${step} kind=${kind} — ${input.why}`,
    );
    return { project: input.project, feature: input.feature, ticket: input.ticket, step, kind, why: input.why, updatedAt };
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
        .prepare(
          `SELECT project, feature, ticket, step, kind, why, updated_at as updatedAt
           FROM ticket_order WHERE project = ? ORDER BY step, feature, ticket`,
        )
        .all(project) as unknown as TicketOrderRow[]
    ).map(toTicketOrderEntry);
    return { project, features, tickets };
  } finally {
    db.close();
  }
}
