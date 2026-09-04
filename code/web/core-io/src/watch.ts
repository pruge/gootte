import { homedir } from "node:os";
import { dirname, join, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { existsSync, readFileSync, statSync } from "node:fs";

const HOME = homedir();

const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};
import { discoverProjects } from "./discover";
import { extraWorktreeRoots, worktreeContainerRoots, type WorktreeContainer } from "./treehouse";

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
  // 🔴 같은 slug 의 사본이 여럿일 수 있다(T01). 대표 경로(`path`)뿐 아니라 **모든 사본**의
  // `docs/features` 를 감시한다 — 그래야 어느 사본의 문서가 바뀌어도 재조회가 나가고, 바뀐
  // 경로는 `projectOf` 가 같은 slug 로 접는다. 사본 하나만 보면 나머지 사본 변경이 조용히
  // 빠져 stale 뷰가 된다(INV-3).
  /**
   * 한 프로젝트가 실제로 문서를 갖는 자리 전부 — discover 사본 + **worktree**(read-path-redesign/T05).
   * 🔴 예전에는 discover 사본만 봤다. 그래서 worktree 안에서 새로 만든 **커밋 안 된 티켓**은
   * 어느 경로로도 안 잡혔다 — 감시는 그 폴더를 안 보고, 스탬프 비교는 untracked 를 일부러 뺐다
   * (캡틴 확인 2026-09-04). 읽기(`readFeatures`)는 이미 worktree 를 합집합으로 읽고 있었으므로,
   * 감시만 같은 목록을 보게 맞춘다.
   */
  const copyPathsOf = (p: { copies: string[] }): string[] => [...p.copies, ...extraWorktreeRoots(p.copies)];

  const contentPathsOf = (p: { copies: string[] }): string[] =>
    copyPathsOf(p).map((c) => join(c, "docs", "features"));

  const contentPaths = (ps: typeof projects): string[] => ps.flatMap(contentPathsOf);

  /**
   * 커밋을 보는 자리(축 2, T05) — 사본마다 `HEAD` 와 `refs/`.
   * 🔴 왜 필요한가: T01 이 미착지 표식을 버린 뒤에도 **커밋이 화면을 바꾸는 경로가 하나 남았다 —
   * 갈라짐(`conflict`)** 이다. `resolveFile` 이 HEAD 조상 관계로 나중 판을 고르기 때문이다(T06 조사).
   * 이 감시가 있어야 15초 주기 재검증기를 안전망으로 내릴 수 있다.
   * worktree 는 `.git` 이 **파일**이고 그 안에 실제 gitdir 경로가 적혀 있다 — 그것을 따라간다.
   */
  const gitRefPathsOf = (p: { copies: string[] }): string[] => {
    const out: string[] = [];
    {
      for (const c of copyPathsOf(p)) {
        const dotGit = join(c, ".git");
        let gitDir: string | null = null;
        try {
          if (!existsSync(dotGit)) continue;
          if (statSync(dotGit).isDirectory()) gitDir = dotGit;
          else {
            // worktree: "gitdir: /절대/경로" 한 줄.
            const m = /^gitdir:\s*(.+)$/m.exec(readFileSync(dotGit, "utf8"));
            gitDir = m?.[1]?.trim() ?? null;
          }
        } catch {
          gitDir = null;
        }
        if (!gitDir) continue;
        out.push(join(gitDir, "HEAD"), join(gitDir, "refs"));
      }
    }
    return out;
  };

  const gitRefPaths = (ps: typeof projects): string[] => ps.flatMap(gitRefPathsOf);

  const projectOf = (abs: string): string | null => {
    let best: { slug: string; len: number } | null = null;
    // worktree 안의 경로도 그 프로젝트로 접혀야 한다(T05) — 후보에 worktree 를 함께 놓는다.
    // 🔴 같은 slug 의 사본이 여럿일 수 있다(T01). 대표 경로(`path`)뿐 아니라 **모든 사본**을
    // 후보로 놓고 최장 접두로 고른다 — 그래서 어느 사본 안의 경로를 주어도 같은 slug 로 접힌다.
    for (const p of projects) {
      for (const copyPath of copyPathsOf(p)) {
        if (
          (abs === copyPath || abs.startsWith(copyPath + sep)) &&
          (!best || copyPath.length > best.len)
        ) {
          best = { slug: p.slug, len: copyPath.length };
        }
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

  /**
   * 축 2 — 커밋 감시(T05). `HEAD`·`refs/` 가 바뀌면 그 프로젝트를 다시 읽는다.
   * 🔴 `.git` 은 다른 감시에서 `HEAVY` 로 걷어내지만 여기서는 **정확히 두 경로만** 콕 집어 건다 —
   * `.git` 전체를 거는 것과 다르다(그건 무겁고, 소켓 같은 것을 끌어들여 백엔드를 죽인 전례가 있다).
   */
  /**
   * 지금 걸려 있는 사본 감시 경로 — **프로젝트별로** 들고 있다.
   * 🔴 슬러그별로 갖는 이유: 프로젝트가 목록에서 빠지면 그 경로를 풀어 줘야 하는데, 평평한
   * 배열만 들고 있으면 "누구 것이었는지" 를 잃어 죽은 경로를 계속 붙들게 된다.
   */
  let curContent = new Map<string, string[]>(projects.map((p) => [p.slug, contentPathsOf(p)]));
  let curGit = new Map<string, string[]>(projects.map((p) => [p.slug, gitRefPathsOf(p)]));

  const gitW: FSWatcher = chokidar.watch(gitRefPaths(projects), {
    ignoreInitial: true,
    ignored: (p) => never(p),
  });
  gitW.on("error", onWatchError("커밋"));
  gitW.on("all", (_ev, abs) => {
    // 어느 사본의 gitdir 인지는 경로로 못 접는다(worktree 의 gitdir 은 저장소 밖에 있을 수 있다).
    // 커밋은 드문 사건이라 **프로젝트 전부**를 다시 보게 하는 것으로 충분하다 — 실제 재계산은
    // T04 의 폴더 지문이 가른다(안 바뀐 폴더는 다시 안 읽힌다).
    void abs;
    for (const p of projects) fire({ kind: "project", project: p.slug });
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

  /**
   * 축 3 — **워크트리가 생기는 것**을 본다(a-new-worktree-is-seen-at-once/T01).
   *
   * 🔴 왜 필요한가: 감시 경로(`contentPaths`·`gitRefPaths`)는 **묶는 시점에 한 번** 계산된다.
   * 그 뒤에 생긴 워크트리는 어느 그물에도 안 걸렸다 — BB(`~/.bb/worktrees/…`)는 뿌리 **밖**이고,
   * Claude(`<프로젝트>/.claude/worktrees/…`)는 `listWorthy` 가 막는다. 그래서 그 안의
   * `gootte start` 가 push 를 못 냈고, 캡틴이 **창을 떠났다 와야만** 보였다(확인 2026-09-04).
   * 읽기(`readFeatures`)는 이미 워크트리를 합집합으로 본다 — **틀린 것은 신호뿐이었다.**
   *
   * 컨테이너만 얕게 본다. 슬롯 안의 문서는 재바인딩된 축 1 이 본다.
   */
  let containers: WorktreeContainer[] = worktreeContainerRoots(projects.flatMap((p) => p.copies));

  /**
   * 컨테이너를 향하는 사슬과 슬롯 한 칸 아래까지만 통과시킨다.
   * 🔴 슬롯 **한 칸 아래**를 봐야 하는 이유: 슬롯을 세는 판정(`bbWorktreeRoots`)이 `.git` 존재를
   * 요구한다. 디렉토리만 생긴 순간에 재바인딩하면 아직 `.git` 이 없어 헛일이 되므로,
   * `.git` 이 쓰이는 것도 사건으로 받아야 한다.
   * 컨테이너가 아직 없으면 부모를 거는데(아래 `containerTargets`), 그때도 이 술어가
   * **컨테이너로 가는 사슬만** 남기므로 옆 디렉토리로 새지 않는다.
   */
  const wtWorthy = (abs: string): boolean => {
    for (const c of containers) {
      if (abs === c.root) return true;
      if (c.root.startsWith(abs + sep)) return true; // 아직 없는 컨테이너로 가는 조상
      if (abs.startsWith(c.root + sep)) {
        const rel = abs.slice(c.root.length + 1).split(sep);
        if (rel.length <= c.slotDepth + 1) return true;
      }
    }
    return false;
  };

  /**
   * 실제로 chokidar 에 거는 경로 — 컨테이너가 있으면 그것, 없으면 **부모**(그래야 컨테이너가
   * 생기는 것을 본다). 부모도 없으면 건다고 될 일이 아니라 건너뛴다 — 그 경우는 재시작이나
   * 다음 재발견 때 잡힌다. 🔴 조용히 빼는 것이 아니라 **잡을 수 없다는 사실**이 여기 적혀 있다.
   */
  const containerTargets = (): string[] => {
    const out: string[] = [];
    for (const c of containers) {
      // 컨테이너부터 위로 **두 칸까지** 훑어 처음 존재하는 자리를 건다.
      // 두 칸인 이유: Claude 는 `<사본>/.claude/worktrees` 라 사본 자신까지가 딱 두 칸이고,
      // 사본은 언제나 존재한다. 🔴 그보다 위로 올라가지 않는다 — `~/.bb/worktrees` 가 없을 때
      // 홈 디렉토리를 통째로 거는 일이 벌어지면 안 된다(BB 를 안 쓰는 기계).
      let target: string | null = null;
      let cur = c.root;
      for (let i = 0; i <= 2; i++) {
        if (isDir(cur) && cur !== HOME && dirname(cur) !== cur) {
          target = cur;
          break;
        }
        const up = dirname(cur);
        if (up === cur) break;
        cur = up;
      }
      // 못 찾으면 건너뛴다 — 그 워크트리 종류는 **이번 실행에서는 못 잡는다.**
      // (예: BB 를 아직 한 번도 안 쓴 기계에는 `~/.bb` 조차 없다.) 재시작이나 재발견 때 잡힌다.
      if (target && !out.includes(target)) out.push(target);
    }
    return out;
  };

  /**
   * 사본 목록이 바뀌었으면 **차분만** 다시 묶는다.
   * 🔴 `rediscover` 와 다른 축이다 — 저쪽은 *프로젝트 목록*, 이쪽은 *한 프로젝트의 사본 목록*.
   * 같은 함수에 얹으면 저쪽의 조기 반환(`if (!changed) return`)이 이쪽까지 막는다.
   * 실제로 그것이 이 버그였다: 워크트리가 늘어도 프로젝트 목록은 그대로라 재바인딩까지 못 갔다.
   */
  const rebindCopies = (): void => {
    const live = new Set(projects.map((p) => p.slug));
    for (const [slug, paths] of curContent)
      if (!live.has(slug) && paths.length) content.unwatch(paths);
    for (const [slug, paths] of curGit) if (!live.has(slug) && paths.length) gitW.unwatch(paths);

    const nextContent = new Map<string, string[]>();
    const nextGit = new Map<string, string[]>();
    for (const p of projects) {
      const oc = curContent.get(p.slug) ?? [];
      const nc = contentPathsOf(p);
      const og = curGit.get(p.slug) ?? [];
      const ng = gitRefPathsOf(p);
      const addC = nc.filter((x) => !oc.includes(x));
      const rmC = oc.filter((x) => !nc.includes(x));
      const addG = ng.filter((x) => !og.includes(x));
      const rmG = og.filter((x) => !ng.includes(x));
      if (rmC.length) content.unwatch(rmC);
      if (addC.length) content.add(addC);
      if (rmG.length) gitW.unwatch(rmG);
      if (addG.length) gitW.add(addG);
      // 새 사본은 **생기자마자 문서를 갖고 있을 수 있다**(워크트리는 체크아웃된 채 태어난다).
      // 그래서 감시를 붙이는 것만으로는 부족하고 한 번 다시 읽게 해야 한다(INV-3).
      if (addC.length || rmC.length || addG.length || rmG.length)
        fire({ kind: "project", project: p.slug });
      nextContent.set(p.slug, nc);
      nextGit.set(p.slug, ng);
    }
    curContent = nextContent;
    curGit = nextGit;
  };

  let curWtTargets: string[] = containerTargets();
  const wtW: FSWatcher = chokidar.watch(curWtTargets, {
    ignoreInitial: true,
    depth: 4, // 부모 폴백(+1) 까지 감당하는 상한. 실제 가지치기는 `wtWorthy` 가 한다.
    ignored: (p) => never(p) || hasSeg(p, "node_modules") || !wtWorthy(p),
  });
  wtW.on("error", onWatchError("워크트리"));
  let wtd: ReturnType<typeof setTimeout> | null = null;
  wtW.on("all", () => {
    if (wtd) clearTimeout(wtd);
    wtd = setTimeout(rebindCopies, debounceMs);
  });

  /** 프로젝트 목록이 바뀌면 컨테이너 목록도 따라 바뀐다(새 프로젝트의 `.claude/worktrees`). */
  const rebindContainers = (): void => {
    containers = worktreeContainerRoots(projects.flatMap((p) => p.copies));
    const next = containerTargets();
    const add = next.filter((x) => !curWtTargets.includes(x));
    const rm = curWtTargets.filter((x) => !next.includes(x));
    if (rm.length) wtW.unwatch(rm);
    if (add.length) wtW.add(add);
    curWtTargets = next;
  };

  let rd: ReturnType<typeof setTimeout> | null = null;
  const rediscover = (): void => {
    const next = discoverProjects(roots);
    const before = new Set(projects.map((p) => p.path));
    const after = new Set(next.map((p) => p.path));
    const changed = before.size !== after.size || [...after].some((p) => !before.has(p));
    if (!changed) return;
    projects = next;
    // 🔴 사본 감시는 여기서 손으로 다시 걸지 않는다 — 차분 재바인딩 한 곳(`rebindCopies`)이
    // 갖는다. 두 곳에서 걸면 사라진 프로젝트의 경로가 남는 쪽이 생긴다.
    rebindCopies();
    rebindContainers();
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
      if (wtd) clearTimeout(wtd);
      await Promise.all([content.close(), rootsW.close(), gitW.close(), wtW.close()]);
    },
  };
}
