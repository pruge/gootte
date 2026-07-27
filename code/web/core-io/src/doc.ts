import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import { resolveInitiativeDir } from "./tree";

export type DocKind = "todo" | "sprint" | "roadmap";

export interface LoadedDoc {
  kind: DocKind;
  name: string;
  /** repo 기준 상대 경로 (archive·worktree 반영). */
  path: string;
  archived: boolean;
  /** worktree 트리에서 읽었으면 그 worktree slug (미커밋 라이브 버전). */
  worktree?: string;
  content: string;
}

/**
 * 관리대상 프로젝트의 특정 문서(todo/sprint)를 raw md 로 읽는다 — INV-2(read-only).
 * `worktree` 지정 시 그 worktree 트리(`.claude/worktrees/<wt>/docs/...`)를 **먼저** 읽는다 —
 * 활성 worktree 의 sprint doc 은 미커밋(개발 완료 시 기록한 `## 사용자 테스트` 포함)이라 main 엔 없기 때문.
 * 못 찾으면 main 트리로 fallback. name·worktree 는 basename 강제(경로 traversal 차단).
 */
export function readDoc(
  repoPath: string,
  kind: DocKind,
  name: string,
  worktree?: string,
): LoadedDoc | null {
  const safeName = basename(name).replace(/\.md$/, ""); // 방어 — 경로 분리자·확장자 제거
  if (!safeName || safeName.startsWith(".")) return null;

  const roots: { root: string; wt?: string }[] = [];
  if (worktree) {
    const wt = basename(worktree);
    if (wt && !wt.startsWith("."))
      roots.push({ root: join(repoPath, ".claude", "worktrees", wt), wt });
  }
  roots.push({ root: repoPath }); // main fallback

  for (const { root, wt } of roots) {
    for (const archived of [false, true] as const) {
      const file = join(root, "docs", kind, archived ? "archive" : "", `${safeName}.md`);
      if (existsSync(file)) {
        const relBase = wt ? join(".claude", "worktrees", wt) : "";
        return {
          kind,
          name: safeName,
          path: join(relBase, "docs", kind, archived ? "archive" : "", `${safeName}.md`),
          archived,
          worktree: wt,
          content: readFileSync(file, "utf8"),
        };
      }
    }
  }
  return null;
}

/**
 * 이니셔티브 폴더 기준 상대경로(`spec.md`·`adr/0001-x.md`)를 read — 문서 브라우저(2e) roadmap 소스.
 * 🔴 traversal 가드(source 분기 — todo/sprint basename 과 별개 모델): `resolve(dir, relPath)` 가 폴더 루트
 * 안이어야 하고(=`..`·절대경로·`.`선행 차단), realpath 도 루트 안이어야 함(심볼릭 링크 이탈 차단). md 만. INV-2.
 */
export function readRoadmapDoc(
  repoPath: string,
  initiative: string,
  relPath: string,
): LoadedDoc | null {
  const folderRel = resolveInitiativeDir(repoPath, initiative);
  if (!folderRel) return null;
  const dirResolved = resolve(repoPath, folderRel);
  const target = resolve(dirResolved, relPath);
  // 정규화 후 폴더 밖(절대·`..`·`.`선행) 차단
  if (target !== dirResolved && !target.startsWith(dirResolved + sep)) return null;
  if (!target.endsWith(".md") || !existsSync(target)) return null;
  // realpath — 심볼릭 링크로 루트 밖 이탈 차단
  let real: string;
  let realDir: string;
  try {
    real = realpathSync(target);
    realDir = realpathSync(dirResolved);
  } catch {
    return null;
  }
  if (real !== realDir && !real.startsWith(realDir + sep)) return null;

  const rel = relPath.replace(/^[/\\]+/, "");
  return {
    kind: "roadmap",
    name: rel,
    path: join(folderRel, rel),
    archived: false,
    content: readFileSync(real, "utf8"),
  };
}
