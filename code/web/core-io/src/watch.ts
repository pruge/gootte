import { join, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { discoverProjects } from "./discover";

/** coarse 변경 신호(ADR-0004) — project = 그 프로젝트 재조회, projects = 목록 재조회. */
export type Change = { kind: "project"; project: string } | { kind: "projects" };

export interface ProjectWatcher {
  close(): Promise<void>;
}

/**
 * 🔴 **어느 감시도 절대 걷지 않는 것.** 무거워서가 아니라 걸면 안 되기 때문이라 `HEAVY` 와 다르다.
 * `.codegraph/` 는 머신 로컬 코드 색인(gitignore)이고 그 안에 유닉스 소켓 `daemon.sock` 이 산다 —
 * macOS 에서 소켓에 `fs.watch` 를 걸면 `UNKNOWN` 이고, 그것이 백엔드를 통째로 내렸다.
 * 관리대상 문서도 발견 표식도 여기엔 없으므로 감시할 이유 자체가 없다.
 */
const NEVER = new Set([".codegraph"]);

/** 무겁기만 한 것 — 목록 감시(얕은 walk)에서만 걷어낸다. */
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
const never = (p: string): boolean => p.split(sep).some((s) => NEVER.has(s));
const heavy = (p: string): boolean => p.split(sep).some((s) => HEAVY.has(s));

/**
 * 관리대상 프로젝트 문서/worktree 변경 감시 → coarse Change 콜백. INV-2(감시=read only, write 없음).
 * - 콘텐츠: 각 프로젝트 `docs/features` → {project}(경로→slug 매핑).
 * - 목록: roots 얕은(depth 3) 감시로 발견 표식 추가/삭제 → 재발견 → 집합 변하면 {projects} + 콘텐츠 감시 재동기.
 * 프로젝트/목록 단위로 debounce 뭉침(git 대량 touch 흡수).
 */
export function watchProjects(
  roots: string[],
  onChange: (c: Change) => void,
  opts: { debounceMs?: number; onError?: (label: string, err: unknown) => void } = {},
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

  /**
   * 감시할 값어치가 있는 것 = **화면에 실리는 것의 소스**뿐이고, 그건 `docs/features/` 하나다.
   * `docs` 전체가 아니다 — 제품이 읽는 경로가 이것뿐이라(`readFeatures`·`readFeatureDoc`)
   * 나머지 `docs/` 를 감시해봐야 다시 계산될 뷰가 없다.
   *
   * 🔴 `.git/worktrees` 와 `.claude/worktrees` 는 뺐다 — **아무도 읽지 않는다.**
   * 후자를 읽던 worktree 배지(`scanWorktrees`)는 cling 시절 경로였고 같이 삭제됐다.
   * 처리중 관측은 그쪽이 아니라 격리 사본 뿌리(`GOOTTE_TREEHOUSE`)가 준다(`scanWorkingCopies`).
   */
  const contentPaths = (ps: typeof projects): string[] =>
    ps.map((p) => join(p.path, "docs", "features"));

  const projectOf = (abs: string): string | null => {
    let best: { slug: string; len: number } | null = null;
    for (const p of projects) {
      if ((abs === p.path || abs.startsWith(p.path + sep)) && (!best || p.path.length > best.len)) {
        best = { slug: p.slug, len: p.path.length };
      }
    }
    return best?.slug ?? null;
  };

  /**
   * 🔴 감시 실패가 백엔드를 죽이지 않는다 — 그렇다고 조용히 삼키지도 않는다.
   * chokidar 는 `fs.watch` 실패를 `error` 이벤트로 올리는데, **듣는 사람이 없으면 EventEmitter 가
   * 그것을 uncaught 로 다시 던진다.** 그래서 경로 하나를 못 붙는 사소한 사건이 서버 전체를
   * 내렸다(실측: 관리대상 저장소 루트의 `.codegraph/daemon.sock` 을 watch 하려다 UNKNOWN).
   * 감시 하나가 못 붙는 것과 서버가 죽는 것은 전혀 다른 사건이므로 여기서 끊고, 무엇이 실패했는지
   * stderr 에 남긴다 — 삼키면 "감시가 도는 줄 알았는데 안 돌던" 조용한 stale 뷰가 된다(INV-3).
   */
  const onWatchError = (label: string) => (err: unknown): void => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[watch] ${label} 감시 실패(계속 진행): ${msg}\n`);
    // 감시 불가는 폴백 판단의 근거다(tauri-desktop-app T03) — 소비처가 폴러로 갈아타게 통보한다.
    opts.onError?.(label, err);
  };

  const content: FSWatcher = chokidar.watch(contentPaths(projects), {
    ignoreInitial: true,
    ignored: (p) => never(p) || hasSeg(p, "node_modules"),
    awaitWriteFinish: { stabilityThreshold: 80, pollInterval: 20 },
  });
  content.on("error", onWatchError("콘텐츠"));
  content.on("all", (_ev, abs) => {
    const slug = projectOf(abs);
    if (slug) fire({ kind: "project", project: slug });
  });

  // 목록 감시 — roots 얕게, 발견 표식(`AGENTS.md` · `docs/features/`) 이벤트만 재발견 트리거.
  // 표식은 discoverProjects(isFirstmateProject)와 같은 두 가지다 — 판정이 바뀌면 여기도 같이 바뀐다.
  const isDiscoveryMark = (abs: string): boolean => {
    const segs = abs.split(sep);
    if (segs[segs.length - 1] === "AGENTS.md") return true;
    const i = segs.lastIndexOf("docs");
    return i >= 0 && segs[i + 1] === "features";
  };
  /**
   * 목록 감시가 걸을 값어치가 있는 경로인가 — **발견 표식이 생기는 것을 볼 수 있는 최소 집합**.
   *
   * 표식은 `<프로젝트>/AGENTS.md` 와 `<프로젝트>/docs/features` 둘뿐이고(`isFirstmateProject`),
   * 프로젝트는 뿌리 아래 **최대 두 칸**에 있다(`discoverProjects`). 무엇이 *생기는* 것을 보려면
   * 그것 자신이 아니라 **부모 디렉토리**만 감시하면 되므로, 필요한 집합은 이게 전부다:
   *
   *   뿌리 · 뿌리/\* · 뿌리/\*\/\* · 그 아래로는 `docs/`(와 그 안의 `features`)뿐
   *
   * 🔴 그래서 **프로젝트 내부로는 한 칸도 들어가지 않는다.** 코드·산출물·색인은 목록과 무관한데
   * 예전에는 depth 3 을 통째로 걸어 감시 대상이 프로젝트 크기에 비례해 늘었다(실측: 두 프로젝트에
   * 디렉토리 76개). 그 walk 이 `.codegraph/daemon.sock` 을 끌어들여 백엔드를 죽인 경로이기도 하다.
   *
   * 뿌리 밖(어느 뿌리에도 안 걸리는 경로)은 **거르지 않는다** — 판정 못 한 것을 조용히 빼면
   * 감시가 도는 줄 알면서 안 도는 stale 뷰가 된다(INV-3). 모르면 더 보는 쪽으로 넘어간다.
   */
  const listWorthy = (abs: string): boolean => {
    for (const root of roots) {
      if (abs !== root && !abs.startsWith(root + sep)) continue;
      const segs = abs === root ? [] : abs.slice(root.length + 1).split(sep);
      if (segs.length <= 2) return true; // 뿌리 · 뿌리/* · 뿌리/*/* (프로젝트 후보와 그 컨테이너)
      if (segs.length === 3)
        // <컨테이너>/<프로젝트>/{AGENTS.md,docs} · <프로젝트>/docs/features
        // 🔴 `features` 자신을 통과시켜야 한다 — ignored 는 이벤트까지 막으므로, 걸러버리면
        // 그것이 *생겼다*는 표식 이벤트를 못 받는다. 통과시키되 그 아래로는 안 내려간다.
        return segs[2] === "AGENTS.md" || segs[2] === "docs" || (segs[1] === "docs" && segs[2] === "features");
      if (segs.length === 4) return segs[2] === "docs" && segs[3] === "features";
      return false;
    }
    return true;
  };

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
    ignored: (p) => never(p) || heavy(p) || !listWorthy(p),
  });
  rootsW.on("error", onWatchError("목록"));
  rootsW.on("all", (_ev, abs) => {
    if (!isDiscoveryMark(abs)) return;
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
