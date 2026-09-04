import type { Project } from "@gootte/contract";
import { discoverProjects, headCommit, readFeatures } from "@gootte/core-io";
import { clearSnapshotMemory, readSnapshotStamps, recordProjectScan } from "./snapshot";
 
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
 
/** roots 의 firstmate 프로젝트 (TTL 내 재사용). `now` 주입 = 테스트용. */
export function getProjects(roots: string[], now: number = Date.now()): Project[] {
  const key = roots.join("\x00");
  if (cache && cache.key === key && now - cache.at < DISCOVER_TTL_MS) return cache.projects;
  const projects = discoverProjects(roots);
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

/**
 * roots 로 본 `/api/projects` 페이로드 (TTL 내 재사용). `build` 는 캐시 미스 시에만 호출된다.
 *
 * 🔴 캐시 키는 **roots 만** 보는 게 아니다 — `openFeatures`(남은 일 있는 기능 수)는
 * `firstmateHome`(백로그 조인 원천)에도 달려 있다. `firstmateHome` 만 바꿔도 discover 목록(roots)은
 * 그대로라 키가 안 바뀌어 stale 카운트를 내준다(실측: firstmateHome 해제 후 좌측 숫자가 안 바뀜).
 * 그래서 `keySalt`(보통 `readSettings().firstmateHome`)를 키에 같이 넣어, 백로그 원천이 바뀌면
 * 다른 캐시로 빌드되게 한다. `keySalt` 미전달은 빈 문자열(기존 동작 보존).
 */
export function getProjectsPayload(
  roots: string[],
  build: () => Project[],
  keySalt: string = "",
  now: number = Date.now(),
): Project[] {
  const key = `${roots.join(" ")}\u0000${keySalt}`;
  if (payloadCache && payloadCache.key === key && now - payloadCache.at < DISCOVER_TTL_MS)
    return payloadCache.payload;
  const payload = build();
  payloadCache = { at: now, key, payload };
  return payload;
}

/**
 * `/api/projects` 페이로드 캐시만 비운다(read-path-redesign/T03).
 * 🔴 `clearDiscoverCache` 와 다르다 — discover 목록과 스냅샷 메모리는 **건드리지 않는다.**
 * 배지(`openFeatures`)가 백그라운드로 채워졌을 때, 그 한 가지 때문에 무거운 것까지 버리지 않으려고.
 */
export function clearPayloadCache(): void {
  payloadCache = null;
}

/**
 * slug → Project 해소 (W1). slug = 디렉토리 basename.
 * T01 이후 discover 가 같은 slug 의 사본을 하나의 `Project`(copies 배열)로 묶어 내므로,
 * 여기서 오는 것은 이미 **묶인 결과**다 — slug 당 최대 하나. 중복은 정상 상태가 되었다.
 */
export function pickBySlug(projects: Project[], slug: string): Project | null {
  return projects.find((p) => p.slug === slug) ?? null;
}

/** roots 에서 slug 해소 — 미해소=null. 묶인 결과 위에서 단일 매치가 정답이다. */
export function resolveSlug(roots: string[], slug: string, now: number = Date.now()): Project | null {
  return pickBySlug(getProjects(roots, now), slug);
}
