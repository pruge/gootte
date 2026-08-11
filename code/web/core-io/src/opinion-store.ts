import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { OpinionRequest } from "@gootte/contract";

/**
 * `opinion_request` 큐 — 캡틴이 의견을 청하고 답을 그 자리에서 본다(development-order/06).
 * `extra-store.ts`·`plan-store.ts` 와 같은 `plan.db` 파일을 쓰지만(같은 `GOOTTE_DATA_DIR`) 표는 따로다.
 *
 * 🔴 `feature_order`·`ticket_order` 와 성격이 다르다 — 이쪽도 `extra` 처럼 **덮어쓰지 않고 쌓이는 큐**다.
 * 답이 달리면 `done` 이 서지만 행은 지우지 않는다.
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
    CREATE TABLE IF NOT EXISTS opinion_request (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL,
      batch_summary TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      done INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

interface OpinionRow {
  id: number;
  project: string;
  batchSummary: string;
  question: string;
  answer: string | null;
  done: number;
  updatedAt: string;
}

const OPINION_COLUMNS = `id, project, batch_summary as batchSummary, question, answer, done, updated_at as updatedAt`;

function toOpinionRequest(row: OpinionRow): OpinionRequest {
  return { ...row, done: Boolean(row.done) };
}

export interface AddOpinionRequestInput {
  project: string;
  /** 버튼을 누른 그 순간의 배치 스냅샷 — verbatim(`formatPlanSnapshot`). */
  batchSummary: string;
  /** 기계가 지은 물음 — 캡틴이 타이핑하지 않는다(spec §인지는 자동, 전달은 버튼). */
  question: string;
}

/** 버튼 클릭 — 항목 하나를 쌓는다. 덮어쓰지 않는다(키가 없다 — 매번 새 행). */
export function addOpinionRequest(dataDir: string, input: AddOpinionRequestInput): OpinionRequest {
  const db = open(dataDir);
  try {
    if (!input.batchSummary.trim()) throw new Error("배치 요약이 필요하다");
    if (!input.question.trim()) throw new Error("물음이 필요하다");
    const updatedAt = new Date().toISOString();
    const result = db
      .prepare(
        `INSERT INTO opinion_request (project, batch_summary, question, answer, done, updated_at)
         VALUES (?, ?, ?, NULL, 0, ?)`,
      )
      .run(input.project, input.batchSummary, input.question, updatedAt);
    return {
      id: Number(result.lastInsertRowid),
      project: input.project,
      batchSummary: input.batchSummary,
      question: input.question,
      answer: null,
      done: false,
      updatedAt,
    };
  } finally {
    db.close();
  }
}

export interface ListOpinionRequestsOptions {
  /** 생략하면 모든 프로젝트. */
  project?: string;
  /** true 면 답변 완료까지. 기본은 대기 중만(🔴 `ask` CLI 의 침묵 규약이 이 기본값을 쓴다). */
  all?: boolean;
}

/** `ask` — 기본은 대기 중만, id 오름차순(먼저 물은 것부터 — 큐). */
export function listOpinionRequests(
  dataDir: string,
  options: ListOpinionRequestsOptions = {},
): OpinionRequest[] {
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
      .prepare(`SELECT ${OPINION_COLUMNS} FROM opinion_request ${where} ORDER BY id ASC`)
      .all(...params) as unknown as OpinionRow[];
    return rows.map(toOpinionRequest);
  } finally {
    db.close();
  }
}

/** `ask show` — 배치 요약과 물음 전체를 되읽는다. */
export function getOpinionRequest(dataDir: string, id: number): OpinionRequest | null {
  const db = open(dataDir);
  try {
    const row = db.prepare(`SELECT ${OPINION_COLUMNS} FROM opinion_request WHERE id = ?`).get(id) as
      | OpinionRow
      | undefined;
    return row ? toOpinionRequest(row) : null;
  } finally {
    db.close();
  }
}

/**
 * `ask answer` — planner 가 답을 적는다. verbatim 으로 싣는다(INV-4, 요약하지 않는다).
 * 지우지 않고 처리 표시만 한다(🔴 근거로 남긴다, `extra done` 과 같은 성격).
 */
export function answerOpinionRequest(dataDir: string, id: number, answer: string): OpinionRequest {
  const db = open(dataDir);
  try {
    if (!answer.trim()) throw new Error("답이 필요하다");
    const row = db.prepare(`SELECT ${OPINION_COLUMNS} FROM opinion_request WHERE id = ?`).get(id) as
      | OpinionRow
      | undefined;
    if (!row) throw new Error(`ask id ${id} 를 찾을 수 없다`);
    const updatedAt = new Date().toISOString();
    db.prepare(`UPDATE opinion_request SET answer = ?, done = 1, updated_at = ? WHERE id = ?`).run(
      answer,
      updatedAt,
      id,
    );
    return toOpinionRequest({ ...row, answer, done: 1, updatedAt });
  } finally {
    db.close();
  }
}
