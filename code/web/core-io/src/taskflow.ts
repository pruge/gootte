import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * §13.9 — Taskflow canonical JSON **read-only** reader.
 *
 * Taskflow publishes its canonical state as Git-tracked JSON:
 *
 *   <project>/.pi/taskflow/
 *     features/<feature>.json     tasks/<task-id>.json
 *     runs/<run-id>.json          evidence/**  (receipts)
 *
 * gootte only READS that surface (INV-2): this module never writes, never
 * creates a directory, never repairs or normalizes a record on disk, and never
 * keeps a second ledger (INV-1 — the timeline is derived on every call). A
 * missing or malformed file is reported as absent, not fixed: repairing someone
 * else's canonical state is exactly what §13.9 forbids.
 */

export interface TaskflowRecords {
  /** Absolute project root the records were read from. */
  projectDir: string;
  /** The canonical directory that was probed. */
  root: string;
  /** True when `.pi/taskflow` exists and at least one record was read. */
  present: boolean;
  features: unknown[];
  tasks: unknown[];
  runs: unknown[];
}

/** `<project>/.pi/taskflow` — the canonical published surface, never a copy. */
export function taskflowRootOf(projectDir: string): string {
  return join(resolve(projectDir), ".pi", "taskflow");
}

function entries(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Every `*.json` in one canonical subdirectory, parsed; malformed files skipped. */
function readJsonDir(dir: string): unknown[] {
  const out: unknown[] = [];
  for (const name of entries(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, name), "utf8")));
    } catch {
      // A record that cannot be parsed is reported as absent, never rewritten.
      continue;
    }
  }
  return out;
}

/**
 * Read the canonical Taskflow records of one project.
 *
 * Deterministic and side-effect free (INV-4): sorted directory order, no
 * timestamps of its own, no caching (INV-3 — a stale view is a defect, so every
 * call re-reads the current SoT).
 */
export function readTaskflowRecords(projectDir: string): TaskflowRecords {
  const dir = resolve(projectDir);
  const root = taskflowRootOf(dir);
  const features = readJsonDir(join(root, "features"));
  const tasks = readJsonDir(join(root, "tasks"));
  const runs = readJsonDir(join(root, "runs"));
  return {
    projectDir: dir,
    root,
    present: features.length + tasks.length + runs.length > 0,
    features,
    tasks,
    runs,
  };
}
