import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve, sep } from "node:path";
import type { Feature, FeatureConflict, FeatureDocNode, TodoStatus } from "@gootte/contract";
import { buildFeatures, parseFeatureSpec, parseNewTicket, parseTicket, parseTimeLine, type FeatureDocs, type TimeLine } from "@gootte/core";
import {
  checkIgnored,
  hasUncommittedChange,
  headCommit,
  isAncestor as gitIsAncestor,
  isRepo,
  revExists,
  unlandedPaths,
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
function walkSlug(dir: string, rel: string, into: Map<string, string>): void {
  for (const name of entries(dir)) {
    if (name.startsWith(".")) continue;
    const abs = join(dir, name);
    const relPath = rel ? `${rel}/${name}` : name;
    if (isDir(abs)) walkSlug(abs, relPath, into);
    else {
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
 * 미착지(추적 안 됨 또는 커밋 안 된 변경) 노드에 표식을 얹는다(AC2·AC3, T04). `isUnlanded` 가
 * null 이면(git 이 못 답함) 아무 표식도 얹지 않는다(AC6) — 호출자는 그 경우를 아예 부르지 않는다.
 */
function markUnlanded(nodes: readonly FeatureDocNode[], isUnlanded: (path: string) => boolean): FeatureDocNode[] {
  return nodes.map((node) => {
    const marked = isUnlanded(node.path) ? { ...node, unlanded: true } : node;
    return node.kind === "dir" ? { ...marked, children: markUnlanded(node.children ?? [], isUnlanded) } : marked;
  });
}

/** 사본 하나의 git 질의 결과 — 기능 폴더 전체 경로를 모아 한 번에 물은 값(T06). */
interface CopyGitBatch {
  /** `check-ignore` 결과(무시된 경로 집합) — git 이 못 답하면 null. */
  ignored: Set<string> | null;
  /** `unlandedPaths` 결과(미착지 경로 집합, repo 루트 기준) — git 이 못 답하면 null. */
  unlanded: Set<string> | null;
}

/**
 * 기능 폴더 트리에 추적 제외 필터와 미착지 표식을 얹는다(T04). `batch` 가 null 이면(저장소가
 * 아니거나 git 이 못 답함) 원본 트리를 그대로 돌려준다 — 판정 불가와 "문제 없음" 을 섞지 않는다(AC6).
 * git 질의는 호출측(readFeatures)이 **사본당 한 번** 미리 구해 `batch` 로 넘긴다(T06) — 폴더마다
 * spawn 하던 것을 없앤다. 두 집합 모두 경로는 `toFull`(`docs/features/<slug>/<node>`) 형식이다.
 */
function annotateDocTree(slug: string, tree: FeatureDocNode[], batch: CopyGitBatch): FeatureDocNode[] {
  const gitRelBase = join("docs", "features", slug);
  const toFull = (path: string): string => join(gitRelBase, path);

  let annotated = tree;
  if (batch.ignored) annotated = filterIgnored(annotated, (p) => batch.ignored!.has(toFull(p)));
  if (batch.unlanded) annotated = markUnlanded(annotated, (p) => batch.unlanded!.has(toFull(p)));

  return annotated;
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
  files: Map<string, string>; // 상대 경로 → 내용
  tree: FeatureDocNode[];
}

/**
 * 나중 판 판정의 git 질의 캐시 — 사본 쌍당 한 번 구해 재사용한다(T02 §구현 메모).
 * `copies` 는 **유효한** 사본(저장소) 배열이고, 인덱스는 그 배열 기준이다.
 */
class CopyResolver {
  private readonly heads = new Map<string, string | null>();
  private readonly uncommittedCache = new Map<string, boolean | null>();
  private readonly ancestorCache = new Map<string, boolean | null>();

  constructor(private readonly copies: string[]) {}

  head(copy: string): string | null {
    let v = this.heads.get(copy);
    if (v === undefined) {
      v = headCommit(copy);
      this.heads.set(copy, v);
    }
    return v;
  }

  uncommitted(copy: string, gitRelPath: string): boolean | null {
    const key = `${copy} ${gitRelPath}`;
    let v = this.uncommittedCache.get(key);
    if (v === undefined) {
      v = hasUncommittedChange(copy, gitRelPath);
      this.uncommittedCache.set(key, v);
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
    const repo = this.copies.find((c) => revExists(c, ha) && revExists(c, hb)) ?? null;
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
function mergeTicketTimes(times: TimeLine[]): { startedAt: string | null; finishedAt: string | null } {
  const started: string[] = [];
  const finished: string[] = [];
  for (const t of times) {
    if (t.startedAt) started.push(t.startedAt);
    if (t.finishedAt) finished.push(t.finishedAt);
  }
  // 값이 하나도 없으면 둘 다 null — "없음" 은 값이 있는 쪽에 밀린다(역방향 갱신은 금지).
  return {
    startedAt: started.length > 0 ? earliest(started) : null,
    finishedAt: finished.length > 0 ? latest(finished) : null,
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
      // 병합된 Time 줄로 상태 재파생 — parseNewTicket 이 "나중 판" 내용으로 이미 파싱했으나
      // Time 값은 전체 사본에서 모은 것이므로 상태도 그에 맞춰 다시 정한다.
      const derivedStatus = deriveStatusFromTime(mergedTimes.startedAt, mergedTimes.finishedAt);
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
export function readFeatures(copies: string[]): Feature[] {
  const dirs = copies.filter(isDir);
  if (dirs.length === 0) return [];
  // 🔴 git 이 답하지 않는 사본(저장소가 아님)은 그 사본만 건너뛴다(T02 AC8). 단, **git 저장소가
  // 하나도 없으면**(테스트 픽스처 등 평범한 디렉토리) 있는 디렉토리라도 읽는다 — 단일 사본은
  // 아래 절차에서 git 질의를 아예 안 부르므로 저장소가 아니어도 내용을 낸다.
  const repos = dirs.filter(isRepo);
  const valid = repos.length > 0 ? repos : dirs;
  const resolver = new CopyResolver(valid);

  const bySlug = new Map<string, CopySlug[]>();
  valid.forEach((copy, index) => {
    const base = join(copy, "docs", "features");
    if (!isDir(base)) return;
    for (const name of entries(base)) {
      if (name.startsWith(".")) continue;
      const dir = join(base, name);
      if (!isDir(dir)) continue;
      const files = new Map<string, string>();
      walkSlug(dir, "", files);
      // 트리만 먼저 만들고, git 질의는 사본당 한 번 묶어 나중에 얹는다(T06).
      const tree = buildDocTree(dir, "");
      const entry: CopySlug = { copy, index, slug: name, files, tree };
      const arr = bySlug.get(name) ?? [];
      arr.push(entry);
      bySlug.set(name, arr);
    }
  });

  // T06: 사본당 git 하위프로세스를 한 번씩만 — 모든 기능 폴더의 경로를 모아 check-ignore · status
  // 를 일괄 호출한다. 폴더마다 spawn 하던 2×(기능수) 회를 사본수 회로 줄인다(티켓 실측 참고).
  // git 이 못 답하는 사본(저장소 아님)은 두 결과 모두 null 이 되어 트리가 그대로 남는다(AC6).
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
    batchByCopy.set(copy, {
      ignored: checkIgnored(copy, allPaths),
      unlanded: unlandedPaths(copy, join("docs", "features")),
    });
  }

  // 각 사본의 배치 결과를 그 사본의 모든 기능 트리에 얹는다.
  for (const arr of bySlug.values()) {
    for (const cs of arr) {
      const batch = batchByCopy.get(cs.copy)!;
      cs.tree = annotateDocTree(cs.slug, cs.tree, batch);
    }
  }

  const docs: FeatureDocs[] = [];
  for (const [slug, parts] of bySlug) {
    docs.push(mergeSlug(parts, slug, valid, resolver));
  }
  return buildFeatures(docs);
}
