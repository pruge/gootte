import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ProjectStateV2, TicketTimeRecord as TicketTimeRecordZ } from "@gootte/contract";
import type { Feature, TicketTimeRecord } from "@gootte/contract";
import { allTickets, hasOpenWork } from "@gootte/core";

/**
 * 프로젝트별 상태 저장소 — `<프로젝트 루트>/.gootte/state.json`.
 *
 * 두 층이 한 파일에 산다(time-records-to-state-store T01):
 * - `tickets` 맵 — 티켓 시간·상태 기록의 **SoT**(INV-5 저장. MD `Time:`/`Status:` 줄의 후계자,
 *   캡틴 승인 2026-09-09). 파생물이 아니므로 갱신이 지우지 않는다.
 * - `openFeatures` — 사이드바 배지 파생 캐시(v1 이래). MD+레코드에서 다시 계산된다.
 *
 * 🔴 모든 갱신은 **read-modify-write** — 파생 갱신이 레코드를 덮어쓰는 사고를 막는다.
 * 🔴 읽기는 zod 검증을 한다 — SoT이므로 "깨지면 조용히 빈 상태"는 데이터 소실이다(B4).
 */

const EMPTY_RECORD: TicketTimeRecord = {
  startedAt: null,
  finishedAt: null,
  pauses: [],
  statusRaw: null,
};function stateFile(projectDir: string): string {
  return join(projectDir, ".gootte", "state.json");
}

/**
 * state.json 읽기 — zod 검증. 파일이 없으면 null("이 프로젝트엔 아직 state가 없다").
 * v1 파일(version 1, tickets 없음)은 v2로 승격해 준다 — 기존 배지 경로의 회귀가 없게.
 * 🔴 SoT이므로 깨진 파일은 예외를 던진다 — 조용한 빈 상태는 데이터 소실이다.
 */
function readStateDoc(projectDir: string): ProjectStateV2 | null {
  const file = stateFile(projectDir);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
  // v1 — 배지 캐시만 있던 시절. tickets 를 빈 맵으로 승격한다.
  const doc =
    (raw as { version?: number }).version === 1
      ? { ...(raw as object), version: 2, tickets: {} }
      : raw;
  return ProjectStateV2.parse(doc);
}

/** 레코드 맵 원자적 갱신 — 읽기→변형→쓰기가 한 덩어리다. */
function mutateState(projectDir: string, mutate: (doc: ProjectStateV2) => ProjectStateV2): ProjectStateV2 {
  const prev = readStateDoc(projectDir) ?? ProjectStateV2.parse({ version: 2, updatedAt: new Date().toISOString() });
  const next = mutate(prev);
  const doc: ProjectStateV2 = { ...next, updatedAt: new Date().toISOString() };
  const file = stateFile(projectDir);
  mkdirSync(join(projectDir, ".gootte"), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n");
  renameSync(tmp, file); // 원자적 교체 — 읽는 쪽이 절반 파일을 볼 수 없게
  return doc;
}

/** 배지 파생 캐시(openFeatures) 읽기 — 파일 없으면 빈 상태(에러 아님, v1 호환). */
export function readState(projectDir: string): { version: 2; updatedAt: string; openFeatures: Feature[] } {
  const doc = readStateDoc(projectDir);
  if (!doc) return { version: 2, updatedAt: "", openFeatures: [] };
  return { version: 2, updatedAt: doc.updatedAt, openFeatures: doc.openFeatures };
}

/**
 * v2 모드 판정 — state.json 의 **원문 version 이 2** 인가. 이 프로젝트의 티켓 기록은
 * 레코드가 권위다(D2). 🔴 v1(배지 전용) 파일은 모드를 켜지 않는다 — 배지 경로만으로
 * 레코드 권위가 켜지면 레코드 없는 v2 가 MD 기반 판정을 지워 버린다(이중 SoT 위반).
 * v2 승격은 `migrate-time`(T06)이 레코드를 쓰는 시점에만 일어난다.
 */
export function hasTimeRecords(projectDir: string): boolean {
  const file = stateFile(projectDir);
  if (!existsSync(file)) return false;
  try {
    return (JSON.parse(readFileSync(file, "utf8")) as { version?: number }).version === 2;
  } catch {
    return false; // 깨진 파일은 읽기 경로(joinTimeRecords)의 오류 처리로 간다
  }
}

/** 티켓 시간·상태 기록 맵 읽기 — 파일이 없으면 빈 맵. */
export function readTicketRecords(projectDir: string): Record<string, TicketTimeRecord> {
  return readStateDoc(projectDir)?.tickets ?? {};
}

/**
 * 티켓 레코드 기록(upsert) — openFeatures 파생 캐시를 보존한다.
 * 🔴 **undefined 는 "그대로", null 은 "지운다"** — 부분 입력(`{ pauses }` 만)이 나머지 칸을
 * 덮지 않는다(pause 기록이 startedAt 을 지우는 사고 방지). 빈 레코드와 병합하는 것은
 * "기록된 적 없는 칸의 기본값"을 채우기 위해서다.
 */
export function upsertTicketRecord(
  projectDir: string,
  key: string,
  record: Partial<TicketTimeRecord>,
): TicketTimeRecord {
  const doc = mutateState(projectDir, (prev) => {
    const base = prev.tickets[key] ?? EMPTY_RECORD;
    const merged: TicketTimeRecord = {
      startedAt: record.startedAt !== undefined ? record.startedAt : base.startedAt,
      finishedAt: record.finishedAt !== undefined ? record.finishedAt : base.finishedAt,
      pauses: record.pauses !== undefined ? record.pauses : base.pauses,
      statusRaw: record.statusRaw !== undefined ? record.statusRaw : base.statusRaw,
    };
    return { ...prev, tickets: { ...prev.tickets, [key]: TicketTimeRecordZ.parse(merged) } };
  });
  return doc.tickets[key]!;
}

/** 티켓 레코드 삭제(cancel의 대응물) — 키가 없어도 조용하다. */
export function removeTicketRecord(projectDir: string, key: string): void {
  mutateState(projectDir, (prev) => {
    if (!(key in prev.tickets)) return prev;
    const tickets = { ...prev.tickets };
    delete tickets[key];
    return { ...prev, tickets };
  });
}

/** 여러 레코드를 한 번에 기록(migrate-time용) — 한 트랜잭션으로 쓴다. */
export function writeTicketRecords(
  projectDir: string,
  records: Record<string, Partial<TicketTimeRecord>>,
): void {
  mutateState(projectDir, (prev) => {
    const merged = { ...prev.tickets };
    for (const [key, record] of Object.entries(records)) {
      const base = merged[key] ?? EMPTY_RECORD;
      merged[key] = TicketTimeRecordZ.parse({
        startedAt: record.startedAt !== undefined ? record.startedAt : base.startedAt,
        finishedAt: record.finishedAt !== undefined ? record.finishedAt : base.finishedAt,
        pauses: record.pauses !== undefined ? record.pauses : base.pauses,
        statusRaw: record.statusRaw !== undefined ? record.statusRaw : base.statusRaw,
      });
    }
    return { ...prev, tickets: merged };
  });
}

/** 배지 전용(v1) 파일 원자적 쓰기 — recalcProjectState 의 파일 없는 경로가 쓴다. */
function writeBadgeV1(projectDir: string, openFeatures: Feature[]): void {
  const file = stateFile(projectDir);
  mkdirSync(join(projectDir, ".gootte"), { recursive: true });
  const doc = { version: 1, updatedAt: new Date().toISOString(), openFeatures };
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc, null, 2) + "\n");
  renameSync(tmp, file);
}

/**
 * 배지 파생 캐시(openFeatures)를 다시 계산해 기록한다 — **tickets는 건드리지 않는다**.
 * 판정은 티켓 기준(`hasOpenWork`·`allTickets`, core) — `countOpenFeatures`와 같은
 * 술어 하나(INV-3 판정 자리는 하나뿐). 기능 수준 `status`는 spec `Status:` 줄 출처라
 * 구관례 기능은 티켓이 전부 끝나도 pending인 채 남는다 — 그 값으로 거르면 완료된
 * 기능이 배지에 남는다(실제 결함 2026-09-08).
 *
 * 🔴 **v1 스키마를 유지한다**(tickets 가 없으면) — 배지 경로만으로 v2 모드가 켜지면
 * 레코드 없는 v2 파일이 MD 기반 판정을 지워 버린다(D2 이중 SoT 위반). v2 전환은
 * `migrate-time`(T06)이 레코드를 기록할 때 명시적으로 일어난다.
 */
export function recalcProjectState(projectDir: string, features: Feature[]): void {
  // 🔴 원문 version 을 직접 본다 — readStateDoc 은 v1 을 v2 로 승격해 돌려주므로 그 값을
  // 쓰면 배지 경로만으로 v2 파일이 만들어진다(레코드 없는 v2 = MD 판정 소멸, D2 위반).
  const file = stateFile(projectDir);
  const openFeatures = features.filter((f) => hasOpenWork(allTickets(f)));
  const isV2 =
    existsSync(file) &&
    (JSON.parse(readFileSync(file, "utf8")) as { version?: number }).version === 2;
  // 🔴 state.json 을 감시하는 소비처가 있으므로 **값이 같으면 쓰지 않는다** —
  // 쓰기→감시→재계산→쓰기 되먹임 루프(피드백 고리)를 끊는다.
  if (existsSync(file)) {
    try {
      const prev = JSON.parse(readFileSync(file, "utf8")) as { openFeatures?: Feature[] };
      if (sameFeatures(prev.openFeatures ?? [], openFeatures)) return;
    } catch {
      // 깨진 파일 — 아래 쓰기가 덮어 간다
    }
  }
  if (!isV2) {
    // v1(배지 전용) 쓰기 — version 1 로 남는다. v2 승격은 migrate-time 의 몫.
    writeBadgeV1(projectDir, openFeatures);
    return;
  }
  mutateState(projectDir, (prev) => ({ ...prev, openFeatures }));
}

/** openFeatures 배열 비교 — 순서 무관 slug 기준(파생 캐시라 내용이 같으면 같다). */
function sameFeatures(a: readonly Feature[], b: readonly Feature[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].map((f) => f.slug).sort();
  const sb = [...b].map((f) => f.slug).sort();
  return sa.every((s, i) => s === sb[i]);
}

/** state.json 삭제. */
export function clearState(projectDir: string): void {
  const file = stateFile(projectDir);
  if (existsSync(file)) rmSync(file, { force: true });
}
