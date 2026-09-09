import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type { Feature, FeatureTicket } from "@gootte/contract";
import {
  clearState,
  hasTimeRecords,
  readState,
  readTicketRecords,
  recalcProjectState,
  removeTicketRecord,
  upsertTicketRecord,
  writeTicketRecords,
} from "./state-store";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "gootte-state-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ticket = (slug: string, status: FeatureTicket["status"]): FeatureTicket => ({
  num: "01",
  slug,
  path: `issues/${slug}.md`,
  title: slug,
  status,
  sourceStatus: null,
  statusKnown: true,
  blockedBy: [],
  unreadableBlockedBy: [],
  waitingOn: [],
  startable: true,
  needsCaptainEye: false,
});

/** 기능 수준 상태는 의도적으로 pending 으로 둔다 — 구관례 기능은 티켓이 끝나도
 * spec `Status:` 줄 출처라 pending 인 채 남는다(the-header-agrees-with-its-tickets D2). */
function feature(slug: string, tickets: FeatureTicket[]): Feature {
  return {
    slug,
    title: `${slug} — 제목`,
    status: "pending",
    sourceStatus: "draft",
    statusKnown: true,
    docs: [],
    tickets,
  };
}

const stateFile = (): string => join(dir, ".gootte", "state.json");

describe("state-store — 배지 파생 캐시(openFeatures)", () => {
  test("파일이 없으면 빈 상태를 준다 — 에러가 아니다", () => {
    const state = readState(dir);
    expect(state.version).toBe(2);
    expect(state.openFeatures).toEqual([]);
  });

  test("recalcProjectState 는 남은 일이 있는 기능만 센다 — 판정은 티켓 기준", () => {
    const features = [
      feature("auth", [ticket("01-a", "done"), ticket("02-b", "pending")]),
      feature("paid", [ticket("01-a", "done")]),
      feature("bare", []),
    ];
    recalcProjectState(dir, features);
    const state = readState(dir);
    expect(state.version).toBe(2);
    expect(state.openFeatures.map((f) => f.slug)).toEqual(["auth"]);
  });

  test("기능 수준 status 가 pending 이어도 티켓이 전부 끝나면 제외한다(배지 감소 결함 2026-09-08)", () => {
    const features = [feature("auth", [ticket("01-a", "done"), ticket("02-b", "done")])];
    recalcProjectState(dir, features);
    expect(readState(dir).openFeatures).toEqual([]);
  });

  test("clearState — 파일이 지워지고 다시 빈 상태가 된다. 없어도 조용하다", () => {
    recalcProjectState(dir, [feature("auth", [ticket("01-a", "pending")])]);
    expect(existsSync(stateFile())).toBe(true);
    clearState(dir);
    expect(existsSync(stateFile())).toBe(false);
    clearState(dir); // 없는 채로 다시 불러도 예외가 아니다
    expect(readState(dir).openFeatures).toEqual([]);
  });
});

describe("state-store v2 — 티켓 시간·상태 레코드(time-records T01)", () => {
  test("upsert → read 로 왕복하고 원자적 쓰기 뒤 tmp 가 남지 않는다", () => {
    upsertTicketRecord(dir, "auth/T01", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: null });
    expect(readTicketRecords(dir)["auth/T01"]?.startedAt).toBe("2026-09-09T09:00:00+09:00");
    expect(existsSync(`${stateFile()}.tmp`)).toBe(false);
  });

  test("upsert 는 openFeatures 파생 캐시를 보존한다 — read-modify-write", () => {
    recalcProjectState(dir, [feature("auth", [ticket("01-a", "pending")])]);
    upsertTicketRecord(dir, "auth/T01", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: null });
    expect(readState(dir).openFeatures).toHaveLength(1);
  });

  test("recalcProjectState 는 tickets 레코드를 지우지 않는다 — 파생 갱신과 SoT 는 분리", () => {
    upsertTicketRecord(dir, "auth/T01", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: "2026-09-09T10:00:00+09:00" });
    recalcProjectState(dir, []);
    expect(Object.keys(readTicketRecords(dir))).toEqual(["auth/T01"]);
  });

  test("removeTicketRecord — cancel 의 대응물. 없는 키에도 조용하다", () => {
    upsertTicketRecord(dir, "auth/T01", { startedAt: "2026-09-09T09:00:00+09:00", finishedAt: null });
    removeTicketRecord(dir, "auth/T01");
    expect(readTicketRecords(dir)).toEqual({});
    removeTicketRecord(dir, "auth/T01"); // 없는 채로 다시 불러도 예외가 아니다
  });

  test("writeTicketRecords — 여러 레코드를 한 트랜잭션으로(migrate-time)", () => {
    writeTicketRecords(dir, {
      "auth/T01": { startedAt: "2026-09-01T09:00:00+09:00", finishedAt: "2026-09-01T10:00:00+09:00" },
      "auth/T02": { startedAt: null, finishedAt: null, statusRaw: "resolved (2026-09-02)" },
    });
    expect(Object.keys(readTicketRecords(dir)).sort()).toEqual(["auth/T01", "auth/T02"]);
  });

  test("statusRaw 는 verbatim 원문이다 — 저장 계층이 해석하지 않는다(INV-4)", () => {
    upsertTicketRecord(dir, "auth/T01", { startedAt: null, finishedAt: null, statusRaw: "resolved (2026-09-09) · 열린 결정 전부 닫음" });
    expect(readTicketRecords(dir)["auth/T01"]?.statusRaw).toBe("resolved (2026-09-09) · 열린 결정 전부 닫음");
  });

  test("pauses 를 기록하고 읽는다 — ADR-0002 형태 그대로", () => {
    upsertTicketRecord(dir, "auth/T01", {
      startedAt: "2026-09-09T09:00:00+09:00",
      finishedAt: null,
      pauses: [{ pausedAt: "2026-09-09T09:30:00+09:00", resumedAt: null }],
    });
    expect(readTicketRecords(dir)["auth/T01"]?.pauses).toEqual([
      { pausedAt: "2026-09-09T09:30:00+09:00", resumedAt: null },
    ]);
  });

  test("v1 파일은 읽어서 배지를 계속 준다 — 그러나 v2 모드는 아니다(D2)", () => {
    mkdirAndWrite(stateFile(), JSON.stringify({
      version: 1,
      updatedAt: "2026-09-08T00:00:00.000Z",
      openFeatures: [{ slug: "legacy", title: "l", status: "pending", statusKnown: false, tickets: [] }],
    }));
    expect(hasTimeRecords(dir)).toBe(false); // v1 은 권위 모드가 아니다
    expect(readTicketRecords(dir)).toEqual({}); // 승격 읽기 — tickets 는 빈 맵
    expect(readState(dir).openFeatures).toHaveLength(1);
  });

  test("hasTimeRecords — v2 파일이 없으면 false(폴백 모드, D2)", () => {
    expect(hasTimeRecords(dir)).toBe(false);
  });

  test("recalcProjectState 는 v1 스키마를 유지한다 — 배지 경로만으로 v2 모드가 켜지지 않는다(D2)", () => {
    recalcProjectState(dir, []);
    // version 1 로 남는다 — v2 승격은 migrate-time(레코드 기록)의 몫이다.
    const raw = JSON.parse(readFileSync(stateFile(), "utf8")) as { version: number };
    expect(raw.version).toBe(1);
    expect(hasTimeRecords(dir)).toBe(false);
  });

  test("upsertTicketRecord 가 v2 로 승격한다 — 레코드 기록이 모드 전환의 유일한 길", () => {
    recalcProjectState(dir, []); // v1 배지 먼저
    upsertTicketRecord(dir, "auth/T01", { startedAt: "2026-09-09T09:00:00+09:00" });
    expect(hasTimeRecords(dir)).toBe(true);
    expect(readState(dir).openFeatures).toEqual([]); // 배지도 보존
  });

  test("깨진 파일은 예외를 던진다 — SoT 이므로 조용한 빈 상태는 데이터 소실이다(B4)", () => {
    mkdirAndWrite(stateFile(), "{ 깨진 json");
    expect(() => readState(dir)).toThrow();
    expect(() => readTicketRecords(dir)).toThrow();
    expect(readFileSync(stateFile(), "utf8")).toBe("{ 깨진 json"); // 읽다 만 파일은 지우지 않는다
  });

  test("스키마 위반(모르는 version)도 예외 — 조용히 삼키지 않는다", () => {
    mkdirAndWrite(stateFile(), JSON.stringify({ version: 99 }));
    expect(() => readState(dir)).toThrow();
  });
});

function mkdirAndWrite(file: string, content: string): void {
  mkdirSync(join(dir, ".gootte"), { recursive: true });
  writeFileSync(file, content);
}
