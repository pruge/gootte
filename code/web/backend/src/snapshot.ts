import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Feature, type Feature as FeatureT, type Project } from "@gootte/contract";
import { z } from "zod";
import { discoverProjects, headCommit, readFeatures } from "@gootte/core-io";

/**
 * discover + readFeatures 스캔 결과의 **영구 스냅샷** (fast-cold-start T03, adr/0001).
 *
 * 값의 신뢰 근거가 TTL 시계가 아니라 **git 위치 스탬프 + 감시 신호**다. 스냅샷은 언제든
 * 전체 스캔 한 번으로 재생성되는 파생물이다(INV-1) — 파일이 깨지면 버리고 다시 스캔하면 끝.
 * 저장 자리는 gootte 자기 데이터 디렉터리(`GOOTTE_DATA_DIR`) 안이므로 관리대상에는 한 글자도
 * 쓰지 않는다(INV-2). 내용은 계산 결과의 verbatim 직렬화뿐 — 요약·추론은 없다(INV-4).
 *
 * 흐름: 스캔 미스 시 `recordProjectScan` 이 스탬프(headCommit@기록시점)와 함께 저장하고,
 * 다음 부팅부터 `snapshotFeatures` 가 같은 사본 구성의 프로젝트를 디스크에서 곧바로 내준다.
 * HEAD 비교·부팅 직후 재검증은 T04, 감시 중 증분 반영은 T05 의 몫 — 이 모듈은 저장소일 뿐.
 */

const SNAPSHOT_FILE = "discover-snapshot.json";

const Stamp = z.object({
  repo: z.string(), // 사본 경로
  head: z.string().nullable(), // 기록 시점 headCommit — 사본이 repo 가 아니면 null
});

const SnapshotProject = z.object({
  slug: z.string(),
  path: z.string(),
  copies: z.array(z.string()),
  stamps: z.array(Stamp),
  features: z.array(Feature),
});

const SnapshotDoc = z.object({
  version: z.literal(1),
  scannedAt: z.string(), // 마지막 기록 시각 ISO
  projects: z.array(SnapshotProject),
});

type SnapshotDocT = z.infer<typeof SnapshotDoc>;

/** 메모리 적재본 — dataDir 별로 하나. 파일은 진실, 메모리는 그 적재다. */
const memo = new Map<string, SnapshotDocT>();

export function snapshotPath(dataDir: string): string {
  return join(dataDir, SNAPSHOT_FILE);
}

/**
 * 디스크에서 스냅샷을 읽는다. 없거나 깨졌으면 null — 그것은 오류가 아니라 "스캔해야 한다"
 * 는 정상 신호다(파생물, INV-1). 깨진 파일은 지우지 않고 내버려 둔다 — 다음 기록이 통째로
 * 덮어쓰므로.
 */
function loadDoc(dataDir: string): SnapshotDocT | null {
  const hit = memo.get(dataDir);
  if (hit) return hit;
  const file = snapshotPath(dataDir);
  if (!existsSync(file)) return null;
  try {
    const doc = SnapshotDoc.parse(JSON.parse(readFileSync(file, "utf8")));
    memo.set(dataDir, doc);
    return doc;
  } catch {
    return null;
  }
}

/** 같은 slug·같은 사본 구성이면 스냅샷에서 답한다. 사본이 달라지면 미스 — 재계산한다. */
export function snapshotFeatures(dataDir: string, slug: string, copies: readonly string[]): FeatureT[] | null {
  const doc = loadDoc(dataDir);
  if (!doc) return null;
  const p = doc.projects.find((x) => x.slug === slug);
  if (!p) return null;
  if (p.copies.length !== copies.length || p.copies.some((c, i) => c !== copies[i])) return null;
  return p.features;
}

/**
 * 스캔(또는 재계산) 결과를 스탬프와 함께 한 트랜잭션으로 기록한다 — "언제 어떤 입력에서
 * 계산했나" 가 한 덩어리다(adr/0001 결정 1). 통째로 다시 쓰지만 보존 규칙은 upsert 하나:
 * 같은 slug 는 덮고, 다른 slug 의 행은 그대로 남는다.
 */
export function recordProjectScan(dataDir: string, proj: Project, features: FeatureT[]): void {
  const prev = loadDoc(dataDir);
  const stamps = proj.copies.map((repo) => ({ repo, head: headCommit(repo) }));
  const row = { slug: proj.slug, path: proj.path, copies: proj.copies, stamps, features };
  const others = (prev?.projects ?? []).filter((p) => p.slug !== proj.slug);
  const doc: SnapshotDocT = {
    version: 1,
    scannedAt: new Date().toISOString(),
    projects: [...others, row].sort((a, b) => a.slug.localeCompare(b.slug)),
  };
  mkdirSync(dataDir, { recursive: true });
  const file = snapshotPath(dataDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc));
  renameSync(tmp, file); // 원자적 교체 — 읽는 쪽이 절반 파일을 볼 수 없게
  memo.set(dataDir, doc);
}

/**
 * 단일 프로젝트 스냅샷 갱신(T05) — slug 로 해당 프로젝트만 재계산해 메모리·디스크에 반영한다.
 * 다른 프로젝트는 건드리지 않는다(증분 write-through).
 */
export function updateProjectSnapshot(dataDir: string, slug: string, roots: readonly string[]): void {
  const projects = discoverProjects([...roots]);
  const project = projects.find((p) => p.slug === slug);
  if (!project) return;
  const features = readFeatures([...project.copies]);
  recordProjectScan(dataDir, project, features);
}

/**
 * 무효화(`clearDiscoverCache` 와 같은 신호) — 메모리와 디스크를 다 비운다. 파일만 남겨 두면
 * 다음 적재가 낡은 값을 다시 꺼내 오므로, 지우는 것이 곧 무효화이다. 다음 요청이 전체를 다시
 * 스캔해 다시 기록한다(증분 반영은 T05).
 */
export function clearSnapshot(): void {
  for (const dataDir of memo.keys()) {
    rmSync(snapshotPath(dataDir), { force: true });
  }
  memo.clear();
}

/** 메모리 캐시만 비운다 (재시작 시뮬레이션용). 디스크 스냅샷 파일은 보존한다. */
export function clearSnapshotMemory(): void {
  memo.clear();
}

export interface SnapshotStampInfo {
  slug: string;
  copies: string[];
  stamps: { repo: string; head: string | null }[];
}

/** 디스크 스냅샷에 기록된 stamps 및 copies 사본 구성을 반환한다. */
export function readSnapshotStamps(dataDir: string): SnapshotStampInfo[] | null {
  const doc = loadDoc(dataDir);
  if (!doc) return null;
  return doc.projects.map((p) => ({
    slug: p.slug,
    copies: p.copies,
    stamps: p.stamps,
  }));
}


/** 스냅샷에서 사라진 discover 프로젝트 하나를 제거한다. 목록 수준 변화다(T04). */
function removeProjectScan(dataDir: string, slug: string): void {
  const prev = loadDoc(dataDir);
  if (!prev || !prev.projects.some((p) => p.slug === slug)) return;
  const doc: SnapshotDocT = {
    ...prev,
    projects: prev.projects.filter((p) => p.slug !== slug),
  };
  const file = snapshotPath(dataDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(doc));
  renameSync(tmp, file);
  memo.set(dataDir, doc);
}

export interface SnapshotRevalidationResult {
  changedProjects: string[];
  projectsChanged: boolean;
}

const sameCopies = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((copy, i) => copy === b[i]);

const sameStamps = (
  saved: SnapshotStampInfo["stamps"],
  currentCopies: readonly string[],
): boolean => {
  if (saved.length !== currentCopies.length) return false;
  return currentCopies.every((repo, i) => saved[i]?.repo === repo && saved[i]?.head === headCommit(repo));
};

/**
 * 부팅 직후 현재 discover/HEAD 와 영구 스냅샷을 대조한다(T04).
 * 변경이 없으면 파일을 건드리지 않는다. 새/변경 프로젝트만 readFeatures 로 다시 계산하고,
 * 계산이 끝난 뒤 recordProjectScan 이 현재 HEAD 를 새 스탬프로 기록한다.
 */
export function revalidateSnapshot(
  dataDir: string,
  roots: readonly string[],
): SnapshotRevalidationResult {
  if (!loadDoc(dataDir)) return { changedProjects: [], projectsChanged: false };

  const currentProjects = discoverProjects([...roots]);
  const saved = readSnapshotStamps(dataDir) ?? [];
  const currentBySlug = new Map(currentProjects.map((project) => [project.slug, project]));
  const savedBySlug = new Map(saved.map((project) => [project.slug, project]));

  let projectsChanged = false;
  const changedProjects: string[] = [];

  for (const savedProject of saved) {
    if (!currentBySlug.has(savedProject.slug)) {
      removeProjectScan(dataDir, savedProject.slug);
      projectsChanged = true;
    }
  }

  for (const project of currentProjects) {
    const previous = savedBySlug.get(project.slug);
    if (!previous || !sameCopies(previous.copies, project.copies) || !sameStamps(previous.stamps, project.copies)) {
      const features = readFeatures([...project.copies]);
      recordProjectScan(dataDir, project, features);
      changedProjects.push(project.slug);
      if (!previous) projectsChanged = true;
    }
  }

  return { changedProjects, projectsChanged };
}
