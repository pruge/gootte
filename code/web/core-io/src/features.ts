import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import type { Feature, FeatureDocNode, TodoStatus } from "@gootte/contract";
import { applyTimeRecords, buildFeatures, isTicketDoc, parseFeatureSpec, parseNewTicket, parseTicket, parseTimeLine, type FeatureDocs, type TimeLine, type TimePause } from "@gootte/core";
import { hasTimeRecords, readTicketRecords } from "./state-store";
// 🔴 T01 — git 제거. 추적 제외·갈라짐·나중 판 비교 전부 삭제.

/**
 * firstmate 작업 표면 read — `docs/features/<기능>/{spec.md,issues/<NN>-*.md}` (F3).
 * IO 오케스트레이션만 한다: 읽어서 core 파서에 넘기고 core 계산(buildFeatures)에 태운다.
 * 해석 규칙은 여기 없다(계층 경계 — architecture.md §밟지 말 것).
 *
 * 여러 사본(copies)을 받는다 — 같은 slug 의 사본이 여럿이면 `docs/features/` 를 **합집합**으로
 * 읽고, 같은 파일이 여러 사본에 있으면 **나중 판**의 내용을 쓴다(spec.md §Decisions 4단계).
 * 판정은 저장소가 답하는 사실뿐이다(INV-4 — 파일 시각·크기 추정 금지).
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
 * 기능 폴더 안의 모든 파일을 상대 경로(`issues/01-a.md` 등) → 내용 으로 읽는다.
 * dotfile 은 건너뛴다(INV-4 — 숨김 파일은 문서가 아니다).
 */
function walkSlug(dir: string, rel: string, into: Map<string, string>): void {
  for (const name of entries(dir)) {
    if (name.startsWith(".")) continue;
    const abs = join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (isDir(abs)) walkSlug(abs, relPath, into);
    else if (/\.md$/i.test(name)) {
      const content = read(abs);
      if (content !== null) into.set(relPath, content);
    }
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

/** 트리의 모든 노드(파일·폴더 둘 다)의 상대 경로를 평평하게 모은다 — git 질의를 한 번에 하기 위해. */

/**
 * 여러 사본의 문서 트리를 합친다 — 같은 이름의 노드는 한 번만, dir 는 자식까지 재귀 합침.
 * 사본이 하나뿐이면 입력 트리를 **그대로** 돌려준다(합집합이 단일 사본과 같아야 한다, T02 AC7).
 */
function mergeDocTrees(trees: FeatureDocNode[][]): FeatureDocNode[] {
  const merged = new Map<string, FeatureDocNode>();
  const order: string[] = [];
  for (const tree of trees) {
    for (const node of tree) {
      const existing = merged.get(node.name);
      if (!existing) {
        merged.set(node.name, node);
        order.push(node.name);
      } else if (node.kind === "dir" && existing.kind === "dir") {
        merged.set(node.name, {
          ...existing,
          children: mergeDocTrees([existing.children ?? [], node.children ?? []]),
        });
      }
    }
  }
  return order.map((n) => merged.get(n)!);
}

interface CopySlug {
  copy: string;
  index: number;
  slug: string;
  files: Map<string, string>;
  tree: FeatureDocNode[];
}

/**
 * 🔴 T01 — git 제거. 여러 사본의 파일 내용이 다르면 **마지막 사본** 것을 쓴다.
 * conflict 판정 전부 삭제(D3). "어디 몇개로 작업하던지" — 마지막 것이 이긴다.
 */
function resolveFile(
  participants: { copy: string; index: number; content: string }[],
): { content: string } {
  return { content: participants[participants.length - 1]!.content };
}

/**
 * 🔴 T05 — 사본별 `Time:` 줄 **정방향** 병합. 문서 전체의 "나중 판"(`resolveFile`)과는 별개로,
 * `startedAt`/`finishedAt` 만 이 규칙을 따른다:
 * - 어느 사본이든 값이 있으면 그 값을 쓴다(없는 사본이 있는 사본의 값을 지우지 못한다).
 * - 여러 사본이 서로 다른 값을 둘 다 갖고 있으면 가장 완전한 관측 쪽으로 기운다 —
 *   가장 먼저 시작한 시각을 `startedAt`, 가장 나중에 끝난 시각을 `finishedAt` 으로(안전쪽).
 * 판정은 순수·결정적(INV-4). 완료/시작 여부 자체는 `joinTicket`(T04)가 정하므로 여기선 값만 모은다.
 */
function mergeTicketTimes(
  times: TimeLine[],
): { startedAt: string | null; finishedAt: string | null; pauses: TimePause[] } {
  const started: string[] = [];
  const finished: string[] = [];
  // 사본별 pauses 를 전부 모은다 — 한 사본이 paused 만 기록하고 다른 사본이 resumed 를 기록해도
  // 짝이 맞는 쌍이 여기서 완성될 수 있다(정방향 병합과 같은 규율, ADR-0002).
  const pauseMarks: { pausedAt: string; resumedAt: string | null }[] = [];
  for (const t of times) {
    if (t.startedAt) started.push(t.startedAt);
    if (t.finishedAt) finished.push(t.finishedAt);
    for (const p of t.pauses) pauseMarks.push(p);
  }
  // 값을 정렬해 쌍으로 묶는다 — 단일 사본이라면 이미 순서대로지만, 병합이면 시각순이 맞다.
  pauseMarks.sort((a, b) => cmpTime(a.pausedAt, b.pausedAt));
  const pauses: TimePause[] = [];
  let open: string | null = null;
  for (const mark of pauseMarks) {
    if (mark.resumedAt === null) {
      open = mark.pausedAt;
    } else if (open !== null) {
      pauses.push({ pausedAt: open, resumedAt: mark.resumedAt });
      open = null;
    } else {
      pauses.push(mark); // 짝 없는 resumed(열린 paused 가 없음) — 그대로 담는다
    }
  }
  if (open !== null) pauses.push({ pausedAt: open, resumedAt: null });
  // 값이 하나도 없으면 둘 다 null — "없음" 은 값이 있는 쪽에 밀린다(역방향 갱신은 금지).
  return {
    startedAt: started.length > 0 ? earliest(started) : null,
    finishedAt: finished.length > 0 ? latest(finished) : null,
    pauses,
  };
}

/** ISO 8601 시각 중 가장 빠른 것. `Date.parse` 가 되지 않으면 원문 사전순으로 fallback(지어내지 않음). */
function earliest(xs: string[]): string {
  return xs.reduce((best, x) => (cmpTime(x, best) < 0 ? x : best));
}
/** ISO 8601 시각 중 가장 늦은 것. */
function latest(xs: string[]): string {
  return xs.reduce((best, x) => (cmpTime(x, best) > 0 ? x : best));
}

/** Time 줄 병합 후 상태 재파생 — core `parseNewTicket` 와 같은 로직. */
function deriveStatusFromTime(startedAt: string | null, finishedAt: string | null): TodoStatus {
  if (finishedAt) return "done";
  if (startedAt) return "in_progress";
  return "pending";
}
function cmpTime(a: string, b: string): number {
  const pa = Date.parse(a);
  const pb = Date.parse(b);
  if (!Number.isNaN(pa) && !Number.isNaN(pb)) return pa - pb;
  // `gootte` 가 기록하는 `+09:00` 식 오프셋을 `Date.parse` 가 못 읽을 극단 상황 대비 — 사전순은 결정적.
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 한 slug 의 여러 사본을 하나의 `FeatureDocs` 로 합친다. */
function mergeSlug(parts: CopySlug[], slug: string): FeatureDocs {
  const allPaths = new Set<string>();
  for (const p of parts) for (const k of p.files.keys()) allPaths.add(k);

  const contentByPath = new Map<string, string>();
  const participantsByPath = new Map<string, { copy: string; index: number; content: string }[]>();
  for (const path of allPaths) {
    const participants = parts
      .filter((p) => p.files.has(path))
      .map((p) => ({ copy: p.copy, index: p.index, content: p.files.get(path)! }));
    const res = resolveFile(participants);
    contentByPath.set(path, res.content);
    participantsByPath.set(path, participants);
  }

  const specContent = contentByPath.get("spec.md") ?? null;
  const spec = specContent === null ? null : parseFeatureSpec(slug, specContent);
  // 🔴 `issues/`·`tickets/` 는 예전처럼 **top-level 만** 줍는다(entries, 재귀 아님) — walkSlug 는
  // 재귀라 `issues/sub/x.md` 같은 하위 경로까지 잡는데, 그건 이 관례가 원래 보던 것이 아니다
  // (단일 사본에서 지금과 바이트로 동일해야 한다, T02 AC7).
  const tickets = [...allPaths]
    .filter((p) => /^issues\//.test(p) && isTicketDoc(p))
    .map((p) => {
      const parsed = parseTicket(basename(p), contentByPath.get(p)!);
      // 🔴 T05 — 구관례(`issues/`) 티켓도 `Time:` 줄을 사본 전체에서 정방향 병합한다. `resolveFile` 이
      // `Time:` 없는 사본(예: treehouse 격리 복사본)을 "나중 판" 으로 골라도, 값이 있는 사본(firstmate
      // 메인) 쪽이 이겨야 한다(신관례 `tickets/` 와 같은 규칙). 어느 사본이든 값이 있으면 그 값이 사라지지 않는다.
      const times = (participantsByPath.get(p) ?? []).map((x) => parseTimeLine(x.content));
      return { ...parsed, ...mergeTicketTimes(times) };
    });
  const newTickets = [...allPaths]
    .filter((p) => /^tickets\//.test(p) && isTicketDoc(p))
    .map((p) => {
      const merged = parseNewTicket(basename(p), contentByPath.get(p)!);
      // 🔴 T05 — `Time:` 줄은 사본 전체의 "나중 판" 결정(`resolveFile`)과 **별개**로 정방향 병합한다.
      // 어떤 사본이든 값을 기록하면 그 값은 다른 사본에 없다는 이유로 사라지지 않는다(
      // "있다가 없어지는" 갱신 금지, 정방향 전용). 사본별로 각각 읽어 값이 있는 쪽이 이긴다.
      const times = (participantsByPath.get(p) ?? []).map((x) => parseTimeLine(x.content));
      const mergedTimes = mergeTicketTimes(times);
      // 🔴 상태 재파생은 **명시적 `Status:` 줄이 없을 때만** Time 줄로 한다. `Status: wontfix` 같은
      // 명시 상태는 문서가 말하는 최종값이라 Time 이 병합돼도 그것을 덮지 않는다(실제 결함 2026-08-31:
      // wontfix 티켓이 started 만 있어 in_progress 로 보였다). `sourceStatus` 가 곧 명시 줄 유무다.
      const derivedStatus =
        merged.sourceStatus === null
          ? deriveStatusFromTime(mergedTimes.startedAt, mergedTimes.finishedAt)
          : merged.status;
      return { ...merged, ...mergedTimes, status: derivedStatus };
    });
  const tree = mergeDocTrees(parts.map((p) => p.tree));
  return { slug, spec, tickets, tree, newTickets };
}

type FeatureDocRead = { ok: true; content: string } | { ok: false; reason: "outside" | "not-found" };

/**
 * 기능 폴더 안의 문서 본문 하나를 읽는다 — read-only(INV-2).
 * 🔴 요청 경로를 해소한 뒤 그 기능 폴더 **안**으로 들어오는지 판정하고, 벗어나면 거절한다
 * (경로 탈출 차단, 티켓 01 §설계 4). 🔴 **사본마다** 판정한다 — 한 사본에서 통과했다고 다른
 * 사본 경로를 열어 주면 안 된다(`base + sep` 접두 비교라 "foo-evil" 이 "foo" 의 접두 문자열만
 * 공유하는 형제 폴더로 새는 것도 막는다).
 */
export function readFeatureDoc(
  copies: string[],
  featureSlug: string,
  relPath: string,
): FeatureDocRead {
  for (const copy of copies) {
    const base = resolve(join(copy, "docs", "features", featureSlug));
    const target = resolve(base, relPath);
    if (target !== base && !target.startsWith(base + sep)) return { ok: false, reason: "outside" };
    const content = read(target);
    if (content !== null) return { ok: true, content };
  }
  return { ok: false, reason: "not-found" };
}

/**
 * 프로젝트 사본들의 기능별 할일 목록 합집합. `docs/features/` 가 없는 사본은 빈 기여(예외로 죽지 않는다).
 * 🔴 저장소가 아닌 사본(경로 없음·`.git` 없음)은 **그 사본만 건너뛴다** — 나머지는 그대로 보인다
 * (T02 AC8). 모든 사본이 무효면 빈 목록.
 *
 * 🔴 **정렬돼 있지 않다** — 화면 순서(무리 → 처리중 → 폴더명, 티켓 03)는 처리중이 얹힌 뒤에야
 * 정해진다. 정렬된 목록이 필요하면 `applyInProgress` 를 거친 결과를 쓴다.
 */
// ── read-path-redesign/T04 — 기능 폴더 단위 파생물 캐시 ──────────────────────────────
//
// 🔴 예전에는 문서 **한 장**이 바뀌어도 기능 61개 × 사본 3개를 통째로 다시 읽었다(spec §4 원인 B).
// 이제 계산 단위는 **기능 폴더 하나**다. 바뀐 폴더만 다시 읽고 나머지는 지난 결과를 그대로 쓴다.
//
// 🔴 stale 을 새로 만들지 않는다(INV-3) — 캐시 키를 **디스크와 git 의 현재 상태에서 파생**시켰다.
// 그래서 "무효화를 깜빡한 경로" 라는 게 존재할 수 없다. 키에 들어가는 것:
//   1. 유효 사본 목록과 각 사본의 HEAD — `resolveFile` 이 조상 관계로 나중 판을 고르므로
//      **커밋이 결과를 바꾼다**(T06 조사에서 확인). HEAD 를 키에 넣지 않으면 갈라짐이 굳는다.
//   2. 그 폴더 안 모든 파일의 (경로 · mtime · 크기) — 내용을 안 읽고 얻는 지문이다.
// 사본이 늘거나 줄어도 1 이 달라져 자동으로 무효가 된다.

interface FolderCacheEntry {
  key: string;
  docs: FeatureDocs;
}
/**
 * 상한 있는 폴더 캐시(memory-diet T05) — 항목이 넘치면 가장 오래된 것부터 버린다(Map 삽입순).
 * 키에 사본 목록 전체가 들어가 사본 구성이 바뀔 때마다 새 항목이 생기므로, 무제한이면 켜둔
 * 서버에 쌓인다. 버려도 된다 — 다음 read 가 지문 미적중으로 다시 계산한다(INV-1 파생물).
 */
const MAX_FOLDER_CACHE = 100;
const folderCache = new Map<string, FolderCacheEntry>();

function evictFolderCache(): void {
  while (folderCache.size > MAX_FOLDER_CACHE) {
    const oldest = folderCache.keys().next();
    if (oldest.done) return;
    folderCache.delete(oldest.value);
  }
}

/** 기능 폴더 캐시를 통째로 비운다 — 테스트와 명시적 무효화용. */
export function clearFeatureCache(): void {
  folderCache.clear();
}

/** 캐시 항목 수 — 상한 회귀 테스트용. */
export function folderCacheSize(): number {
  return folderCache.size;
}

/**
 * 폴더 지문 — 내용을 읽지 않고 (경로 · mtimeMs · 크기)만 모은다. dotfile 은 `walkSlug` 와
 * 같은 규칙으로 건너뛴다(그래야 지문과 실제로 읽는 것이 어긋나지 않는다).
 */
function folderFingerprint(dir: string, rel: string, out: string[]): void {
  for (const name of entries(dir)) {
    if (name.startsWith(".")) continue;
    const abs = join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) folderFingerprint(abs, relPath, out);
    else out.push(`${relPath}:${st.mtimeMs}:${st.size}`);
  }
}

export function readFeatures(copies: string[]): Feature[] {
  const dirs = copies.filter(isDir);
  if (dirs.length === 0) return [];

  // 1) 폴더 지문 — **내용을 읽지 않고** 어느 폴더가 다시 계산돼야 하는지부터 가른다.
  const slugFingerprints = new Map<string, string[]>();
  const slugDirs = new Map<string, { copy: string; index: number; dir: string }[]>();
  dirs.forEach((copy, index) => {
    const base = join(copy, "docs", "features");
    if (!isDir(base)) return;
    for (const name of entries(base)) {
      if (name.startsWith(".")) continue;
      const dir = join(base, name);
      if (!isDir(dir)) continue;
      const fp: string[] = [];
      folderFingerprint(dir, "", fp);
      fp.sort();
      const parts = slugFingerprints.get(name) ?? [];
      parts.push(`${copy}|${fp.join(",")}`);
      slugFingerprints.set(name, parts);
      const dirs2 = slugDirs.get(name) ?? [];
      dirs2.push({ copy, index, dir });
      slugDirs.set(name, dirs2);
    }
  });

  // 2) 캐시 조회
  const mapKeyOf = (slug: string): string => `${dirs.join("\u0000")}\u0001${slug}`;
  const keyOf = (slug: string): string => `${(slugFingerprints.get(slug) ?? []).join("\u0002")}`;
  const bySlugDocs = new Map<string, FeatureDocs>();
  const stale: string[] = [];
  for (const slug of slugDirs.keys()) {
    const hit = folderCache.get(mapKeyOf(slug));
    if (hit && hit.key === keyOf(slug)) bySlugDocs.set(slug, hit.docs);
    else stale.push(slug);
  }

  if (stale.length > 0) {
    // 3) 바뀐 폴더만 내용을 읽는다.
    const bySlug = new Map<string, CopySlug[]>();
    for (const slug of stale) {
      for (const { copy, index, dir } of slugDirs.get(slug) ?? []) {
        const files = new Map<string, string>();
        walkSlug(dir, "", files);
        const tree = buildDocTree(dir, "");
        const arr = bySlug.get(slug) ?? [];
        arr.push({ copy, index, slug, files, tree });
        bySlug.set(slug, arr);
      }
    }

    for (const [slug, parts] of bySlug) {
      const merged = mergeSlug(parts, slug);
      folderCache.set(mapKeyOf(slug), { key: keyOf(slug), docs: merged });
      bySlugDocs.set(slug, merged);
    }
    evictFolderCache();
  }

  const docs: FeatureDocs[] = [];
  for (const slug of slugDirs.keys()) {
    const d = bySlugDocs.get(slug);
    if (d) docs.push(d);
  }

  return buildFeatures(docs);
}

/**
 * 기존 기능 목록에 시간·상태 레코드를 얹는 조인 — **모드 판정의 유일한 자리**(T03).
 * v2 state.json 이 있으면 레코드가 권위(`applyTimeRecords`), 없으면 원본 그대로(폴백).
 * 이미 계산된 목록(스냅샷 히트·워커 결과)을 서빙 직전에 조인할 때 쓴다.
 * 🔴 `projectDir` 는 대표 경로(`proj.path`) — 레코드는 메인에만 있다(D4).
 */
export function joinTimeRecords(features: Feature[], projectDir: string): Feature[] {
  if (!hasTimeRecords(projectDir)) return features;
  return applyTimeRecords(features, readTicketRecords(projectDir));
}

/**
 * `readFeatures` 의 레코드 조인 버전 — CLI 가 쓴다(문서 읽기부터 한 길).
 * 백엔드처럼 이미 계산된 목록이 있으면 `joinTimeRecords` 를 직접 쓴다.
 */
export function readFeaturesWithTime(copies: string[], projectDir: string): Feature[] {
  return joinTimeRecords(readFeatures(copies), projectDir);
}
