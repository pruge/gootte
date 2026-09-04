import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import type { Feature, FeatureConflict, FeatureDocNode, TodoStatus } from "@gootte/contract";
import { buildFeatures, parseFeatureSpec, parseNewTicket, parseTicket, parseTimeLine, type FeatureDocs, type TimeLine, type TimePause } from "@gootte/core";
import {
  checkIgnored,
  uncommittedPathsUnder,
  headCommit,
  isAncestor as gitIsAncestor,
  isRepo,
  revExists,
} from "./git";

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
function walkSlug(dir: string, rel: string, into: Map<string, string>, digests: Map<string, string>): void {
  for (const name of entries(dir)) {
    if (name.startsWith(".")) continue;
    const abs = join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (isDir(abs)) walkSlug(abs, relPath, into, digests);
    else if (/\.md$/i.test(name)) {
      const content = read(abs);
      if (content !== null) into.set(relPath, content);
    } else {
      // 🔴 `.md` 가 아닌 파일은 **본문을 문자열로 올리지 않는다**(read-path-redesign/T02) —
      // 파싱하는 것은 `.md` 뿐이고(`parseFeatureSpec`·`parseTicket`·`parseNewTicket`), 트리에는
      // 이름만 필요하다. 실측: 사본 3개 기준 205ms → 60ms, 문자열 12.4MB → 5.5MB.
      //
      // 🔴 그래도 **읽기는 한다** — 갈라짐(`conflict`) 판정이 이 파일들에도 걸리기 때문이다
      // (실측 확인 2026-09-04: `design/x.html` 이 사본마다 다르면 지금도 갈라짐으로 잡힌다).
      // 내용 대신 **해시**를 비교 토큰으로 싣는다 — 판정은 그대로고 문자열만 안 남는다.
      const digest = fileDigest(abs);
      if (digest !== null) digests.set(relPath, digest);
    }
  }
}

/** `.md` 아닌 파일의 비교 토큰 — 바이트를 읽되 문자열로 남기지 않는다(T02). 못 읽으면 null. */
function fileDigest(abs: string): string | null {
  try {
    return createHash("sha1").update(readFileSync(abs)).digest("hex");
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

/** 트리의 모든 노드(파일·폴더 둘 다)의 상대 경로를 평평하게 모은다 — git 질의를 한 번에 하기 위해. */
function collectPaths(nodes: readonly FeatureDocNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    out.push(node.path);
    if (node.kind === "dir") out.push(...collectPaths(node.children ?? []));
  }
  return out;
}

/**
 * 추적 제외된 노드를 트리에서 뺀다(AC1, T04 — "버리는 시안은 들이지 않는다"). `isIgnored` 가
 * null 이면(git 이 못 답함) 아무것도 거르지 않는다 — 못 물었다고 문서를 감추지 않는다(AC6).
 */
function filterIgnored(nodes: readonly FeatureDocNode[], isIgnored: (path: string) => boolean): FeatureDocNode[] {
  const out: FeatureDocNode[] = [];
  for (const node of nodes) {
    if (isIgnored(node.path)) continue;
    out.push(node.kind === "dir" ? { ...node, children: filterIgnored(node.children ?? [], isIgnored) } : node);
  }
  return out;
}

/**
 * 사본 하나의 git 질의 결과 — 기능 폴더 전체 경로를 모아 한 번에 물은 값(T06).
 * 🔴 미착지(`unlandedPaths`)는 read-path-redesign/T01 에서 빠졌다 — 화면에 붙는 호출부가 없는
 * 유령 값이었고, 그것 하나 때문에 사본마다 `git status` 를 돌았다.
 */
interface CopyGitBatch {
  /** `check-ignore` 결과(무시된 경로 집합) — git 이 못 답하면 null. */
  ignored: Set<string> | null;
}

/**
 * 기능 폴더 트리에 추적 제외 필터를 얹는다(T04). `batch.ignored` 가 null 이면(저장소가
 * 아니거나 git 이 못 답함) 원본 트리를 그대로 돌려준다 — 판정 불가와 "문제 없음" 을 섞지 않는다(AC6).
 * git 질의는 호출측(readFeatures)이 **사본당 한 번** 미리 구해 `batch` 로 넘긴다(T06) — 폴더마다
 * spawn 하던 것을 없앤다. 두 집합 모두 경로는 `toFull`(`docs/features/<slug>/<node>`) 형식이다.
 */
function annotateDocTree(slug: string, tree: FeatureDocNode[], batch: CopyGitBatch): FeatureDocNode[] {
  const gitRelBase = join("docs", "features", slug);
  const toFull = (path: string): string => join(gitRelBase, path);

  if (!batch.ignored) return tree;
  return filterIgnored(tree, (p) => batch.ignored!.has(toFull(p)));
}

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
  index: number; // `copies`(유효 사본) 배열에서의 위치
  slug: string;
  files: Map<string, string>; // 상대 경로 → 내용. 🔴 `.md` **만** 담는다(T02).
  /** 상대 경로 → sha1 — `.md` 아닌 파일의 갈라짐 비교 토큰(T02). 본문은 안 남긴다. */
  digests: Map<string, string>;
  tree: FeatureDocNode[];
}

/**
 * 나중 판 판정의 git 질의 캐시 — 사본 쌍당 한 번 구해 재사용한다(T02 §구현 메모).
 * `copies` 는 **유효한** 사본(저장소) 배열이고, 인덱스는 그 배열 기준이다.
 */
class CopyResolver {
  private readonly heads = new Map<string, string | null>();
  /** 사본 → `docs/features` 아래 미커밋 경로 집합. `null` = git 이 못 답함. 아직 안 물었으면 키가 없다. */
  private readonly dirtyByCopy = new Map<string, Set<string> | null>();
  private readonly ancestorCache = new Map<string, boolean | null>();
  /** `${copy}\u0000${sha}` → 그 사본이 그 커밋을 갖고 있나(read-path-redesign/T06). */
  private readonly hasRevCache = new Map<string, boolean>();

  constructor(private readonly copies: string[]) {}

  head(copy: string): string | null {
    let v = this.heads.get(copy);
    if (v === undefined) {
      v = headCommit(copy);
      this.heads.set(copy, v);
    }
    return v;
  }

  /**
   * 🔴 파일마다 `git status` 를 부르지 않는다(read-path-redesign/T06) — 그 사본을 **처음 물을 때**
   * `docs/features` 아래 미커밋 경로를 한 번에 받아 두고 이후엔 집합 조회로 답한다.
   * 게으르게 부르므로 **다를 파일이 하나도 없으면 git 을 아예 안 부른다**(내용이 같으면
   * `resolveFile` 이 여기까지 오지 않는다). 실측: 사본 3개에 11회 → 3회.
   */
  uncommitted(copy: string, gitRelPath: string): boolean | null {
    if (!this.dirtyByCopy.has(copy)) {
      this.dirtyByCopy.set(copy, uncommittedPathsUnder(copy, join("docs", "features")));
    }
    const dirty = this.dirtyByCopy.get(copy)!;
    return dirty === null ? null : dirty.has(gitRelPath);
  }

  /** 그 사본이 이 커밋을 갖고 있나 — 같은 (사본, 커밋)을 두 번 묻지 않는다(T06). */
  private hasRev(copy: string, sha: string): boolean {
    const key = `${copy}\u0000${sha}`;
    let v = this.hasRevCache.get(key);
    if (v === undefined) {
      v = revExists(copy, sha);
      this.hasRevCache.set(key, v);
    }
    return v;
  }

  /** `copies[aIdx]` 의 HEAD 가 `copies[bIdx]` 의 HEAD 의 조상인가. */
  isAncestor(aIdx: number, bIdx: number): boolean | null {
    const key = `${aIdx} ${bIdx}`;
    let v = this.ancestorCache.get(key);
    if (v !== undefined) return v;
    const a = this.copies[aIdx]!;
    const b = this.copies[bIdx]!;
    const ha = this.head(a);
    const hb = this.head(b);
    if (!ha || !hb) {
      this.ancestorCache.set(key, null);
      return null;
    }
    // 두 commit 을 모두 가진 저장소에서만 merge-base 가 답한다 — 사본들이 객체를 공유하는 clone.
    const repo = this.copies.find((c) => this.hasRev(c, ha) && this.hasRev(c, hb)) ?? null;
    if (!repo) {
      this.ancestorCache.set(key, null);
      return null;
    }
    const res = gitIsAncestor(repo, ha, hb);
    this.ancestorCache.set(key, res);
    return res;
  }
}

/**
 * 한 파일(상대 경로)의 **합집합 내용**을 정한다 — spec.md §Decisions 4단계.
 * `participants` = 그 파일을 가진 사본들(내용 포함).
 *
 * 1. 한쪽에만 있으면 그 내용. 2. 내용이 같으면 어느 쪽이든.
 * 3. 바이트가 다르면: (a) 한쪽에만 미커밋 변경 → 그쪽, (b) 양쪽 커밋 상태 → HEAD 후손 쪽,
 *    (c) 어느 방향으로도 조상이 아니면(진짜 갈라짐) **고르지 않는다**(conflict=true).
 */
function resolveFile(
  participants: { copy: string; index: number; content: string }[],
  gitRelPath: string,
  copies: string[],
  resolver: CopyResolver,
): { content: string; conflict: boolean; conflictCopies: string[] } {
  if (participants.length === 1) {
    return { content: participants[0]!.content, conflict: false, conflictCopies: [] };
  }
  const first = participants[0]!.content;
  if (participants.every((p) => p.content === first)) {
    return { content: first, conflict: false, conflictCopies: [] };
  }
  // (a) 한쪽에만 커밋 안 된 변경 → 그쪽이 나중 판.
  const dirty = participants.map((p) => ({ ...p, uncommitted: resolver.uncommitted(p.copy, gitRelPath) }));
  const dirtyOnes = dirty.filter((p) => p.uncommitted === true);
  if (dirtyOnes.length === 1) {
    return { content: dirtyOnes[0]!.content, conflict: false, conflictCopies: [] };
  }
  if (dirtyOnes.length > 1) {
    // 여러 쪽이 미커밋 → 절차 (a) 가 요구하는 "한쪽에만" 이 성립하지 않아 고를 수 없다.
    return { content: representative(dirty, copies), conflict: true, conflictCopies: participants.map((p) => p.copy).sort() };
  }
  // (b) 양쪽 다 커밋 상태 → HEAD 후손 쪽이 나중 판(= 모든 다른 사본의 조상인 사본).
  const idxs = dirty.map((p) => p.index);
  let sink: number | null = null;
  let sinkCount = 0;
  for (const i of idxs) {
    let isSink = true;
    for (const j of idxs) {
      if (i === j) continue;
      if (resolver.isAncestor(j, i) !== true) {
        isSink = false;
        break;
      }
    }
    if (isSink) {
      sink = i;
      sinkCount++;
    }
  }
  if (sinkCount === 1 && sink !== null) {
    const winner = dirty.find((p) => p.index === sink)!;
    return { content: winner.content, conflict: false, conflictCopies: [] };
  }
  // (c) 어느 방향으로도 조상이 아님(진짜 갈라짐) 또는 판정 불가 → 고르지 않는다.
  return { content: representative(dirty, copies), conflict: true, conflictCopies: participants.map((p) => p.copy).sort() };
}

/** 갈라진 파일의 내용은 **대표 사본(copies[0])** 것을 쓴다(T03 §구현 메모) — 정답이라 말하지 않는다. */
function representative(parts: { copy: string; content: string }[], copies: string[]): string {
  const fromRep = parts.find((p) => p.copy === copies[0]);
  return (fromRep ?? parts[0]!).content;
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
function mergeSlug(parts: CopySlug[], slug: string, copies: string[], resolver: CopyResolver): FeatureDocs {
  const allPaths = new Set<string>();
  for (const p of parts) for (const k of p.files.keys()) allPaths.add(k);
  // 🔴 `.md` 아닌 파일도 갈라짐 판정을 받는다(T02) — 내용 대신 해시가 비교 토큰이다.
  const digestPaths = new Set<string>();
  for (const p of parts) for (const k of p.digests.keys()) digestPaths.add(k);

  const contentByPath = new Map<string, string>();
  // 🔴 T05 — `Time:` 줄 정방향 병합을 위해 경로별로 **모든 사본**의 내용을 보관한다(`resolveFile`이
  // 고르는 대표 내용과는 별개로, 각 사본의 `startedAt`/`finishedAt` 을 나중에 따로 모은다).
  const participantsByPath = new Map<string, { copy: string; index: number; content: string }[]>();
  const conflicts: FeatureConflict[] = [];
  for (const path of allPaths) {
    const participants = parts
      .filter((p) => p.files.has(path))
      .map((p) => ({ copy: p.copy, index: p.index, content: p.files.get(path)! }));
    const gitRelPath = join("docs", "features", slug, path);
    const res = resolveFile(participants, gitRelPath, copies, resolver);
    contentByPath.set(path, res.content);
    participantsByPath.set(path, participants);
    if (res.conflict) conflicts.push({ path, copies: res.conflictCopies });
  }

  // `.md` 아닌 파일 — 같은 절차를 해시로 돌린다. 고른 "내용"(= 해시)은 버린다: 아무도 안 읽는다
  // (`contentByPath` 는 spec.md · issues/*.md · tickets/T*.md 만 조회한다).
  for (const path of digestPaths) {
    const participants = parts
      .filter((p) => p.digests.has(path))
      .map((p) => ({ copy: p.copy, index: p.index, content: p.digests.get(path)! }));
    const res = resolveFile(participants, join("docs", "features", slug, path), copies, resolver);
    if (res.conflict) conflicts.push({ path, copies: res.conflictCopies });
  }

  const specContent = contentByPath.get("spec.md") ?? null;
  const spec = specContent === null ? null : parseFeatureSpec(slug, specContent);
  // 🔴 `issues/`·`tickets/` 는 예전처럼 **top-level 만** 줍는다(entries, 재귀 아님) — walkSlug 는
  // 재귀라 `issues/sub/x.md` 같은 하위 경로까지 잡는데, 그건 이 관례가 원래 보던 것이 아니다
  // (단일 사본에서 지금과 바이트로 동일해야 한다, T02 AC7).
  const tickets = [...allPaths]
    .filter((p) => /^issues\/[^/]+\.md$/i.test(p))
    .map((p) => {
      const parsed = parseTicket(basename(p), contentByPath.get(p)!);
      // 🔴 T05 — 구관례(`issues/`) 티켓도 `Time:` 줄을 사본 전체에서 정방향 병합한다. `resolveFile` 이
      // `Time:` 없는 사본(예: treehouse 격리 복사본)을 "나중 판" 으로 골라도, 값이 있는 사본(firstmate
      // 메인) 쪽이 이겨야 한다(신관례 `tickets/` 와 같은 규칙). 어느 사본이든 값이 있으면 그 값이 사라지지 않는다.
      const times = (participantsByPath.get(p) ?? []).map((x) => parseTimeLine(x.content));
      return { ...parsed, ...mergeTicketTimes(times) };
    });
  const newTickets = [...allPaths]
    .filter((p) => /^tickets\/t\d+\.md$/i.test(p))
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
  return { slug, spec, tickets, tree, newTickets, conflict: conflicts };
}

export type FeatureDocRead = { ok: true; content: string } | { ok: false; reason: "outside" | "not-found" };

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
const folderCache = new Map<string, FolderCacheEntry>();

/** 기능 폴더 캐시를 통째로 비운다 — 테스트와 명시적 무효화용. */
export function clearFeatureCache(): void {
  folderCache.clear();
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
  // 🔴 git 이 답하지 않는 사본(저장소가 아님)은 그 사본만 건너뛴다(T02 AC8). 단, **git 저장소가
  // 하나도 없으면**(테스트 픽스처 등 평범한 디렉토리) 있는 디렉토리라도 읽는다 — 단일 사본은
  // 아래 절차에서 git 질의를 아예 안 부르므로 저장소가 아니어도 내용을 낸다.
  const repos = dirs.filter(isRepo);
  const valid = repos.length > 0 ? repos : dirs;
  const resolver = new CopyResolver(valid);

  // 1) 사본별 HEAD — 캐시 키의 git 축. 사본당 한 번(T06 의 `CopyResolver` 기억을 그대로 쓴다).
  const copiesKey = valid.map((c) => `${c}@${resolver.head(c) ?? ""}`).join("\u0000");

  // 2) 폴더 지문 — **내용을 읽지 않고** 어느 폴더가 다시 계산돼야 하는지부터 가른다.
  const slugFingerprints = new Map<string, string[]>(); // slug → 사본별 지문 조각
  const slugDirs = new Map<string, { copy: string; index: number; dir: string }[]>();
  valid.forEach((copy, index) => {
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

  // 3) 캐시 조회 — 키가 같으면 그 폴더는 **한 글자도 다시 읽지 않는다**.
  //
  // 🔴 Map 의 열쇠에 **사본 목록**을 넣는다 — 다른 프로젝트가 같은 기능 slug 를 가질 수 있고,
  // slug 만으로 열쇠를 삼으면 두 프로젝트가 서로의 칸을 계속 밀어낸다(둘 다 영원히 miss).
  // 반대로 HEAD·지문은 **값 쪽 `key`** 에만 둔다 — 커밋할 때마다 새 칸이 생겨 Map 이 무한히
  // 자라지 않게, 같은 칸을 덮어쓰게 하려고.
  const mapKeyOf = (slug: string): string => `${valid.join("\u0000")}\u0001${slug}`;
  const keyOf = (slug: string): string => `${copiesKey}\u0001${(slugFingerprints.get(slug) ?? []).join("\u0002")}`;
  const bySlugDocs = new Map<string, FeatureDocs>();
  const stale: string[] = [];
  for (const slug of slugDirs.keys()) {
    const hit = folderCache.get(mapKeyOf(slug));
    if (hit && hit.key === keyOf(slug)) bySlugDocs.set(slug, hit.docs);
    else stale.push(slug);
  }

  if (stale.length > 0) {
    // 4) 바뀐 폴더만 내용을 읽는다.
    const bySlug = new Map<string, CopySlug[]>();
    for (const slug of stale) {
      for (const { copy, index, dir } of slugDirs.get(slug) ?? []) {
        const files = new Map<string, string>();
        // `.md` 는 본문, 그 외는 해시만(T02) — 갈라짐 비교 토큰으로 쓰인다.
        const digests = new Map<string, string>();
        walkSlug(dir, "", files, digests);
        // 트리만 먼저 만들고, git 질의는 사본당 한 번 묶어 나중에 얹는다(T06).
        const tree = buildDocTree(dir, "");
        const arr = bySlug.get(slug) ?? [];
        arr.push({ copy, index, slug, files, digests, tree });
        bySlug.set(slug, arr);
      }
    }

    // 5) T06: 사본당 git 하위프로세스를 한 번씩만 — **다시 읽는 폴더의 경로만** 모아 일괄 호출한다.
    // git 이 못 답하는 사본(저장소 아님)은 결과가 null 이 되어 트리가 그대로 남는다(AC6).
    const batchByCopy = new Map<string, CopyGitBatch>();
    for (const copy of valid) {
      const allPaths: string[] = [];
      for (const arr of bySlug.values()) {
        for (const cs of arr) {
          if (cs.copy !== copy) continue;
          for (const node of collectPaths(cs.tree)) {
            allPaths.push(join("docs", "features", cs.slug, node));
          }
        }
      }
      // 🔴 그 사본에서 다시 읽는 폴더가 없으면 git 을 아예 안 부른다 — 폴더 단위의 요점이다.
      batchByCopy.set(copy, { ignored: allPaths.length === 0 ? null : checkIgnored(copy, allPaths) });
    }

    for (const arr of bySlug.values()) {
      for (const cs of arr) {
        const batch = batchByCopy.get(cs.copy)!;
        cs.tree = annotateDocTree(cs.slug, cs.tree, batch);
      }
    }

    for (const [slug, parts] of bySlug) {
      const merged = mergeSlug(parts, slug, valid, resolver);
      folderCache.set(mapKeyOf(slug), { key: keyOf(slug), docs: merged });
      bySlugDocs.set(slug, merged);
    }
  }

  // 🔴 결과 순서는 **폴더를 훑은 순서 그대로**다 — 캐시 적중 여부가 목록 순서를 바꾸면
  // 화면이 이유 없이 흔들린다(정렬은 여전히 `applyInProgress` 뒤에 정해진다).
  const docs: FeatureDocs[] = [];
  for (const slug of slugDirs.keys()) {
    const d = bySlugDocs.get(slug);
    if (d) docs.push(d);
  }

  return buildFeatures(docs);
}
