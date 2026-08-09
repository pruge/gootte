import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WorkingCopy, WorkingCopyScan } from "@gootte/core";
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

/** 슬롯 안의 저장소 — 슬롯 자신이거나 그 바로 아래 한 칸. worktree 의 `.git` 은 파일이라 존재만 본다. */
function repoIn(slot: string): string | null {
  if (existsSync(join(slot, ".git"))) return slot;
  for (const name of children(slot)) {
    const dir = join(slot, name);
    if (isDir(dir) && existsSync(join(dir, ".git"))) return dir;
  }
  return null;
}

// 기준 가지 후보 — 이 중 첫 번째로 해소되는 것이 "작업 이전"의 지점이다.
const BASE_REFS = ["main", "master", "origin/main", "origin/master"];

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
 */
export function scanWorkingCopies(root: string, project: string): WorkingCopyScan {
  if (!isDir(root)) return { root, rootExists: false, copies: [] };

  const pool = poolPattern(project);
  const copies: WorkingCopy[] = [];
  for (const poolName of children(root)) {
    if (!pool.test(poolName) || !isDir(join(root, poolName))) continue;
    for (const slotName of children(join(root, poolName))) {
      const slot = join(root, poolName, slotName);
      if (!isDir(slot)) continue;
      const repo = repoIn(slot);
      if (!repo) continue;
      const branch = currentBranch(repo);
      copies.push({
        slug: `${poolName}/${slotName}`,
        path: repo,
        branch,
        touched: branch ? touchedOnBranch(repo) : [],
      });
    }
  }
  return { root, rootExists: true, copies };
}
