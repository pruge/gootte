import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { Feature, FeatureDocNode } from "@gootte/contract";
import { buildFeatures, parseFeatureSpec, parseTicket, type FeatureDocs } from "@gootte/core";

/**
 * firstmate 작업 표면 read — `docs/features/<기능>/{spec.md,issues/<NN>-*.md}` (F3).
 * IO 오케스트레이션만 한다: 읽어서 core 파서에 넘기고 core 계산(buildFeatures)에 태운다.
 * 해석 규칙은 여기 없다(계층 경계 — architecture.md §밟지 말 것).
 *
 * 🔴 read-only(INV-2). 파생물이라 매 호출 재계산한다(INV-1·INV-3 — 캐시·스냅샷 없음).
 */

function entries(p: string): string[] {
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
function read(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

/**
 * 기능 폴더 문서 트리 — 폴더에 **실제로 있는 것만**(INV-4, 티켓 01 §설계 3). 내용은 파싱하지
 * 않는다(listing 만) — `adr/` 안 문서를 구조로 만드는 일은 여전히 범위 밖(티켓 02 §하지 않는 것).
 * `issues/` 도 다른 폴더와 똑같이 실제 파일 목록으로 뜬다 — 티켓 본문을 원문 그대로 읽을 수 있어야
 * 한다(캡틴 피드백). 파싱된 제목·상태·처리중 요약은 화면이 따로 "check" 로 보여준다(`feature.tickets`).
 */
function buildDocTree(dir: string, relBase: string): FeatureDocNode[] {
  return entries(dir)
    .filter((name) => !name.startsWith("."))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const abs = join(dir, name);
      const path = relBase ? `${relBase}/${name}` : name;
      return isDir(abs)
        ? { kind: "dir" as const, name, path, children: buildDocTree(abs, path) }
        : { kind: "file" as const, name, path };
    });
}

/** 기능 폴더 하나를 읽는다. `adr/` 내용은 파싱하지 않는다(범위 밖 — 티켓 02 §하지 않는 것). */
function readFeatureDir(base: string, slug: string): FeatureDocs {
  const dir = join(base, slug);
  const specFile = join(dir, "spec.md");
  const specText = existsSync(specFile) ? read(specFile) : null;
  const issues = join(dir, "issues");
  const tickets = entries(issues)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .sort()
    .flatMap((f) => {
      const content = read(join(issues, f));
      return content === null ? [] : [parseTicket(f, content)];
    });
  return {
    slug,
    spec: specText === null ? null : parseFeatureSpec(slug, specText),
    tickets,
    tree: buildDocTree(dir, ""),
  };
}

export type FeatureDocRead = { ok: true; content: string } | { ok: false; reason: "outside" | "not-found" };

/**
 * 기능 폴더 안의 문서 본문 하나를 읽는다 — read-only(INV-2).
 * 🔴 요청 경로를 해소한 뒤 그 기능 폴더 **안**으로 들어오는지 판정하고, 벗어나면 거절한다
 * (경로 탈출 차단, 티켓 01 §설계 4). `base + sep` 접두 비교라 "foo-evil" 이 "foo" 의 접두
 * 문자열만 공유하는 형제 폴더로 새는 것도 막는다.
 */
export function readFeatureDoc(
  repoPath: string,
  featureSlug: string,
  relPath: string,
): FeatureDocRead {
  const base = resolve(join(repoPath, "docs", "features", featureSlug));
  const target = resolve(base, relPath);
  if (target !== base && !target.startsWith(base + sep)) return { ok: false, reason: "outside" };
  const content = read(target);
  return content === null ? { ok: false, reason: "not-found" } : { ok: true, content };
}

/**
 * 프로젝트 하나의 기능별 할일 목록. `docs/features/` 가 없으면 빈 목록(예외로 죽지 않는다).
 * 🔴 **정렬돼 있지 않다** — 화면 순서(무리 → 처리중 → 폴더명, 티켓 03)는 처리중이 얹힌 뒤에야
 * 정해진다. 정렬된 목록이 필요하면 `applyInProgress` 를 거친 결과를 쓴다.
 */
export function readFeatures(repoPath: string): Feature[] {
  const base = join(repoPath, "docs", "features");
  if (!isDir(base)) return [];
  const docs = entries(base)
    .filter((name) => isDir(join(base, name)))
    .map((name) => readFeatureDir(base, name));
  return buildFeatures(docs);
}
