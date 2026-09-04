import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { CopyScan, ObservedCopy } from "@gootte/core";
import { commitTouchedFiles, currentBranch, revExists } from "./git";

/**
 * 격리 작업 사본 관측 — "지금 누가 무엇을 붙들고 있나"의 **입력**을 모은다.
 * 배치는 `<뿌리>/<프로젝트>-<6자리>/<슬롯>/<프로젝트>/` (F6).
 *
 * 여기는 날것만 모은다: 어떤 사본이 있고, 브랜치 위인지, 그 가지의 커밋이 어떤 경로를 건드렸는지.
 * **해석(어느 티켓인가)은 하지 않는다** — 그건 `core` 의 `applyInProgress` 다(계층 경계).
 *
 * 🔴 전부 읽기 전용(INV-2). 관리대상에도, 사본에도 아무것도 쓰지 않는다.
 */

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function children(dir: string): string[] {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

/**
 * 프로젝트 사본 경로들의 Claude Code worktree(`<프로젝트>/.claude/worktrees/<이름>`) 전부.
 * worktree 는 git worktree 라 `.git` 이 파일이고 저장소로 관측·문서로 읽을 수 있다.
 * 존재하지 않는 루트는 건너뛴다 — worktree 가 없으면 빈 목록.
 */
export function claudeWorktreeRoots(projectPaths: readonly string[]): string[] {
  const out: string[] = [];
  for (const projectPath of projectPaths) {
    const wtRoot = join(projectPath, ".claude", "worktrees");
    if (!isDir(wtRoot)) continue;
    for (const name of children(wtRoot)) {
      const wt = join(wtRoot, name);
      if (isDir(wt)) out.push(wt);
    }
  }
  return out;
}

/**
 * 격리 사본 뿌리 기본값. 덮어쓰기는 호출자 몫(backend `GOOTTE_TREEHOUSE`) —
 * 기계마다 다를 수 있어 경로를 여기 말고 어디에도 못 박지 않는다.
 */
export function defaultTreehouseRoot(): string {
  return join(homedir(), ".treehouse");
}

/**
 * BB 에이전트 worktree 뿌리 기본값 — `~/.bb/worktrees`. env `GOOTTE_BB_WORKTREES` 로 덮어쓴다
 * (`GOOTTE_ROOTS` 를 읽는 `effectiveProjectRoots` 와 같은 관례 — 기계마다 다를 수 있다).
 */
export function defaultBbWorktreeRoot(): string {
  return process.env.GOOTTE_BB_WORKTREES?.trim() || join(homedir(), ".bb", "worktrees");
}

/**
 * BB 에이전트가 스레드 작업용으로 만드는 worktree(`<뿌리>/<env_XXXX>/<프로젝트>/`) 전부.
 * treehouse(`<풀>/<슬롯>/<프로젝트>`)·Claude Code(`<프로젝트>/.claude/worktrees/<이름>`)와
 * **자리만 다르고 같은 git worktree** 다 — `.git` 이 파일이고 branch·커밋 이력이 있어 똑같이 관측된다.
 *
 * 프로젝트 이름은 사본 경로의 basename 으로 읽는다 — BB 는 환경 디렉토리 아래에 저장소 디렉토리명
 * 그대로 체크아웃한다(실측: `~/.bb/worktrees/env_n8franv9qv/jinwooauto`). 그래서 호출부는
 * `claudeWorktreeRoots` 와 **같은 인자**(사본 경로들)만 주면 된다.
 *
 * 존재하지 않는 뿌리는 건너뛴다 — BB 를 안 쓰는 기계에서는 빈 목록이다.
 */
export function bbWorktreeRoots(
  projectPaths: readonly string[],
  bbRoot: string = defaultBbWorktreeRoot(),
): string[] {
  if (!isDir(bbRoot)) return [];
  const names = new Set(projectPaths.map((p) => basename(p)));
  const out: string[] = [];
  for (const envName of children(bbRoot)) {
    const envDir = join(bbRoot, envName);
    if (!isDir(envDir)) continue;
    for (const name of names) {
      const wt = join(envDir, name);
      // 🔴 `.git` 존재까지 본다 — 환경 디렉토리 아래 같은 이름의 아무 폴더나 사본으로 세지 않는다.
      if (isDir(wt) && existsSync(join(wt, ".git")) && !out.includes(wt)) out.push(wt);
    }
  }
  return out;
}

/**
 * 사본 경로들에 딸린 **모든 worktree** — Claude Code(`.claude/worktrees/`) + BB(`~/.bb/worktrees/`).
 * 사본 목록을 만드는 자리(backend `withWorktrees`·스냅샷 기록)는 이 한 창구를 쓴다 — 새 종류가
 * 늘 때 호출부를 다시 훑지 않게.
 */
/**
 * 워크트리가 **생기는 것**을 보려면 슬롯 자신이 아니라 *그것을 담는 자리*를 봐야 한다.
 * Claude Code 는 사본마다 `<사본>/.claude/worktrees`, BB 는 뿌리 하나(`~/.bb/worktrees`).
 *
 * `slotDepth` = 컨테이너에서 **슬롯까지의 칸 수**다. 두 종류가 다르다:
 * Claude 는 `<컨테이너>/<이름>`(1칸), BB 는 `<뿌리>/<env_XXXX>/<프로젝트>`(2칸).
 * 🔴 두 규칙을 한 숫자로 뭉개지 말 것 — 자리 규칙의 SoT 는 이 파일이고, 감시하는 쪽은 이 값을 쓴다.
 *
 * 🔴 **존재 여부로 거르지 않는다** — 아직 없는 컨테이너가 나중에 생기는 것이 바로 감시가 잡아야 할
 * 사건이다(`~/.bb/worktrees` 는 첫 BB 스레드에 비로소 생긴다). 존재 판정은 감시를 거는 쪽이 한다.
 */
export interface WorktreeContainer {
  root: string;
  slotDepth: number;
}

export function worktreeContainerRoots(
  projectPaths: readonly string[],
  bbRoot: string = defaultBbWorktreeRoot(),
): WorktreeContainer[] {
  const out: WorktreeContainer[] = projectPaths.map((p) => ({
    root: join(p, ".claude", "worktrees"),
    slotDepth: 1,
  }));
  if (!out.some((c) => c.root === bbRoot)) out.push({ root: bbRoot, slotDepth: 2 });
  return out;
}

export function extraWorktreeRoots(
  projectPaths: readonly string[],
  bbRoot?: string,
): string[] {
  return [...claudeWorktreeRoots(projectPaths), ...bbWorktreeRoots(projectPaths, bbRoot)];
}

/** 풀 디렉토리 이름 = `<프로젝트>-<6자리 hex>` (F6). 정규식 메타문자를 가진 슬러그도 안전하게. */
function poolPattern(project: string): RegExp {
  return new RegExp(`^${project.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-[0-9a-f]{6}$`);
}

/**
 * 슬롯 안의 저장소 — 슬롯 자신이거나 그 바로 아래 한 칸(F6 의 배치). `.git` 은 worktree 에선 파일이라 존재만 본다.
 * 못 찾으면 null — **조용히 버리지 말고** 호출자가 "못 읽음" 으로 세어야 한다.
 */
function repoIn(slot: string): string | null {
  if (existsSync(join(slot, ".git"))) return slot;
  for (const name of children(slot)) {
    const dir = join(slot, name);
    if (isDir(dir) && existsSync(join(dir, ".git"))) return dir;
  }
  return null;
}

// 기준 가지 후보 — 이 중 첫 번째로 해소되는 것이 "작업 이전"의 지점이다.
// remote 를 먼저 본다 — "올라갔다"는 remote 가 정하는 사실이다(사양 §설계 2).
// remote 가 없는 저장소는 로컬로 떨어진다. fetch 는 하지 않는다(INV-2) — origin 이 뒤처진 경우는
// 알고 남기는 구멍이다.
const BASE_REFS = ["origin/main", "origin/master", "main", "master"];

/**
 * 이 가지의 커밋이 건드린 경로 + **커밋 안 된 working tree 변경**(`gootte start`/`end` 는
 * 커밋하지 않으므로, Time 기록 직후부터 그 작업이 "누가 무엇을 붙들고 있나"에 잡혀야 한다).
 * 기준 가지를 못 찾으면 **빈 목록**이다 — 전체 이력을 훑어 아무 티켓에나 갖다 붙이지 않는다.
 * 못 잇는 것은 미상으로 남긴다(INV-4).
 */
function touchedOnBranch(repo: string): string[] {
  const base = BASE_REFS.find((ref) => revExists(repo, ref));
  const committed: string[] = base ? commitTouchedFiles(repo, `${base}..HEAD`) : [];
  // 🔴 커밋 안 된(working tree) 변경도 포함한다 — `gootte start`(커밋 없음, 파일만 편집)로
  // Time 을 기록한 직후부터 그 티켓을 처리중으로 잡아야 한다. 기준 가지가 없어 committed 가
  // 빈 목록이더라도 uncommitted 변경은 그대로 실린다.
  let uncommitted: string[] = [];
  try {
    // 🔴 전체를 trim 하지 않는다 — porcelain 첫 줄(" M path")의 선두 공백이 상태 코드 칸이라
    // trim 이 그 칸을 먹으면 경로 파싱이 한 칸 밀린다(실측 결함, git.ts `gitSafeRaw` 와 같은 이유).
    const out = execFileSync("git", ["-C", repo, "status", "--porcelain", "--untracked-files=all"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).replace(/\n+$/, "");
    if (out) {
      uncommitted = out.split("\n")
        .filter((l) => !l.startsWith("??")) // 🔴 untracked(??) 는 세지 않는다 — 새 파일 존재는 "지금 붙들고
        // 있음"의 증거가 아니다(실제 결함 2026-09-01: 커밋 안 된 T03.md 가 처리중으로 오판됐다).
        // `gootte start/end` 는 **tracked** 티켓 파일의 Time 줄을 수정하므로(` M`) 그 변경은 그대로 잡힌다.
        // untracked 티켓의 처리중 여부는 Time 줄(started=)이 정한다 — git 상태가 아니라 문서가 SoT(INV-1).
        .map((l) => {
          const p = l.includes(" -> ") ? l.split(" -> ").pop()!.trim() : l.slice(3).trim();
          return p;
        })
        .filter(Boolean);
    }
  } catch {
    // git 이 답하지 않으면 uncommitted 변경 없음으로 간주한다
  }
  return [...new Set([...committed, ...uncommitted])];
}

/**
 * 한 프로젝트의 격리 사본 전부를 관측한다.
 * 뿌리가 없으면 **빈 결과**를 돌려준다 — 예외로 죽지 않는다(사본을 안 쓰는 기계도 있다).
 *
 * 🔴 treehouse 뿌리 외에, **프로젝트 안의 Claude Code worktree**(`<프로젝트>/.claude/worktrees/*`,
 * 캡틴 지시 2026-08-30)도 사본으로 관측한다 — `projectPaths` 로 각 프로젝트 사본 경로를 받아
 * 그 아래 `.claude/worktrees/` 를 훑는다. Claude Code 가 만드는 worktree 는 git worktree 라
 * `.git` 이 파일이고, branch·커밋 이력이 있어 treehouse 사본과 똑같이 관측할 수 있다.
 * 그 슬러그는 `<프로젝트>/claude/<워크트리명>` — treehouse(`<풀>/<슬롯>`)와 겹치지 않게.
 *
 * 🔴 **BB 에이전트 worktree**(`~/.bb/worktrees/<env>/<프로젝트>`, 캡틴 지시 2026-09-04)도 같은
 * 규칙으로 관측한다 — BB 스레드로 작업하면 여기 트리가 생기므로, 안 보면 그 작업이 "지금 누가
 * 무엇을 붙들고 있나"에서 통째로 빠진다. 슬러그는 `<프로젝트>/bb/<env>`. 뿌리는 `bbRoot`
 * 인자(없으면 `defaultBbWorktreeRoot()` = env `GOOTTE_BB_WORKTREES` 또는 `~/.bb/worktrees`).
 */
export function scanWorkingCopies(
  root: string,
  project: string,
  projectPaths: readonly string[] = [],
  bbRoot?: string,
): CopyScan {
  const copies: ObservedCopy[] = [];

  /**
   * 사본 하나를 같은 규칙으로 센다 — treehouse 슬롯도, Claude Code·BB worktree 도 여기를 지난다.
   * 🔴 못 읽은 갈래를 **건너뛰지 않고 그대로 싣는다**(위 주석의 규율).
   */
  const observe = (slug: string, dir: string): void => {
    const repo = repoIn(dir);
    if (!repo) {
      copies.push({ slug, path: dir, state: "no-repo", branch: "", touched: [] });
      return;
    }
    const branch = currentBranch(repo); // null = git 이 답하지 않음, "" = detached
    if (branch === null) {
      copies.push({ slug, path: repo, state: "git-failed", branch: "", touched: [] });
      return;
    }
    copies.push({
      slug,
      path: repo,
      state: branch ? "working" : "idle",
      branch,
      touched: branch ? touchedOnBranch(repo) : [],
    });
  };
  if (!isDir(root)) {
    // treehouse 가 없어도 프로젝트 안 Claude Code worktree 는 관측할 수 있다(그래도 빈 결과가
    // 아니다 — rootExists 만 거짓). 이 작업 사본이 실제로 돌고 있으면 사라지면 안 된다(INV-4).
  } else {
    const pool = poolPattern(project);
    for (const poolName of children(root)) {
      if (!pool.test(poolName) || !isDir(join(root, poolName))) continue;
      for (const slotName of children(join(root, poolName))) {
        const slot = join(root, poolName, slotName);
        if (!isDir(slot)) continue;
        // 🔴 못 읽은 갈래는 **빠뜨리지 않고 못 읽었다고 센다**(observe 안). 슬롯을 건너뛰면 사본
        //    수에서도 사라져, 진짜로 돌고 있는 작업이 아무 데도 안 남는다(유휴로 접는 것보다 더 조용하다).
        observe(`${poolName}/${slotName}`, slot);
      }
    }
  }

  // Claude Code worktree(`.claude/worktrees/<name>`) — 프로젝트 사본 경로마다 훑는다.
  // `.git` 은 worktree 에선 파일이므로 repoIn 이 그 자리를 그대로 준다(treehouse 와 같은 판정).
  for (const wt of claudeWorktreeRoots(projectPaths)) {
    observe(`${project}/claude/${basename(wt)}`, wt);
  }

  // BB 에이전트 worktree(`~/.bb/worktrees/<env>/<프로젝트>`) — 스레드로 작업할 때 여기 트리가 생긴다.
  // 슬러그는 `<프로젝트>/bb/<env>` — treehouse(`<풀>/<슬롯>`)·claude(`<프로젝트>/claude/<이름>`)와
  // 겹치지 않는 식별자여야 차단 목록에서 헷갈리지 않는다.
  for (const wt of bbWorktreeRoots(projectPaths, bbRoot)) {
    observe(`${project}/bb/${basename(dirname(wt))}`, wt);
  }

  return { root, rootExists: isDir(root), copies };
}
