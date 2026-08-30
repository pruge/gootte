import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
 * 격리 사본 뿌리 기본값. 덮어쓰기는 호출자 몫(backend `GOOTTE_TREEHOUSE`) —
 * 기계마다 다를 수 있어 경로를 여기 말고 어디에도 못 박지 않는다.
 */
export function defaultTreehouseRoot(): string {
  return join(homedir(), ".treehouse");
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
 * 이 가지의 커밋이 건드린 경로. 기준 가지를 못 찾으면 **빈 목록**이다 —
 * 전체 이력을 훑어 아무 티켓에나 갖다 붙이지 않는다. 못 잇는 것은 미상으로 남긴다(INV-4).
 */
function touchedOnBranch(repo: string): string[] {
  const base = BASE_REFS.find((ref) => revExists(repo, ref));
  return base ? commitTouchedFiles(repo, `${base}..HEAD`) : [];
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
 */
export function scanWorkingCopies(
  root: string,
  project: string,
  projectPaths: readonly string[] = [],
): CopyScan {
  const copies: ObservedCopy[] = [];
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
        const slug = `${poolName}/${slotName}`;

        // 🔴 아래 두 갈래는 **빠뜨리지 않고 못 읽었다고 센다.** 슬롯을 건너뛰면 사본 수에서도
        //    사라져, 진짜로 돌고 있는 작업이 아무 데도 안 남는다(유휴로 접는 것보다 더 조용하다).
        const repo = repoIn(slot);
        if (!repo) {
          copies.push({ slug, path: slot, state: "no-repo", branch: "", touched: [] });
          continue;
        }
        const branch = currentBranch(repo); // null = git 이 답하지 않음, "" = detached
        if (branch === null) {
          copies.push({ slug, path: repo, state: "git-failed", branch: "", touched: [] });
          continue;
        }

        copies.push({
          slug,
          path: repo,
          state: branch ? "working" : "idle",
          branch,
          touched: branch ? touchedOnBranch(repo) : [],
        });
      }
    }
  }

  // Claude Code worktree(`.claude/worktrees/<name>`) — 프로젝트 사본 경로마다 훑는다.
  // `.git` 은 worktree 에선 파일이므로 repoIn 이 그 자리를 그대로 준다(treehouse 와 같은 판정).
  for (const projectPath of projectPaths) {
    const wtRoot = join(projectPath, ".claude", "worktrees");
    if (!isDir(wtRoot)) continue;
    for (const name of children(wtRoot)) {
      const wt = join(wtRoot, name);
      if (!isDir(wt)) continue;
      const slug = `${project}/claude/${name}`;
      const repo = repoIn(wt);
      if (!repo) {
        copies.push({ slug, path: wt, state: "no-repo", branch: "", touched: [] });
        continue;
      }
      const branch = currentBranch(repo);
      if (branch === null) {
        copies.push({ slug, path: repo, state: "git-failed", branch: "", touched: [] });
        continue;
      }
      copies.push({
        slug,
        path: repo,
        state: branch ? "working" : "idle",
        branch,
        touched: branch ? touchedOnBranch(repo) : [],
      });
    }
  }

  return { root, rootExists: isDir(root), copies };
}
