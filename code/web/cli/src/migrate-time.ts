/**
 * `gootte migrate-time [--dry-run] [프로젝트]` — MD `Time:`/`Status:` 줄을
 * state.json v2 레코드로 이관한다(time-records-to-state-store/T06).
 *
 * 🔴 **MD 줄은 삭제하지 않는다**(캡틴 결정 2026-09-09) — 이관 후 실물 검증을 거친 뒤
 * 별도 기능에서 일괄 삭제한다. 이 명령은 읽기 파서(parseTimeLine·parseStatusLine)를
 * 그대로 쓰므로 "레코드 읽기 = MD 읽기"가 보증되면 나중의 삭제가 안전해진다.
 *
 * 🔴 사본이 여럿이면 `mergeTicketTimes`와 같은 규칙(earliest started / latest finished /
 * pause 짝맞춤)으로 합친다 — MD 계층의 병합 지식이 레코드로 **한 번** 승계된다.
 * 멱등하다 — 재실행해도 같은 값이 같은 키로 기록될 뿐 늘지 않는다.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { discoverProjects, effectiveProjectRoots, readFeaturesWithTime, writeTicketRecords, recalcProjectState } from "@gootte/core-io";
import { isTicketDoc, parseStatusLine, parseTimeLine, type TimeLine } from "@gootte/core";
import type { TicketTimeRecord } from "@gootte/contract";
import { CliError } from "./args";
import { requireProject, resolveProjectArg } from "./commands";

export interface MigrateReport {
  project: string;
  root: string;
  dryRun: boolean;
  scanned: number; // 본 티켓 파일 수
  migrated: number; // 레코드가 생긴(값이 하나라도 있는) 티켓 수
  skipped: number; // 값이 전혀 없는 티켓(레코드 없음 = 미시작)
  multiCopy: number; // 사본 병합이 일어난 티켓
  records: Record<string, TicketTimeRecord>;
  details: string[]; // 티켓별 한 줄 요청(INV-4 릴레이)
}

/** 기능 폴더의 티켓 파일 목록 — 두 관례 모두, top-level 만(readFeatures 와 같은 규칙). */
function ticketFiles(featureDir: string): { rel: string; copies: string[] }[] {
  const byRel = new Map<string, string[]>();
  for (const dir of ["tickets", "issues"]) {
    const abs = join(featureDir, dir);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      const rel = `${dir}/${name}`;
      if (!isTicketDoc(rel)) continue;
      const file = join(abs, name);
      const list = byRel.get(rel) ?? [];
      if (existsSync(file)) list.push(file);
      byRel.set(rel, list);
    }
  }
  return [...byRel.entries()].map(([rel, copies]) => ({ rel, copies }));
}

/** 두 Time 값의 병합 — core `mergeTicketTimes` 와 같은 규칙(earliest / latest / 짝맞춤). */
function mergeTimes(a: TimeLine | null, b: TimeLine): TimeLine {
  if (!a) return b;
  const started = [a.startedAt, b.startedAt].filter((x): x is string => x !== null).sort();
  const finished = [a.finishedAt, b.finishedAt].filter((x): x is string => x !== null).sort().reverse();
  const pauses = [...a.pauses, ...b.pauses].sort((x, y) => x.pausedAt.localeCompare(y.pausedAt));
  const resumed = pauses.filter((p) => p.resumedAt !== null).map((p) => p.resumedAt as string);
  const open = pauses.filter((p) => p.resumedAt === null && !resumed.includes(p.pausedAt));
  return {
    raw: a.raw ?? b.raw,
    startedAt: started[0] ?? null,
    finishedAt: finished[0] ?? null,
    pauses: open, // 재개 안 된 구간만 남는다 — 완결된 구간은 상태 파생에 불필요
  };
}

function statusRawOf(copies: string[]): string | null {
  for (const file of copies) {
    // 🔴 줄 전체 원문(`rest`)을 옮긴다 — "resolved (2026-08-08)" 의 괄호 날짜까지(INV-4 verbatim).
    const { rest } = parseStatusLine(readFileSync(file, "utf8"));
    if (rest !== null) return rest; // 첫 사본의 명시 줄이 이긴다(resolveFile 과 같은 규칙)
  }
  return null;
}

/** mergeTimes 의 쌍 병합 규칙에 맞춘 pauses 정리 — 미재개 구간만 남긴다(완결 구간은 파생 불필요). */

export function migrateTime(
  argv: readonly string[],
  cwd: string = process.cwd(),
  /** 추가 사본 뿌리(테스트 주입) — 실물은 discoverProjects 가 copies 로 묶어 준다. */
  extraRoots: string[] = [],
): MigrateReport {
  const dryRun = argv.includes("--dry-run");
  // 🔴 `<프로젝트>` 생략 시 cwd 유추(캡틴 지시 2026-09-09) — commands.ts 의 공용 해소 하나.
  const project = resolveProjectArg(argv.filter((a) => !a.startsWith("--")), cwd, "usage: gootte migrate [--dry-run] [프로젝트]");

  const found = discoverProjects([cwd, ...effectiveProjectRoots(), ...extraRoots]);
  let proj = found.find((p) => p.slug === project);
  if (!proj) {
    // cwd 가 프로젝트 안이면(예: code/web) 조상에서도 본다 — requireProject 와 같은 규율.
    try {
      const viaCwd = requireProject(project, cwd);
      proj = { ...viaCwd, slug: project };
    } catch {
      proj = undefined;
    }
  }
  if (!proj) throw new CliError(`프로젝트 없음: ${project}`);

  // 🔴 사본 전체를 본다 — worktree 안의 커밋 안 된 Time 기록도 MD 계층에서는 정방향 병합에
  // 참여했으므로 이관도 같은 집합을 본다(빠뜨리면 기록이 사라진다).
  const allCopies = [proj.path, ...proj.copies.filter((c) => c !== proj.path), ...extraRoots];

  const records: Record<string, TicketTimeRecord> = {};
  const details: string[] = [];
  let scanned = 0;
  let migrated = 0;
  let multiCopy = 0;

  const mainFeatures = join(proj.path, "docs", "features");
  for (const featureSlug of readdirSync(mainFeatures).sort()) {
    const featureDir = join(mainFeatures, featureSlug);
    // rel → 사본별 절대경로 목록. 대표 경로의 폴더 구조가 기준이고, 나머지 사본은 같은 rel 만 참여.
    const byRel = new Map<string, string[]>();
    for (const copy of allCopies) {
      const featureDirOfCopy = join(copy, "docs", "features", featureSlug);
      if (!existsSync(featureDirOfCopy)) continue;
      for (const { rel, copies } of ticketFiles(featureDirOfCopy)) {
        for (const file of copies) {
          const list = byRel.get(rel) ?? [];
          if (!list.includes(file)) list.push(file);
          byRel.set(rel, list);
        }
      }
    }
    for (const [rel, copies] of byRel) {
      scanned += 1;
      if (copies.length > 1) multiCopy += 1;
      const slug = rel.replace(/\.md$/i, "").replace(/^(issues|tickets)\//, "");
      const key = `${featureSlug}/${slug}`;
      // 사본 전체에서 Time 을 정방향 병합하고, Status 원문은 첫 사본 것이 이긴다.
      let times: TimeLine | null = null;
      for (const file of copies) {
        times = mergeTimes(times, parseTimeLine(readFileSync(file, "utf8")));
      }
      const statusRaw = statusRawOf(copies);
      // 🔴 "빈 파싱 결과"와 "기록 없음"을 구분한다 — Time: 줄이 없으면 times 는 그대로 null.
      const hasTime = times !== null && (times.startedAt !== null || times.finishedAt !== null || times.pauses.length > 0);
      if (!hasTime && statusRaw === null) {
        details.push(`- ${key} — 기록 없음(레코드 생략, 미시작)`);
        continue;
      }
      migrated += 1;
      records[key] = {
        startedAt: hasTime ? times!.startedAt : null,
        finishedAt: hasTime ? times!.finishedAt : null,
        pauses: hasTime ? times!.pauses : [],
        statusRaw,
      };
      const bits = [
        times?.startedAt ? `started=${times.startedAt}` : null,
        times?.finishedAt ? `finished=${times.finishedAt}` : null,
        times?.pauses.length ? `pauses=${times.pauses.length}` : null,
        statusRaw ? `status=${statusRaw}` : null,
      ].filter(Boolean);
      details.push(`- ${key} — ${bits.join(" · ")}`);
    }
  }

  if (!dryRun) {
    writeTicketRecords(proj.path, records);
    // 배지도 레코드 조인 기준으로 다시 — v2 전환의 마지막 걸음(T03 읽기가 이 파일을 권위로 본다).
    recalcProjectState(proj.path, readFeaturesWithTime(proj.copies, proj.path));
  }

  return { project, root: proj.path, dryRun, scanned, migrated, skipped: scanned - migrated, multiCopy, records, details };
}
