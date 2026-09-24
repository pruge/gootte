import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { readTaskflowRecords, taskflowRootOf } from "./taskflow";

/**
 * §13.9 — the reader must be read-only, deterministic and tolerant, and it must
 * never repair a record it cannot parse.
 */

const TASK = {
  id: "demo-T01",
  feature: "demo",
  title: "one task",
  state: "done",
  version: 10,
  lifecycle: [
    { kind: "task.created", at: "2026-09-24T00:00:00.000Z", actor: { role: "captain", id: "c1" } },
    { kind: "task.merged", at: "2026-09-24T00:10:00.000Z", actor: { role: "orch", id: "o1" } },
  ],
  review: { verdict: "approved", candidateCommit: "abc123" },
  verification: { passed: true, binding: "receipt", receiptId: "r-1", commit: "abc123" },
  discussions: [
    { id: "Q-1", kind: "captain_decision", status: "answered", blocking: true },
    { id: "Q-2", kind: "captain_decision", status: "escalated", blocking: true },
    { id: "Q-3", kind: "captain_decision", status: "escalated", blocking: false },
  ],
};

let project: string;

function writeJson(rel: string, value: unknown): void {
  const full = join(project, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2), "utf8");
}

/** Every file under `dir`, sorted, with its sha256 — the mutation witness. */
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
  project = mkdtempSync(join(tmpdir(), "gootte-taskflow-"));
});

afterEach(() => {
  // Restore permissions before removing (the read-only case chmods the tree).
  const restore = (dir: string): void => {
    chmodSync(dir, 0o755);
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) restore(full);
      else chmodSync(full, 0o644);
    }
  };
  try {
    restore(project);
  } catch {
    // already writable
  }
  rmSync(project, { recursive: true, force: true });
});

describe("§13.9 taskflow canonical reader", () => {
  test("reads features/tasks/runs and skips a malformed record without repairing it", () => {
    writeJson(".pi/taskflow/features/demo.json", { id: "demo", goal: "prove", taskIds: ["demo-T01"] });
    writeJson(".pi/taskflow/tasks/demo-T01.json", TASK);
    writeJson(".pi/taskflow/runs/demo-T01-r1.json", { id: "demo-T01-r1", taskId: "demo-T01" });
    mkdirSync(join(project, ".pi/taskflow/tasks"), { recursive: true });
    writeFileSync(join(project, ".pi/taskflow/tasks/broken.json"), "{ not json", "utf8");
    writeFileSync(join(project, ".pi/taskflow/tasks/notes.txt"), "ignored", "utf8");

    const records = readTaskflowRecords(project);
    expect(records.present).toBe(true);
    expect(records.root).toBe(taskflowRootOf(project));
    expect(records.features).toHaveLength(1);
    expect(records.tasks).toHaveLength(1);
    expect(records.runs).toHaveLength(1);
    // The malformed file is still there, byte-identical: absent, never repaired.
    expect(readFileSync(join(project, ".pi/taskflow/tasks/broken.json"), "utf8")).toBe("{ not json");
  });

  test("an absent canonical surface is reported, not created", () => {
    const records = readTaskflowRecords(project);
    expect(records.present).toBe(false);
    expect(records.features).toEqual([]);
    expect(records.tasks).toEqual([]);
    // 🔴 INV-2: reading must not create `.pi/`.
    expect(readdirSync(project)).toEqual([]);
  });

  test("reading mutates nothing (byte-level witness) and works on a read-only tree", () => {
    writeJson(".pi/taskflow/features/demo.json", { id: "demo", goal: "prove", taskIds: ["demo-T01"] });
    writeJson(".pi/taskflow/tasks/demo-T01.json", TASK);
    const before = snapshot(project);

    const first = readTaskflowRecords(project);
    const second = readTaskflowRecords(project);
    expect(second).toEqual(first);
    expect(snapshot(project)).toBe(before);

    // A writer would fail here: the whole tree is read-only for this process.
    const lockDown = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) lockDown(full);
        else chmodSync(full, 0o444);
      }
      chmodSync(dir, 0o555);
    };
    lockDown(project);
    const readOnly = readTaskflowRecords(project);
    expect(readOnly.tasks).toHaveLength(1);
    expect(snapshot(project)).toBe(before);
  });
});
