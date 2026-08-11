import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { ExtraEntry } from "@gootte/contract";

/**
 * `extra` 큐 — 티켓 밖에서 더 개발된 것을 잡는다(development-order/05). gootte 자기 저장소,
 * `plan-store.ts` 와 같은 `plan.db` 파일을 쓰지만(같은 `GOOTTE_DATA_DIR`) 표는 따로다.
 *
 * 🔴 `feature_order`·`ticket_order` 와 성격이 다르다 — 이쪽은 **덮어쓰지 않고 쌓이는 큐**다.
 * `done` 은 처리 표시일 뿐 행을 지우지 않는다(질의 기본값이 미처리만이라 쌓여도 안 느려진다).
 *
 * `node:sqlite` 를 런타임에 얻는 이유는 `plan-store.ts` 머리말과 같다(vitest 번들러 이슈).
 */
type DatabaseSyncCtor = new (path: string) => DatabaseSyncType;
const { DatabaseSync } = process.getBuiltinModule("node:sqlite") as { DatabaseSync: DatabaseSyncCtor };

function dbFile(dataDir: string): string {
  return join(dataDir, "plan.db");
}

function open(dataDir: string): DatabaseSyncType {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(dbFile(dataDir));
  db.exec(`
    CREATE TABLE IF NOT EXISTS extra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL,
      feature TEXT NOT NULL,
      ticket TEXT NOT NULL,
      note TEXT NOT NULL,
      who TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);
  return db;
}

interface ExtraRow {
  id: number;
  project: string;
  feature: string;
  ticket: string;
  note: string;
  who: string | null;
  done: number;
  createdAt: string;
}

function toExtraEntry(row: ExtraRow): ExtraEntry {
  return { ...row, done: Boolean(row.done) };
}

export interface AddExtraInput {
  project: string;
  feature: string;
  ticket: string;
  note: string;
  who?: string;
}

/** `extra add` — 항목 하나를 쌓는다. 덮어쓰지 않는다(키가 없다 — 매번 새 행). */
export function addExtra(dataDir: string, input: AddExtraInput): ExtraEntry {
  const db = open(dataDir);
  try {
    if (!input.note.trim()) throw new Error("메모가 필요하다");
    const createdAt = new Date().toISOString();
    const who = input.who ?? null;
    const result = db
      .prepare(
        `INSERT INTO extra (project, feature, ticket, note, who, done, created_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)`,
      )
      .run(input.project, input.feature, input.ticket, input.note, who, createdAt);
    return {
      id: Number(result.lastInsertRowid),
      project: input.project,
      feature: input.feature,
      ticket: input.ticket,
      note: input.note,
      who,
      done: false,
      createdAt,
    };
  } finally {
    db.close();
  }
}

export interface ListExtraOptions {
  /** 생략하면 모든 프로젝트. */
  project?: string;
  /** true 면 처리분까지. 기본은 미처리만(🔴 새로 등록된 것만). */
  all?: boolean;
}

/** `extra` / `extra --all` — 기본은 미처리만, id 오름차순(먼저 등록된 것부터 — 큐). */
export function listExtra(dataDir: string, options: ListExtraOptions = {}): ExtraEntry[] {
  const db = open(dataDir);
  try {
    const conditions: string[] = [];
    const params: string[] = [];
    if (options.project) {
      conditions.push("project = ?");
      params.push(options.project);
    }
    if (!options.all) conditions.push("done = 0");
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db
      .prepare(
        `SELECT id, project, feature, ticket, note, who, done, created_at as createdAt
         FROM extra ${where} ORDER BY id ASC`,
      )
      .all(...params) as unknown as ExtraRow[];
    return rows.map(toExtraEntry);
  } finally {
    db.close();
  }
}

/** `extra done` — 지우지 않고 처리 표시만 한다(🔴 근거로 남긴다). */
export function doneExtra(dataDir: string, id: number): ExtraEntry {
  const db = open(dataDir);
  try {
    const row = db
      .prepare(
        `SELECT id, project, feature, ticket, note, who, done, created_at as createdAt FROM extra WHERE id = ?`,
      )
      .get(id) as ExtraRow | undefined;
    if (!row) throw new Error(`extra id ${id} 를 찾을 수 없다`);
    db.prepare(`UPDATE extra SET done = 1 WHERE id = ?`).run(id);
    return toExtraEntry({ ...row, done: 1 });
  } finally {
    db.close();
  }
}

/** `extra prune --before` — 처리된 것 중 오래된 것만 지운다. 미처리는 절대 안 지운다. 자동으로 안 돈다. */
export function pruneExtra(dataDir: string, beforeIso: string): number {
  const db = open(dataDir);
  try {
    const result = db.prepare(`DELETE FROM extra WHERE done = 1 AND created_at < ?`).run(beforeIso);
    return Number(result.changes);
  } finally {
    db.close();
  }
}
