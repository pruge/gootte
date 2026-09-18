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
    // 이관 뒤 레코드 조인 결과는 MD 원문과 같은 값을 말한다 — 이것이
    // 나중의 MD 줄 삭제가 안전한 이유다(값은 레코드에 이미 있다).
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

describe("migrateTime --strip — 레거시 줄 정리", () => {
  const seed = (): string => {
    const slug = nameProject("gootte-mig");
    writeFileSync(
      join(root, "docs/features/alpha/tickets/T01.md"),
      "# T01\n\n**Time:** started=2026-09-01T09:00:00+09:00 finished=2026-09-02T10:00:00+09:00\n\n**Blocked by:** 없음\n",
    );
    writeFileSync(join(root, "docs/features/alpha/issues/01-a.md"), "# 01\n\n**Status:** resolved (2026-08-08)\n");
    writeFileSync(
      join(root, "docs/features/beta/tickets/T01.md"),
      "# T01 — 예시 인용\n\n```md\n**Time:** started=2000-01-01T00:00:00+09:00\n```\n",
    );
    return slug;
  };

  test("--strip — 레코드 기록 뒤 MD 줄을 지운다(펜스 안 예시·Blocked by: 유지)", () => {
    const slug = seed();
    const report = migrateTime([slug, "--strip"], root);
    expect(report.migrated).toBe(2);
    expect(report.strippedFiles).toBe(2);
    expect(report.strippedLines).toBe(2);
    const t01 = require("node:fs").readFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "utf8") as string;
    expect(t01).not.toContain("Time:");
    expect(t01).toContain("**Blocked by:** 없음"); // 지우면 안 된다
    const issue = require("node:fs").readFileSync(join(root, "docs/features/alpha/issues/01-a.md"), "utf8") as string;
    expect(issue).not.toContain("Status:");
    const fenced = require("node:fs").readFileSync(join(root, "docs/features/beta/tickets/T01.md"), "utf8") as string;
    expect(fenced).toContain("**Time:** started=2000-01-01T00:00:00+09:00"); // 펜스 안은 예시다
    // 값은 레코드에 있다 — 지운 뒤에도 판정이 같다
    expect(readTicketRecords(root)["alpha/T01"]?.finishedAt).toBe("2026-09-02T10:00:00+09:00");
    expect(readTicketRecords(root)["alpha/01-a"]?.statusRaw).toBe("resolved (2026-08-08)");
  });

  test("--strip --dry-run — 미리보기만, 파일은 그대로", () => {
    const slug = seed();
    const before = require("node:fs").readFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "utf8");
    const report = migrateTime(["--dry-run", "--strip", slug], root);
    expect(report.strippedFiles).toBe(2);
    expect(report.strippedLines).toBe(2);
    expect(require("node:fs").readFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "utf8")).toBe(before);
    expect(hasTimeRecords(root)).toBe(false);
  });

  test("--strip 단독 재실행 — 이미 지워졌으면 0건(멱등)", () => {
    const slug = seed();
    migrateTime([slug, "--strip"], root);
    const again = migrateTime([slug, "--strip"], root);
    expect(again.strippedFiles).toBe(0);
    expect(again.strippedLines).toBe(0);
  });

  test("--strip — 값이 없는 빈 줄은 레코드 없이도 정리한다", () => {
    const slug = nameProject("gootte-mig");
    writeFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "# T01\n\nTime:\n");
    const report = migrateTime([slug, "--strip"], root);
    expect(report.migrated).toBe(0);
    expect(report.strippedFiles).toBe(1);
    expect(report.strippedLines).toBe(1);
    expect(require("node:fs").readFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "utf8")).toBe("# T01\n\n");
  });

  test("--strip — 지울 줄이 없으면 0건 성공(멱등의 얼굴)", () => {
    const slug = nameProject("gootte-mig");
    writeFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "# T01\n");
    const report = migrateTime([slug, "--strip"], root);
    expect(report.strippedFiles).toBe(0);
    expect(report.strippedLines).toBe(0);
    expect(require("node:fs").readFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "utf8")).toBe("# T01\n");
  });
});
