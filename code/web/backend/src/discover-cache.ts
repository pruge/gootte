import type { Project } from "@gootte/contract";
import { discoverProjects, headCommit, readFeatures, resolveSlugTargeted } from "@gootte/core-io";
import { snapshotProjects, snapshotRoots, sameRootsSet, clearSnapshotMemory, recordProjectScan } from "./snapshot";
  
  /**
   * discover 캐시 (W2) — 머신 scan 은 무거워 매 요청 재실행 금지. 프로세스 메모리에 TTL 캐시.
   * 프로젝트 목록은 자주 안 변하니 안전. 기능·티켓 문서 내용은 이 캐시에 담기지 않음(INV-3) —
   * `/api/features/:slug` 는 매 요청 다시 읽는다… 가 T03 이전의 이야기다. 문서 내용의 영구
   * 스냅샷은 `snapshot.ts` 가 따로 갖고, 이 캐시는 discover 목록의 짧은 메모만 남는다.
   */
  export const DISCOVER_TTL_MS = 5_000;
  
  interface CacheEntry {
    at: number;
    key: string;
    projects: Project[];
  }
  let cache: CacheEntry | null = null;

  /**
   * roots 의 firstmate 프로젝트 (TTL 내 재사용). 🔴 콜드 시작에서 전체 트리 walk(`discoverProjects`,
   * 사본마다 git 하위프로세스) 비용을 사이드바가 물려받지 않게 디스크 스냅샷(copies 영속)을 먼저 쓰고,
   * 없을 때만 전체 discover 로 되돌아간다(plan-board/13). 스냅샷은 부팅 재검증·감시 신호로 항상 최신 유지.
   */
  export function getProjects(
    roots: string[],
    opts: { dataDir?: string; now?: number; force?: boolean } = {},
  ): Project[] {
    const now = opts.now ?? Date.now();
    const key = roots.join("\x00");
    if (!opts.force && cache && cache.key === key && now - cache.at < DISCOVER_TTL_MS) return cache.projects;
    let projects: Project[];
    if (opts.dataDir) {
      // 🔴 디스크 스냅샷(copies 영속)을 먼저 쓴다 — 사이드바가 전체 discover 비용을 물려받지 않는다
      // (fast-cold-start, plan-board/13). 단, 스냅샷은 **기록 당시의 roots 가 그대로일 때만** 유효하다
      // — 다른 roots(테스트·설정 변경)에서는 새 discover 로 떨어지지 빈 화면을 내지 않는다.
      // 같은 roots 라는 판정은 `sameRootsSet`(순서 무시) — `loadDoc` 가 메모이즈돼 게이트 자체는
      // 한 번 캐시 워밍 후엔 0 비용이다.
      const savedRoots = snapshotRoots(opts.dataDir);
      if (savedRoots && sameRootsSet(savedRoots, roots)) {
        const snap = snapshotProjects(opts.dataDir);
        projects = snap ?? discoverProjects(roots);
      } else {
        projects = discoverProjects(roots);
      }
    } else {
      projects = discoverProjects(roots);
    }
    cache = { at: now, key, projects };
    return projects;
  }
 
/**
 * 캐시 무효화 (테스트·수동 refresh·감시 신호). 🔴 **디스크 영구 스냅샷은 지우지 않는다**(T07) —
 * 첫 화면을 항상 즉시 서빙하려면 파일이 남아야 한다. 메모리 적재본(`clearSnapshotMemory`)과
 * 페이로드 TTL 캐시만 비워, 다음 요청이 디스크 스냅샷(또는 필요 시 새 스캔)에서 다시 읽게 한다.
 * 스냩샷 갱신·교체는 부팅 재검증(`revalidateSnapshot`)과 감시 신호(`scheduleProjectUpdate`)가
 * 백그라운드로 한다 — 여기서 파일을 지우면 재기동마다 빈 화면+재스캔이 된다.
 */
export function clearDiscoverCache(): void {
  cache = null;
  payloadCache = null;
  clearSnapshotMemory();
}

/** 메모리 캐시만 비운다 (재시작 시뮬레이션용). 디스크 스냅샷 파일은 건드리지 않는다. */
export function clearDiscoverCacheMemory(): void {
  cache = null;
  payloadCache = null;
  clearSnapshotMemory();
}

/**
 * `/api/projects` **전체 페이로드** 캐시 (fix/projects-listing-spin).
 *
 * 목록 엔드포인트는 사본마다 git 하위프로세스(`check-ignored`·`unlanded`)를 도는
 * `readFeatures` 를 **모든 프로젝트·모든 사본** 에 대해 매 요청 재실행한다 — 뿌리가 늘어나면
 * (one-setting-finds-every-copy) 요청 하나가 ~13초가 되고, 감시 폴백 폴링이 그것을 5초마다
 * 다시 돌려 스피너가 멈추지 않는다. 발견 결과(discover)와 달리 `openFeatures` 카운트는
 * 문서가 바뀔 때마다 변하는 파생물이지만, 그 리듬은 감시 신호(`onProjectsChange`)와 같다 —
 * 문서가 바뀌면 어차피 `clearDiscoverCache` 가 울리므로, 같은 5초 TTL 로 같이 캐시해도
 * stale 폭은 감시가 닫힌 환경의 폴백 폴링 주기(15초) 이하로 유지된다. 목록은 자주 안 바뀌니 안전.
 */
interface PayloadEntry {
  at: number;
  key: string;
  payload: Project[];
}
let payloadCache: PayloadEntry | null = null;

/** roots 로 본 `/api/projects` 페이로드 (TTL 내 재사용). `build` 는 캐시 미스 시에만 호출된다. */
export function getProjectsPayload(
  roots: string[],
  build: () => Project[],
  now: number = Date.now(),
): Project[] {
  const key = roots.join(" ");
  if (payloadCache && payloadCache.key === key && now - payloadCache.at < DISCOVER_TTL_MS)
    return payloadCache.payload;
  const payload = build();
  payloadCache = { at: now, key, payload };
  return payload;
}

/**
 * slug → Project 해소 (W1). slug = 디렉토리 basename.
 * T01 이후 discover 가 같은 slug 의 사본을 하나의 `Project`(copies 배열)로 묶어 내므로,
 * 여기서 오는 것은 이미 **묶인 결과**다 — slug 당 최대 하나. 중복은 정상 상태가 되었다.
 */
export function pickBySlug(projects: Project[], slug: string): Project | null {
  return projects.find((p) => p.slug === slug) ?? null;
}

/**
 * roots 에서 slug 해소 — 미해소=null. 🔴 전체 트리 walk(`discoverProjects`) 대신 targeted 로
 * 즉시 해소한다(plan-board/13) — features/plan/doc 모든 엔드포인트가 이걸 쓰니 cold 시작 시
 * 수십 초 스캔을 물려받지 않는다. 전체 목록이 필요한 `/api/projects` 는 `getProjects` 를 직접 쓴다.
 */
export function resolveSlug(roots: string[], slug: string, _now: number = Date.now()): Project | null {
  return resolveSlugTargeted(roots, slug);
}

/** slug 하나만 cheap 하게 해소(전체 트리 walk 없음, plan-board/13). 문서 열기 경로용. */
export function resolveSlugTargetedProjects(roots: string[], slug: string): Project | null {
  return resolveSlugTargeted(roots, slug);
}
