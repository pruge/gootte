import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { taskflowText } from "./commands";
import { CliError } from "./args";

/**
 * §13.9 — the USER-VISIBLE consumer: `gootte taskflow [프로젝트] [--json]` reads
 * the Taskflow canonical state and writes nothing.
 */

let project: string;

function writeJson(rel: string, value: unknown): void {
  const full = join(project, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2), "utf8");
}

function snapshot(dir: string): string {
  const rows: string[] = [];
  const walk = (current: string): void => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else rows.push(`${full.slice(dir.length)} ${createHash("sha256").update(readFileSync(full)).digest("hex")}`);
    }
  };
  walk(dir);
  return rows.join("\n");
}

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), "gootte-taskflow-cli-"));
  writeJson(".pi/taskflow/features/demo.json", { id: "demo", goal: "prove the reader", taskIds: ["demo-T01"] });
  writeJson(".pi/taskflow/tasks/demo-T01.json", {
    id: "demo-T01",
    feature: "demo",
    title: "one task",
    state: "done",
    version: 10,
    lifecycle: [
      { kind: "task.created", at: "2026-09-24T00:00:00.000Z", actor: { role: "captain", id: "c1" } },
      { kind: "task.verification_recorded", at: "2026-09-24T00:00:30.000Z", actor: { role: "orch", id: "o1" } },
      { kind: "task.merged", at: "2026-09-24T00:01:00.000Z", actor: { role: "orch", id: "o1" } },
    ],
    review: { verdict: "approved", candidateCommit: "abc123" },
    verification: { passed: true, binding: "receipt", receiptId: "74d2afb0b4f1a4d4", commit: "abc123" },
    discussions: [{ id: "Q-1", status: "answered", blocking: true }],
  });
});

afterEach(() => {
  rmSync(project, { recursive: true, force: true });
});

describe("gootte taskflow (read-only consumer)", () => {
  test("renders the timeline a user sees, with evidence and durations", () => {
    const text = taskflowText([project]);
    expect(text).toContain("Taskflow " + project);
    expect(text).toContain("tasks 1 · verified 1 · open questions 0 · elapsed 1m0s");
    expect(text).toContain("[demo] prove the reader — task 1");
    expect(text).toContain("demo-T01  done v10  review approved  receipt 74d2afb0b4f1 ✔verified");
    expect(text).toContain("task.created");
    expect(text).toContain("task.merged");
    expect(text).toContain("· 30s");
  });

  test("--json emits the derived model, not a stored copy", () => {
    const parsed = JSON.parse(taskflowText([project, "--json"])) as {
      totals: { tasks: number; verified: number; elapsedMs: number };
      tasks: { id: string; evidence: { receiptId: string } }[];
    };
    expect(parsed.totals).toEqual({
      tasks: 1,
      byState: { done: 1 },
      verified: 1,
      openQuestions: 0,
      elapsedMs: 60_000,
    });
    expect(parsed.tasks[0]!.evidence.receiptId).toBe("74d2afb0b4f1a4d4");
  });

  test("reading writes nothing (byte-level witness)", () => {
    const before = snapshot(project);
    taskflowText([project]);
    taskflowText([project, "--json"]);
    expect(snapshot(project)).toBe(before);
  });

  test("a project without canonical state says so and creates nothing", () => {
    const empty = mkdtempSync(join(tmpdir(), "gootte-taskflow-empty-"));
    try {
      const text = taskflowText([empty]);
      expect(text).toContain("(Taskflow canonical state 없음:");
      expect(readdirSync(empty)).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });

  test("rejects an unknown flag instead of silently ignoring it", () => {
    expect(() => taskflowText([project, "--write"])).toThrow(CliError);
    expect(() => taskflowText([project, "extra"])).toThrow(CliError);
  });
});

/**
 * §13.9 front door — a user does not run the TS entry directly; they run
 * `scripts/gootte.sh` (or `bin/gootte`). Regression: the wrapper ended with
 * `pnpm -s -C code/web gootte`, and this pnpm rejects `-s` ("unexpected argument
 * '-s' found"), so the CLI was unreachable through the documented entrypoint.
 */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const wrapper = join(repoRoot, "scripts/gootte.sh");

describe("gootte front door (scripts/gootte.sh)", () => {
  test.skipIf(!existsSync(wrapper))(
    "reaches `taskflow --json` through the wrapper and leaves the project byte-identical",
    () => {
      const before = snapshot(project);
      const out = execFileSync("bash", [wrapper, "taskflow", project, "--json"], {
        encoding: "utf8",
        cwd: repoRoot,
        env: { ...process.env, GOOTTE_HOME: repoRoot },
        timeout: 60_000,
      });
      const parsed = JSON.parse(out) as { present: boolean; totals: { tasks: number } };
      expect(parsed.present).toBe(true);
      expect(parsed.totals.tasks).toBe(1);
      expect(snapshot(project)).toBe(before);
    },
    120_000,
  );
});
