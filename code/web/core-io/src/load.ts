import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GitSignal, TodoItem, Sprint } from "@gootte/contract";
import {
  parseTodo,
  parseSprint,
  parseLedger,
  parseIndex,
  buildState,
  type LedgerInfo,
  type StateInput,
  type ProjectState,
} from "@gootte/core";
import { scanWorktrees, computeGitSignal } from "./git";

/** T8 wiring — IO 오케스트레이션. 파일 read + core-io git + 순수 core(parse/state) 조합. */
export interface LoadedProject {
  state: ProjectState;
  gitSignals: Map<string, GitSignal>;
}

function dir(p: string): string[] {
  try {
    return readdirSync(p);
  } catch {
    return [];
  }
}
function readMd(base: string): { slug: string; content: string }[] {
  return dir(base)
    .filter((f) => f.endsWith(".md"))
    .map((f) => ({ slug: f.replace(/\.md$/, ""), content: readFileSync(join(base, f), "utf8") }));
}
function safe<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}
function rev(repo: string, ref: string): string | null {
  try {
    return execFileSync("git", ["-C", repo, "rev-parse", ref], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export function loadProjectState(repoPath: string): LoadedProject {
  const docs = join(repoPath, "docs");
  const todoDir = join(docs, "todo");
  const sprintDir = join(docs, "sprint");
  const roadmap = join(docs, "roadmap");

  const todos: TodoItem[] = [...readMd(todoDir), ...readMd(join(todoDir, "archive"))]
    .map(({ slug, content }) => safe(() => parseTodo(slug, content)))
    .filter((t): t is TodoItem => t !== null);

  const sprints: Sprint[] = [...readMd(sprintDir), ...readMd(join(sprintDir, "archive"))]
    .map(({ slug, content }) => safe(() => parseSprint(slug, content)))
    .filter((s): s is Sprint => s !== null);

  const ledgers: LedgerInfo[] = [];
  const specPresent: string[] = [];
  for (const name of dir(roadmap)) {
    const initDir = join(roadmap, name);
    const ledgerFile = join(initDir, "ledger.md");
    if (existsSync(ledgerFile)) {
      const l = safe(() => parseLedger(name, readFileSync(ledgerFile, "utf8")));
      if (l) ledgers.push(l);
    }
    if (existsSync(join(initDir, "spec.md"))) specPresent.push(name);
  }

  const indexFile = join(roadmap, "INDEX.md");
  const indexOrder = existsSync(indexFile)
    ? parseIndex(readFileSync(indexFile, "utf8")).order
    : [];

  const worktrees = scanWorktrees(repoPath);
  const input: StateInput = { ledgers, todos, sprints, worktrees, specPresent, indexOrder };
  const state = buildState(input);

  // active worktree 있는 이니셔티브에만 GitSignal 조립 (state 매핑 사용)
  const gitSignals = new Map<string, GitSignal>();
  const mainTip = rev(repoPath, "main");
  if (mainTip) {
    for (const i of state.initiatives) {
      if (!i.worktree || !i.worktree.base) continue;
      const wtTip = rev(repoPath, i.worktree.branch);
      if (wtTip) gitSignals.set(i.slug, computeGitSignal(repoPath, i.worktree.base, mainTip, wtTip));
    }
  }

  return { state, gitSignals };
}
