import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

export type DocKind = "todo" | "sprint";

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
