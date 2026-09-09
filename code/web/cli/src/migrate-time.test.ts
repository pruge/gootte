import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readTicketRecords, hasTimeRecords, readState } from "@gootte/core-io";
import { migrateTime } from "./migrate-time";

/**
 * 이관 명령(T06) — MD 줄 → 레코드. 파서는 읽기 경로와 같은 것(parseTimeLine·parseStatusLine)을
 * 쓰므로, 여기서 잡는 것은 병합·멱등·dry-run 안전·원문 보존이다.
 */

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gootte-mig-"));
  mkdirSync(join(root, "docs/features/alpha/tickets"), { recursive: true });
  mkdirSync(join(root, "docs/features/alpha/issues"), { recursive: true });
  mkdirSync(join(root, "docs/features/beta/tickets"), { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), "agent\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const migrate = (): ReturnType<typeof migrateTime> => migrateTime(["--dry-run", "gootte-mig"], root);

function nameProject(slug: string): string {
  // discoverProjects 가 basename 을 slug 로 쓴다 — 임시 루트 이름을 프로젝트 slug 로 만든다.
  const renamed = join(root, "..", slug);
  rmSync(renamed, { recursive: true, force: true });
  mkdirSync(renamed, { recursive: true });
  const { cpSync } = require("node:fs") as typeof import("node:fs");
  cpSync(root, renamed, { recursive: true });
  rmSync(root, { recursive: true, force: true });
  root = renamed;
  return slug;
}

describe("migrateTime — 이관", () => {
  test("신관례 Time 줄 → 레코드", () => {
    const slug = nameProject("gootte-mig");
    writeFileSync(
      join(root, "docs/features/alpha/tickets/T01.md"),
      "# T01\n\n**Time:** started=2026-09-01T09:00:00+09:00 finished=2026-09-02T10:00:00+09:00\n",
    );
    const report = migrateTime([slug], root);
    expect(report.migrated).toBe(1);
    expect(report.records["alpha/T01"]).toMatchObject({
      startedAt: "2026-09-01T09:00:00+09:00",
      finishedAt: "2026-09-02T10:00:00+09:00",
    });
  });

  test("구관례 Status 원문 → statusRaw verbatim(completedAt 해석은 읽기 경로 몫)", () => {
    const slug = nameProject("gootte-mig");
    writeFileSync(join(root, "docs/features/alpha/issues/01-a.md"), "# 01\n\n**Status:** resolved (2026-08-08)\n");
    const report = migrateTime([slug], root);
    expect(report.records["alpha/01-a"]?.statusRaw).toBe("resolved (2026-08-08)");
  });

  test("사본 병합 — started 가 있는 사본과 finished 가 있는 사본이 합쳐진다", () => {
    const slug = nameProject("gootte-mig");
    const wt = mkdtempSync(join(tmpdir(), "gootte-mig-wt-"));
    try {
      writeFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "# T01\n\n**Time:** started=2026-09-01T09:00:00+09:00\n");
      mkdirSync(join(wt, "docs/features/alpha/tickets"), { recursive: true });
      writeFileSync(join(wt, "docs/features/alpha/tickets/T01.md"), "# T01\n\n**Time:** started=2026-09-02T08:00:00+09:00 finished=2026-09-02T18:00:00+09:00\n");
      const report = migrateTime([slug], root, [wt]);
      expect(report.multiCopy).toBe(1);
      // 정방향 병합 — 가장 이른 시작, 가장 늦은 완료(mergeTicketTimes 규칙)
      expect(report.records["alpha/T01"]).toMatchObject({
        startedAt: "2026-09-01T09:00:00+09:00",
        finishedAt: "2026-09-02T18:00:00+09:00",
      });
    } finally {
      rmSync(wt, { recursive: true, force: true });
    }
  });

  test("기록 없는 티켓은 생략한다 — 미시작은 레코드를 만들지 않는다", () => {
    const slug = nameProject("gootte-mig");
    writeFileSync(join(root, "docs/features/alpha/tickets/T02.md"), "# T02\n");
    const report = migrateTime([slug], root);
    expect(report.records["alpha/T02"]).toBeUndefined();
    expect(report.skipped).toBe(1);
  });

  test("실실행 — 레코드가 기록되고 v2 모드가 켜지며 배지가 계산된다", () => {
    const slug = nameProject("gootte-mig");
    writeFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "# T01\n\n**Time:** started=2026-09-01T09:00:00+09:00\n");
    migrateTime([slug], root);
    expect(hasTimeRecords(root)).toBe(true);
    expect(readTicketRecords(root)["alpha/T01"]?.startedAt).toBe("2026-09-01T09:00:00+09:00");
    expect(readState(root).openFeatures).toHaveLength(1); // 배지 — 남은 일 있는 기능
  });

  test("멱등 — 재실행해도 같은 값이다", () => {
    const slug = nameProject("gootte-mig");
    writeFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "# T01\n\n**Time:** started=2026-09-01T09:00:00+09:00 finished=2026-09-02T10:00:00+09:00\n");
    migrateTime([slug], root);
    const first = readTicketRecords(root);
    migrateTime([slug], root);
    expect(readTicketRecords(root)).toEqual(first);
  });

  test("dry-run — 파일 시스템을 바꾸지 않는다(INV-2)", () => {
    const slug = nameProject("gootte-mig");
    writeFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "# T01\n\n**Time:** started=2026-09-01T09:00:00+09:00\n");
    const before = existsSync(join(root, ".gootte", "state.json"));
    migrateTime(["--dry-run", slug], root);
    expect(existsSync(join(root, ".gootte", "state.json"))).toBe(before); // false 유지
    expect(hasTimeRecords(root)).toBe(false);
  });

  test("레코드 읽기 = MD 읽기 — applyTimeRecords 대조", async () => {
    const slug = nameProject("gootte-mig");
    const { readFeatures, joinTimeRecords, readFeaturesWithTime } = await import("@gootte/core-io");
    writeFileSync(
      join(root, "docs/features/alpha/tickets/T01.md"),
      "# T01\n\n**Time:** started=2026-09-01T09:00:00+09:00 finished=2026-09-02T10:00:00+09:00\n",
    );
    writeFileSync(join(root, "docs/features/alpha/tickets/T02.md"), "# T02\n\n**Status:** wontfix\n");
    migrateTime([slug], root);
    // 이관 뒤: MD 파싱 결과(폴백 경로)와 레코드 조인 결과(권위 경로)가 같아야 한다 — 이것이
    // 나중의 MD 줄 삭제가 안전하다는 증명이다(T06 재파싱 대조).
    const mdView = readFeatures([root]);
    const joined = joinTimeRecords(readFeatures([root]), root);
    const viaAll = readFeaturesWithTime([root], root);
    const mdT = mdView[0]!.newTickets!.find((t) => t.slug === "T01")!;
    const recT = joined[0]!.newTickets!.find((t) => t.slug === "T01")!;
    expect(recT.status).toBe(mdT.status); // done == done
    expect(recT.startedAt).toBe(mdT.startedAt);
    expect(recT.finishedAt).toBe(mdT.finishedAt);
    const recDrop = viaAll[0]!.newTickets!.find((t) => t.slug === "T02")!;
    expect(recDrop.status).toBe("dropped"); // statusRaw wontfix → dropped(읽기 경로 해석)
    expect(migrate).toBeDefined();
  });
});
