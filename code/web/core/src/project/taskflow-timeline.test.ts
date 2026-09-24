import { describe, expect, test } from "vitest";
import { buildTaskflowTimeline } from "./taskflow-timeline";

/**
 * §13.9/§6 — the timeline is a PURE derivation of canonical records: no stored
 * copy, no invented Task, deterministic output.
 */

const TASK = {
  id: "demo-T01",
  feature: "demo",
  title: "one task",
  state: "done",
  version: 10,
  lifecycle: [
    { kind: "task.merged", at: "2026-09-24T00:10:00.000Z", actor: { role: "orch", id: "o1" } },
    { kind: "task.created", at: "2026-09-24T00:00:00.000Z", actor: { role: "captain", id: "c1" } },
    { kind: "task.question_asked", at: "2026-09-24T00:05:00.000Z", actor: { role: "worker", id: "w" } },
  ],
  review: { verdict: "approved", candidateCommit: "abc123" },
  verification: { passed: true, binding: "receipt", receiptId: "r-1", commit: "abc123" },
  discussions: [
    { id: "Q-1", status: "answered", blocking: true },
    { id: "Q-2", status: "escalated", blocking: true },
    { id: "Q-3", status: "escalated", blocking: false },
  ],
};

function timelineOf(tasks: unknown[]): ReturnType<typeof buildTaskflowTimeline> {
  return buildTaskflowTimeline({
    present: true,
    features: [{ id: "demo", goal: "prove", taskIds: ["demo-T01"] }],
    tasks,
    runs: [],
  });
}

describe("§13.9 taskflow timeline derivation", () => {
  test("orders the lifecycle by recorded time and computes durations and evidence", () => {
    const timeline = timelineOf([TASK]);
    const task = timeline.tasks[0]!;
    expect(task.events.map((e) => e.kind)).toEqual([
      "task.created",
      "task.question_asked",
      "task.merged",
    ]);
    expect(task.events[1]!.actor).toBe("worker:w");
    expect(task.durations.map((d) => d.ms)).toEqual([300_000, 300_000]);
    expect(task.evidence).toEqual({
      receiptId: "r-1",
      passed: true,
      binding: "receipt",
      candidateCommit: "abc123",
    });
    expect(task.reviewVerdict).toBe("approved");
    // Only BLOCKING and unanswered questions are open.
    expect(task.openQuestions).toBe(1);
    expect(timeline.totals).toMatchObject({
      tasks: 1,
      verified: 1,
      openQuestions: 1,
      elapsedMs: 600_000,
    });
    expect(timeline.totals.byState).toEqual({ done: 1 });
    expect(timeline.features).toEqual([{ id: "demo", goal: "prove", tasks: 1 }]);
  });

  test("the per-feature count is derived from the tasks read, not from an optional field", () => {
    const timeline = buildTaskflowTimeline({
      present: true,
      // A feature record WITHOUT `taskIds` must still report the real count.
      features: [{ id: "demo", goal: "prove" }],
      tasks: [TASK],
      runs: [],
    });
    expect(timeline.features).toEqual([{ id: "demo", goal: "prove", tasks: 1 }]);
  });

  test("is deterministic: the same records always produce the same view", () => {
    expect(timelineOf([TASK])).toEqual(timelineOf([TASK]));
  });

  test("never invents a Task: malformed or id-less records are skipped", () => {
    const timeline = timelineOf([null, "nope", { feature: "demo" }, TASK]);
    expect(timeline.tasks).toHaveLength(1);
    expect(timeline.tasks[0]!.id).toBe("demo-T01");
  });

  test("a Task without verification evidence reports null, not a guess", () => {
    const timeline = timelineOf([{ id: "x-T01", feature: "x", state: "working", version: 3 }]);
    const task = timeline.tasks[0]!;
    expect(task.evidence).toEqual({ receiptId: null, passed: null, binding: null, candidateCommit: null });
    expect(task.durations).toEqual([]);
    expect(task.openQuestions).toBe(0);
    expect(timeline.totals.verified).toBe(0);
  });
});
