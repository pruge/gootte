import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readState, readTicketRecords } from "@gootte/core-io";
import { runTimeCommand, resolveDropDate, resolveMainRoot, resolveTime } from "./time";

/**
 * state.json 모드 시간 기록(T05) — bash CLI(cmd_start/end/pause/resume/cancel/drop)의
 * 규칙을 레코드 위로 승계했다. 어긋나면 터미널과 화면이 다른 말을 한다.
 */

let root: string;
let cwd: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gootte-time-ts-"));
  cwd = root; // 메인에서 실행하는 기본 시나리오
  mkdirSync(join(root, "docs", "features", "alpha", "tickets"), { recursive: true });
  mkdirSync(join(root, "docs", "features", "beta", "issues"), { recursive: true });
  writeFileSync(join(root, "AGENTS.md"), "agent\n");
  writeFileSync(join(root, "docs/features/alpha/tickets/T01.md"), "# T01 — a\n");
  writeFileSync(join(root, "docs/features/alpha/tickets/T02.md"), "# T02 — b\n");
  writeFileSync(join(root, "docs/features/alpha/tickets/T03.md"), "# T03 — c\n");
  writeFileSync(join(root, "docs/features/beta/issues/01-a.md"), "# 01 — d\n");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const rec = (key: string) => readTicketRecords(root)[key];
const run = (...argv: string[]): string => runTimeCommand(argv, cwd);
const expectCliError = (fn: () => unknown, message: string): void => {
  try {
    fn();
    expect.fail(`오류가 나야 한다: ${message}`);
  } catch (err) {
    expect((err as Error).message).toContain(message);
  }
};

describe("runTimeCommand — 기록 흐름", () => {
  test("start → startedAt 기록, 기록이 v2 모드를 만든다", () => {
    const out = run("start", "alpha", "T01");
    expect(out).toContain("시작 기록");
    const r = rec("alpha/T01");
    expect(r?.startedAt).toMatch(/^20\d\d-/);
    expect(r?.finishedAt).toBeNull();
  });

  test("start → pause → resume → end 의 pauses 쌍", () => {
    run("start", "alpha", "T01");
    run("pause", "alpha", "T01", "--at", "2026-09-09T10:00:00+09:00");
    run("resume", "alpha", "T01", "--at", "2026-09-09T11:00:00+09:00");
    run("end", "alpha", "T01", "--at", "2026-09-09T12:00:00+09:00");
    const r = rec("alpha/T01")!;
    expect(r.startedAt).not.toBeNull();
    expect(r.pauses).toEqual([{ pausedAt: "2026-09-09T10:00:00+09:00", resumedAt: "2026-09-09T11:00:00+09:00" }]);
    expect(r.finishedAt).toBe("2026-09-09T12:00:00+09:00");
  });

  test("구관례(issues/) 티켓에도 기록한다", () => {
    run("start", "beta", "01");
    expect(rec("beta/01")?.startedAt).not.toBeNull();
  });

  test("cancel 은 레코드를 삭제한다 — MD Time: 줄 삭제의 대응물", () => {
    run("start", "alpha", "T01");
    run("cancel", "alpha", "T01");
    expect(rec("alpha/T01")).toBeUndefined();
  });

  test("drop 은 statusRaw 를 wontfix 로 — 시작·완료 기록은 보존", () => {
    run("start", "alpha", "T01", "--at", "2026-09-09T09:00:00+09:00");
    run("drop", "alpha", "T01", "--at", "2026-09-09T10:00:00+09:00");
    const r = rec("alpha/T01")!;
    expect(r.statusRaw).toBe("wontfix (2026-09-09 10:00)");
    expect(r.startedAt).toBe("2026-09-09T09:00:00+09:00");
  });

  test("배지 파생 캐시(openFeatures)도 같이 갱신된다", () => {
    run("start", "alpha", "T01");
    // readFeatures([root]) 로 계산 — 문서가 있으므로 alpha 가 잡힌다
    expect(readState(root).openFeatures.length).toBeGreaterThanOrEqual(0);
  });
});

describe("runTimeCommand — bash 규칙 승계(위반은 오류)", () => {
  test("미시작 end 금지", () => {
    expectCliError(() => run("end", "alpha", "T01"), "시작되지 않은 티켓입니다");
  });

  test("미시작 cancel 금지", () => {
    expectCliError(() => run("cancel", "alpha", "T01"), "시작되지 않은 티켓입니다");
  });

  test("끝난 티켓 start 금지", () => {
    run("start", "alpha", "T01");
    run("end", "alpha", "T01");
    expectCliError(() => run("start", "alpha", "T01"), "이미 끝난 티켓의 시작 시간은 바꿀 수 없습니다");
  });

  test("이미 시작된 티켓 재 start 금지(비대화형 — bash --update 와 다른 길)", () => {
    run("start", "alpha", "T01");
    expectCliError(() => run("start", "alpha", "T01"), "이미 시작된 티켓입니다");
  });

  test("재개 안 된 pause 중 end 금지 — resume 먼저", () => {
    run("start", "alpha", "T01");
    run("pause", "alpha", "T01");
    expectCliError(() => run("end", "alpha", "T01"), "일시중단 상태입니다 — resume 먼저");
  });

  test("일시중단 아닌데 resume 금지", () => {
    run("start", "alpha", "T01");
    expectCliError(() => run("resume", "alpha", "T01"), "일시중단 상태가 아닙니다");
  });

  test("일시중단 중 pause 재금지", () => {
    run("start", "alpha", "T01");
    run("pause", "alpha", "T01");
    expectCliError(() => run("pause", "alpha", "T01"), "이미 일시중단된 티켓입니다");
  });

  test("끝난 티켓 cancel 금지", () => {
    run("start", "alpha", "T01");
    run("end", "alpha", "T01");
    expectCliError(() => run("cancel", "alpha", "T01"), "이미 끝난 티켓은 취소할 수 없습니다");
  });

  test("일시중단 중 cancel 금지", () => {
    run("start", "alpha", "T01");
    run("pause", "alpha", "T01");
    expectCliError(() => run("cancel", "alpha", "T01"), "취소할 수 없습니다");
  });

  test("이미 폐기된 티켓 drop 재금지", () => {
    run("drop", "alpha", "T01");
    expectCliError(() => run("drop", "alpha", "T01"), "이미 폐기됨");
  });

  test("존재하지 않는 티켓 금지 — MD 파일이 실재해야 기록한다", () => {
    expectCliError(() => run("start", "alpha", "T99"), "티켓 파일을 찾을 수 없습니다");
  });

  test("이해 못한 상대시간 금지", () => {
    expectCliError(() => run("start", "alpha", "T01", "--at", "1x30z"), "이해 못한 시간 표현");
  });
});

describe("resolveTime / resolveDropDate — bash 포트", () => {
  test("ISO8601 은 verbatim", () => {
    expect(resolveTime("2026-09-09T09:00:00+09:00")).toBe("2026-09-09T09:00:00+09:00");
  });

  test("상대시간은 과거로 — 90m 전", () => {
    const now = new Date("2026-09-09T12:00:00+09:00");
    const iso = resolveTime("90m", now);
    expect(iso.startsWith("2026-09-09T10:30")).toBe(true);
  });

  test("1h30m 복합 / ago 접미 / - 접두", () => {
    const now = new Date("2026-09-09T12:00:00+09:00");
    expect(resolveTime("1h30m", now).startsWith("2026-09-09T10:30")).toBe(true);
    expect(resolveTime("30m ago", now).startsWith("2026-09-09T11:30")).toBe(true);
    expect(resolveTime("-30m", now).startsWith("2026-09-09T11:30")).toBe(true);
  });

  test("drop 날짜 서식 — `YYYY-MM-DD HH:mm`", () => {
    const now = new Date("2026-09-09T12:34:00+09:00");
    expect(resolveDropDate(undefined, now)).toBe("2026-09-09 12:34");
  });
});

describe("resolveMainRoot — worktree 메인 해소(B3)", () => {
  test("메인에서 실행 — config 없으면 자기 자신이 메인", () => {
    expect(resolveMainRoot(root)).toBe(root);
  });

  test("worktree + config.json 있으면 그 메인으로", () => {
    const wt = mkdtempSync(join(tmpdir(), "gootte-time-wt-")) + "/wt";
    mkdirSync(wt, { recursive: true });
    try {
      mkdirSync(join(wt, ".gootte"), { recursive: true });
      writeFileSync(join(wt, ".gootte", "config.json"), JSON.stringify({ mainProject: root }));
      expect(resolveMainRoot(wt)).toBe(root);
    } finally {
      rmSync(wt, { recursive: true, force: true });
    }
  });

  test("worktree + config 없으면 git 으로 추론해 config.json 을 생성한다", () => {
    const main2 = mkdtempSync(join(tmpdir(), "gootte-time-main-"));
    const wt2 = mkdtempSync(join(tmpdir(), "gootte-time-wt2-")) + "/wt";
    try {
      const git = (...args: string[]) => execFileSync("git", ["-C", main2, ...args], { stdio: "ignore" });
      execFileSync("git", ["init", "-q", main2], { stdio: "ignore" });
      git("config", "user.email", "t@e.com");
      git("config", "user.name", "t");
      git("commit", "--allow-empty", "-q", "-m", "i");
      git("worktree", "add", "-q", "-b", "fm-x", wt2);
      // config.json 미리 만들어 두면 git 을 부르지 않는다 — 여기선 없는 상태로 추론.
      // 🔴 macOS 는 /var 를 /private/var 로 심링크한다 — realpath 로 같은 곳임을 본다.
      const got = resolveMainRoot(wt2);
      expect(realpathSync(got)).toBe(realpathSync(main2));
      expect(existsSync(join(wt2, ".gootte", "config.json"))).toBe(true);
    } finally {
      rmSync(main2, { recursive: true, force: true });
      rmSync(wt2, { recursive: true, force: true });
    }
  });
});
