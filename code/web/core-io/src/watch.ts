import { join, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { discoverProjects } from "./discover";

/** coarse 변경 신호(ADR-0004) — project = 그 프로젝트 재조회, projects = 목록 재조회. */
export type Change = { kind: "project"; project: string } | { kind: "projects" };

export interface ProjectWatcher {
  close(): Promise<void>;
}

const HEAVY = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  ".cache",
  "target",
  ".venv",
  "vendor",
]);
const hasSeg = (p: string, seg: string): boolean => p.split(sep).includes(seg);
const heavy = (p: string): boolean => p.split(sep).some((s) => HEAVY.has(s));

/**
 * 관리대상 프로젝트 문서/worktree 변경 감시 → coarse Change 콜백. INV-2(감시=read only, write 없음).
 * - 콘텐츠: 각 프로젝트 `docs`·`.cling/profile.md`·`.git/worktrees`·`.claude/worktrees` → {project}(경로→slug 매핑).
 * - 목록: roots 얕은(depth 3) 감시로 `.cling` 추가/삭제 → 재발견 → 집합 변하면 {projects} + 콘텐츠 감시 재동기.
 * 프로젝트/목록 단위로 debounce 뭉침(git 대량 touch 흡수).
 */
export function watchProjects(
  roots: string[],
  onChange: (c: Change) => void,
  opts: { debounceMs?: number } = {},
): ProjectWatcher {
  const debounceMs = opts.debounceMs ?? 150;
  let projects = discoverProjects(roots);

  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const fire = (c: Change): void => {
    const key = c.kind === "project" ? `p:${c.project}` : "projects";
    const prev = pending.get(key);
    if (prev) clearTimeout(prev);
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        onChange(c);
      }, debounceMs),
    );
  };

  const contentPaths = (ps: typeof projects): string[] =>
    ps.flatMap((p) => [
      join(p.path, "docs"),
      join(p.path, ".cling", "profile.md"),
      join(p.path, ".git", "worktrees"),
      join(p.path, ".claude", "worktrees"),
    ]);

  const projectOf = (abs: string): string | null => {
    let best: { slug: string; len: number } | null = null;
    for (const p of projects) {
      if ((abs === p.path || abs.startsWith(p.path + sep)) && (!best || p.path.length > best.len)) {
        best = { slug: p.slug, len: p.path.length };
      }
    }
    return best?.slug ?? null;
  };

  const content: FSWatcher = chokidar.watch(contentPaths(projects), {
    ignoreInitial: true,
    ignored: (p) => hasSeg(p, "node_modules"),
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  });
  content.on("all", (_ev, abs) => {
    const slug = projectOf(abs);
    if (slug) fire({ kind: "project", project: slug });
  });

  // 목록 감시 — roots 얕게, `.cling` 관련 이벤트만 재발견 트리거.
  let rd: ReturnType<typeof setTimeout> | null = null;
  const rediscover = (): void => {
    const next = discoverProjects(roots);
    const before = new Set(projects.map((p) => p.path));
    const after = new Set(next.map((p) => p.path));
    const changed = before.size !== after.size || [...after].some((p) => !before.has(p));
    if (!changed) return;
    content.unwatch(contentPaths(projects));
    projects = next;
    content.add(contentPaths(projects));
    fire({ kind: "projects" });
  };
  const rootsW: FSWatcher = chokidar.watch(roots, {
    ignoreInitial: true,
    depth: 3,
    ignored: (p) => heavy(p),
  });
  rootsW.on("all", (_ev, abs) => {
    if (!hasSeg(abs, ".cling")) return;
    if (rd) clearTimeout(rd);
    rd = setTimeout(rediscover, debounceMs);
  });

  return {
    async close() {
      for (const t of pending.values()) clearTimeout(t);
      if (rd) clearTimeout(rd);
      await Promise.all([content.close(), rootsW.close()]);
    },
  };
}
