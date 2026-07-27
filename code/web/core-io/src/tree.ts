import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { RoadmapItem, TreeNode } from "@gootte/contract";

/** 하위 디렉토리명(정렬) — 결정적(INV-4). */
function subdirs(p: string): string[] {
  try {
    return readdirSync(p)
      .filter((n) => {
        try {
          return statSync(join(p, n)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort();
  } catch {
    return [];
  }
}

const hasInitiativeDoc = (d: string): boolean =>
  existsSync(join(d, "spec.md")) || existsSync(join(d, "brief.md"));

/**
 * initiative slug → repo 기준 폴더경로 (`docs/roadmap/<epic>/<init>` 또는 `docs/roadmap/<init>`).
 * gootte 는 2-level(blueprint) 레이아웃이라 state 엔 slug 만 온다 — 이 resolver 가 유일 소유자(ADR-0004 §0).
 * depth ≤2 스캔, basename===init + spec/brief 보유. 결정적 첫 매치. 없으면 null.
 */
export function resolveInitiativeDir(repoPath: string, initiative: string): string | null {
  const init = basename(initiative); // 방어 — 경로 분리자 차단
  if (!init || init.startsWith(".")) return null;
  const roadmapRel = join("docs", "roadmap");
  const roadmap = join(repoPath, roadmapRel);

  // depth 1 — docs/roadmap/<init>/ (ledger 스타일)
  if (subdirs(roadmap).includes(init) && hasInitiativeDoc(join(roadmap, init))) {
    return join(roadmapRel, init);
  }
  // depth 2 — docs/roadmap/<epic>/<init>/ (blueprint 스타일) · epic 정렬 순 첫 매치
  for (const epic of subdirs(roadmap)) {
    if (subdirs(join(roadmap, epic)).includes(init) && hasInitiativeDoc(join(roadmap, epic, init))) {
      return join(roadmapRel, epic, init);
    }
  }
  return null;
}

const MAX_DEPTH = 4; // 이니셔티브 폴더는 얕음(루트 + adr/ + _superseded/). 런어웨이 방지.

/** 실제 파일 트리(폴더 파일 + 서브폴더) 재귀 열거 → TreeNode(정렬 결정적). */
function walk(root: string, rel: string, initiative: string, depth: number, out: TreeNode[]): void {
  if (depth > MAX_DEPTH) return;
  let entries: string[];
  try {
    entries = readdirSync(root).sort();
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(root, name);
    const childRel = rel ? `${rel}/${name}` : name;
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      continue;
    }
    if (isDir) {
      out.push({ name, type: "dir", path: childRel, badge: null });
      walk(full, childRel, initiative, depth + 1, out);
    } else if (name.endsWith(".md")) {
      out.push({
        name,
        type: "file",
        path: childRel,
        read: { source: "roadmap", initiative, relPath: childRel },
        badge: null,
      });
    }
  }
}

/**
 * 이니셔티브 폴더 실제 파일 + `adr/` + 가상 `todo/`(roadmapItem 재사용) → flat TreeNode[].
 * 가상 todo/ = buildRoadmap 의 RoadmapItem.done/pending(archive 포함) 파생 — effInitiative 재구현 X(INV-1).
 * 폴더 못 찾으면 [] (엔드포인트가 404).
 */
export function listInitiativeTree(
  repoPath: string,
  initiative: string,
  roadmapItem: Pick<RoadmapItem, "done" | "pending"> | null,
): TreeNode[] {
  const nodes: TreeNode[] = [];
  // 폴더 있으면 실제 파일 트리(없으면 blueprint stub — 가상 todo/ 만).
  const folderRel = resolveInitiativeDir(repoPath, initiative);
  if (folderRel) walk(join(repoPath, folderRel), "", initiative, 0, nodes);

  // 가상 todo/ — pending(진행) 먼저 → done(완료), 각 slug 정렬. read = 기존 todo basename.
  const mk = (slug: string, badge: string): TreeNode => ({
    name: `${slug}.md`,
    type: "file",
    path: `todo/${slug}`,
    read: { source: "todo", name: slug },
    badge,
  });
  const todo: TreeNode[] = [{ name: "todo", type: "dir", path: "todo", badge: null }];
  for (const slug of [...(roadmapItem?.pending ?? [])].sort()) todo.push(mk(slug, "진행"));
  for (const slug of [...(roadmapItem?.done ?? [])].sort()) todo.push(mk(slug, "완료"));

  return [...nodes, ...todo];
}
