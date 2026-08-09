import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Feature } from "@gootte/contract";
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

/** 기능 폴더 하나를 읽는다. `adr/` 는 읽지 않는다(범위 밖 — 티켓 02 §하지 않는 것). */
function readFeatureDir(base: string, slug: string): FeatureDocs {
  const specFile = join(base, slug, "spec.md");
  const specText = existsSync(specFile) ? read(specFile) : null;
  const issues = join(base, slug, "issues");
  const tickets = entries(issues)
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .sort()
    .flatMap((f) => {
      const content = read(join(issues, f));
      return content === null ? [] : [parseTicket(f, content)];
    });
  return { slug, spec: specText === null ? null : parseFeatureSpec(slug, specText), tickets };
}

/** 프로젝트 하나의 기능별 할일 목록. `docs/features/` 가 없으면 빈 목록(예외로 죽지 않는다). */
export function readFeatures(repoPath: string): Feature[] {
  const base = join(repoPath, "docs", "features");
  if (!isDir(base)) return [];
  const docs = entries(base)
    .filter((name) => isDir(join(base, name)))
    .map((name) => readFeatureDir(base, name));
  return buildFeatures(docs);
}
