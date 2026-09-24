/**
 * §13.9 / §6 — Taskflow timeline read model (PURE derivation).
 *
 * Input is the canonical JSON that `@gootte/core-io` read from
 * `<project>/.pi/taskflow/**`; output is what a user sees: per-task lifecycle
 * timeline, elapsed durations, Review/Verify evidence and open questions.
 *
 * INV-1/INV-4: nothing here is stored and nothing is inferred from file mtimes,
 * sizes or prose. Every field is computed from a canonical record field, so the
 * same records always produce the same view.
 */

export interface TaskflowTimelineEvent {
  kind: string;
  at: string;
  /** `role:id` when the record named an actor, else null. */
  actor: string | null;
}

export interface TaskflowDuration {
  from: string;
  to: string;
  ms: number;
}

export interface TaskflowEvidence {
  /** Verify receipt id when the Task carries a bound verification. */
  receiptId: string | null;
  passed: boolean | null;
  binding: string | null;
  candidateCommit: string | null;
}

export interface TaskflowTaskView {
  id: string;
  feature: string;
  title: string;
  state: string;
  version: number;
  events: TaskflowTimelineEvent[];
  durations: TaskflowDuration[];
  evidence: TaskflowEvidence;
  /** Blocking canonical questions that are not answered yet. */
  openQuestions: number;
  /** Review verdict when one was recorded. */
  reviewVerdict: string | null;
}

export interface TaskflowTimeline {
  present: boolean;
  features: { id: string; goal: string; tasks: number }[];
  tasks: TaskflowTaskView[];
  totals: {
    tasks: number;
    byState: Record<string, number>;
    verified: number;
    openQuestions: number;
    /** Wall-clock span covered by the recorded lifecycle, in ms. */
    elapsedMs: number;
  };
}

type Rec = Record<string, unknown>;

function obj(value: unknown): Rec | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Rec) : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Canonical lifecycle entries, ordered by their recorded timestamp. */
function eventsOf(task: Rec): TaskflowTimelineEvent[] {
  const raw = task["lifecycle"];
  if (!Array.isArray(raw)) return [];
  const out: TaskflowTimelineEvent[] = [];
  for (const entry of raw) {
    const rec = obj(entry);
    const kind = str(rec?.["kind"]);
    const at = str(rec?.["at"]);
    if (kind === null || at === null) continue;
    const actor = obj(rec?.["actor"]);
    const role = str(actor?.["role"]);
    const id = str(actor?.["id"]);
    out.push({ kind, at, actor: role === null ? null : `${role}:${id ?? "?"}` });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.kind.localeCompare(b.kind));
}

function durationsOf(events: TaskflowTimelineEvent[]): TaskflowDuration[] {
  const out: TaskflowDuration[] = [];
  for (let i = 1; i < events.length; i++) {
    const from = events[i - 1]!.at;
    const to = events[i]!.at;
    const ms = Date.parse(to) - Date.parse(from);
    if (Number.isFinite(ms) && ms >= 0) out.push({ from, to, ms });
  }
  return out;
}

function evidenceOf(task: Rec): TaskflowEvidence {
  const verification = obj(task["verification"]);
  return {
    receiptId: str(verification?.["receiptId"]),
    passed: typeof verification?.["passed"] === "boolean" ? (verification["passed"] as boolean) : null,
    binding: str(verification?.["binding"]),
    candidateCommit: str(verification?.["commit"]) ?? str(obj(task["review"])?.["candidateCommit"]),
  };
}

function openQuestionsOf(task: Rec): number {
  const discussions = task["discussions"];
  if (!Array.isArray(discussions)) return 0;
  let open = 0;
  for (const entry of discussions) {
    const rec = obj(entry);
    if (rec === null) continue;
    if (rec["blocking"] !== true) continue;
    if (str(rec["status"]) === "answered") continue;
    open++;
  }
  return open;
}

/**
 * Build the user-visible timeline. Unknown/malformed records are skipped rather
 * than guessed at — a view never invents a Task that the canonical state does
 * not contain.
 */
export function buildTaskflowTimeline(records: {
  present: boolean;
  features: unknown[];
  tasks: unknown[];
  runs: unknown[];
}): TaskflowTimeline {
  const rawFeatures = records.features
    .map(obj)
    .filter((rec): rec is Rec => rec !== null)
    .map((rec) => ({ id: str(rec["id"]) ?? "(unknown)", goal: str(rec["goal"]) ?? "" }));

  const tasks: TaskflowTaskView[] = [];
  for (const value of records.tasks) {
    const rec = obj(value);
    if (rec === null) continue;
    const id = str(rec["id"]);
    if (id === null) continue;
    const events = eventsOf(rec);
    tasks.push({
      id,
      feature: str(rec["feature"]) ?? "(unknown)",
      title: str(rec["title"]) ?? "",
      state: str(rec["state"]) ?? "(unknown)",
      version: num(rec["version"]) ?? 0,
      events,
      durations: durationsOf(events),
      evidence: evidenceOf(rec),
      openQuestions: openQuestionsOf(rec),
      reviewVerdict: str(obj(rec["review"])?.["verdict"]),
    });
  }
  tasks.sort((a, b) => a.id.localeCompare(b.id));

  // The per-feature task count is DERIVED from the tasks actually read, never
  // from an optional `taskIds` field a record may omit.
  const perFeature = new Map<string, number>();
  for (const task of tasks) perFeature.set(task.feature, (perFeature.get(task.feature) ?? 0) + 1);
  const features = rawFeatures
    .map((feature) => ({ ...feature, tasks: perFeature.get(feature.id) ?? 0 }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const byState: Record<string, number> = {};
  let verified = 0;
  let openQuestions = 0;
  let first: string | null = null;
  let last: string | null = null;
  for (const task of tasks) {
    byState[task.state] = (byState[task.state] ?? 0) + 1;
    if (task.evidence.passed === true) verified++;
    openQuestions += task.openQuestions;
    for (const event of task.events) {
      if (first === null || event.at < first) first = event.at;
      if (last === null || event.at > last) last = event.at;
    }
  }
  const elapsedMs = first !== null && last !== null ? Math.max(0, Date.parse(last) - Date.parse(first)) : 0;

  return {
    present: records.present,
    features,
    tasks,
    totals: { tasks: tasks.length, byState, verified, openQuestions, elapsedMs },
  };
}
