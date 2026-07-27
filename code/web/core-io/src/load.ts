import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { GitSignal, TodoItem, Sprint, Supersession } from "@gootte/contract";
import {
  parseTodo,
  parseSprint,
  parseLedger,
  parseIndex,
  parseAdr,
  parseProfileTracks,
  parseBlueprint,
  buildState,
  type LedgerInfo,
  type AdrInfo,
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
function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
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
  const adrs: AdrInfo[] = [];
  for (const name of dir(roadmap)) {
    const initDir = join(roadmap, name);
    const ledgerFile = join(initDir, "ledger.md");
    if (existsSync(ledgerFile)) {
      const l = safe(() => parseLedger(name, readFileSync(ledgerFile, "utf8")));
      if (l) ledgers.push(l);
    }
    if (existsSync(join(initDir, "spec.md"))) specPresent.push(name);
    // ADR (+ _superseded/) 배선 (T4)
    for (const adrBase of [join(initDir, "adr"), join(initDir, "adr", "_superseded")]) {
      for (const { content } of readMd(adrBase)) {
        const a = safe(() => parseAdr(content));
        if (a?.id) adrs.push(a);
      }
    }
  }

  // blueprint fallback — ledger 없는 이니셔티브를 blueprint `## phases` 표에서 도출(dogfooding: gootte 자신).
  // roadmap 최상위 + 각 하위(epic)의 blueprint.md 스캔.
  const blueprintPhases = [roadmap, ...dir(roadmap).map((n) => join(roadmap, n)).filter(isDir)]
    .map((d) => join(d, "blueprint.md"))
    .filter((f) => existsSync(f))
    .flatMap((f) => safe(() => parseBlueprint(readFileSync(f, "utf8"))) ?? []);

  // ledger 우선 dedupe — 같은 slug 는 ledger 가 더 상세(blueprint 는 fallback).
  const ledgerSlugs = new Set(ledgers.map((l) => l.initiative));
  for (const p of blueprintPhases) {
    if (ledgerSlugs.has(p.slug)) continue;
    ledgers.push({
      initiative: p.slug,
      status: p.status,
      track: null,
      deps: [],
      events: [],
      supersedes: [],
    });
    ledgerSlugs.add(p.slug);
  }

  const indexFile = join(roadmap, "INDEX.md");
  const indexInfo = existsSync(indexFile)
    ? parseIndex(readFileSync(indexFile, "utf8"))
    : { order: [] as string[], initiatives: [], supersessions: [] as Supersession[] };

  // 순서 = INDEX 우선, 없으면 blueprint phase 순서(gootte 엔 INDEX.md 없음).
  const indexOrder =
    indexInfo.order.length > 0 ? indexInfo.order : blueprintPhases.map((p) => p.slug);

  // 대분류 어휘 — 관리대상 profile `## Tracks` (INV-2 read-only). 없으면 빈 맵(프로즈 fallback).
  const profileFile = join(repoPath, ".cling", "profile.md");
  const tracks = existsSync(profileFile)
    ? parseProfileTracks(readFileSync(profileFile, "utf8"))
    : new Map<string, string>();

  const worktrees = scanWorktrees(repoPath);
  const input: StateInput = {
    ledgers,
    todos,
    sprints,
    worktrees,
    specPresent,
    indexOrder,
    supersessions: indexInfo.supersessions,
    adrs,
    tracks,
  };
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
