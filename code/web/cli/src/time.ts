/**
 * 시간 기록 — state.json 모드(bin/gootte 가 v2 state.json 을 발견해 위임, T05).
 *
 * 🔴 검증 규칙은 bash(bin/gootte cmd_start/end/pause/resume/cancel/drop)의 승계다 —
 * 어긋나면 화면과 터미널이 다른 말을 한다(the-terminal-agrees-with-the-screen):
 * - 끝난 티켓의 start 금지 / 미시작 티켓의 end·cancel 금지
 * - 일시중단 중 end 금지(resume 먼저) / 재개 안 된 pause 상태에서 pause 재금지
 * - cancel 은 레코드 삭제(MD Time: 줄 삭제의 대응물) / drop 은 statusRaw wontfix
 *
 * 🔴 레코드는 **메인 프로젝트**의 state.json 에 기록한다(D4) — cwd 가 worktree 면
 * `.gootte/config.json`(`mainProject`)으로 메인을 찾고, 없으면 `.git` 이 파일인
 * worktree 로 판정해 `git rev-parse --git-common-dir` 로 추론해 config.json 을 생성한다(B3).
 * 기록 뒤 `recalcProjectState` 로 배지 파생 캐시도 같이 갱신한다.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import type { TicketTimeRecord } from "@gootte/contract";
import {
  readFeaturesWithTime,
  recalcProjectState,
  readTicketRecords,
  removeTicketRecord,
  upsertTicketRecord,
} from "@gootte/core-io";
import { CliError } from "./args";

/** `--at` 해석 — bash `resolve_time` 의 포트. ISO8601(그대로) 또는 상대시간(과거로). */
export function resolveTime(at: string | undefined, now: Date = new Date()): string {
  if (at === undefined || at.trim() === "") return fmtEpoch(now);
  const arg = at.trim();
  if (arg.includes("T")) return arg; // ISO8601 — verbatim
  const total = parseRelative(arg); // 초
  return fmtEpoch(new Date(now.getTime() - total * 1000));
}

/** `resolve_drop_date` 의 포트 — drop 이 남길 `YYYY-MM-DD HH:mm`. */
export function resolveDropDate(at: string | undefined, now: Date = new Date()): string {
  const iso = resolveTime(at, now);
  return iso.slice(0, 16).replace("T", " ");
}

/** bash `fmt_epoch` 포트 — `YYYY-MM-DDTHH:mm:ss+09:00` (기계 로컬 오프셋). */
function fmtEpoch(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const offset = -d.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const oh = pad(Math.floor(Math.abs(offset) / 60));
  const om = pad(Math.abs(offset) % 60);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${oh}:${om}`;
}

/** bash `parse_relative` 포트 — `1h30m`·`90m`·`2h`·`1d`·`ago`/`-` 접미 수용, 과거 초로. */
function parseRelative(specRaw: string): number {
  let spec = specRaw.toLowerCase();
  spec = spec.endsWith(" ago") ? spec.slice(0, -4) : spec;
  spec = spec.startsWith("-") ? spec.slice(1) : spec;
  if (spec === "") throw new CliError(`시간 표현이 비어있습니다: ${specRaw}`);
  const re = /^([0-9]+)([smhd])(.*)$/;
  let total = 0;
  let rest = spec;
  while (true) {
    const m = re.exec(rest);
    if (!m) break;
    const num = Number(m[1]);
    const unit = m[2] as "s" | "m" | "h" | "d";
    const mult = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
    total += num * mult;
    rest = m[3]!;
  }
  if (rest !== "") throw new CliError(`이해 못한 시간 표현: ${specRaw} (예: 1h30m, 90m, 2h, 1d)`);
  return total;
}

/**
 * 메인 프로젝트 루트 해소 — cwd 가 worktree 면 config.json 으로, 없으면 git 으로 추론해 생성.
 * 🔴 생성하는 파일은 자기 `.gootte/` 네임스페이스 안이다(INV-2 예외).
 */
export function resolveMainRoot(cwd: string = process.cwd()): string {
  const config = join(cwd, ".gootte", "config.json");
  if (existsSync(config)) {
    try {
      const mainProject = (JSON.parse(readFileSync(config, "utf8")) as { mainProject?: string }).mainProject;
      if (mainProject && existsSync(mainProject)) return mainProject;
    } catch {
      // 깨진 config — 아래 추론으로 회복한다
    }
  }
  const main = inferMainRoot(cwd);
  if (main !== null) {
    mkdirSync(join(cwd, ".gootte"), { recursive: true });
    writeFileSync(config, JSON.stringify({ mainProject: main }, null, 2) + "\n");
    return main;
  }
  return cwd; // 메인에서 실행 — 자기 state.json 이 곧 대상
}

/** worktree(`.git` 이 파일)면 git-common-dir 의 부모로 메인을 추론한다(B3). 메인이면 null. */
function inferMainRoot(cwd: string): string | null {
  const dotGit = join(cwd, ".git");
  if (!existsSync(dotGit)) return null;
  // 🔴 `.git` 이 **디렉토리**면 여기가 메인이다 — 파일(= gitdir 포인터)일 때만 worktree.
  try {
    if (!readFileSync(dotGit, "utf8").startsWith("gitdir:")) return null; // 디렉토리면 여기서 EISDIR — 아래 catch 가 null 로
  } catch {
    return null; // 디렉토리(EISDIR) 포함 — 메인에서 실행 중
  }
  try {
    const common = execFileSync("git", ["-C", cwd, "rev-parse", "--git-common-dir"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const abs = resolve(cwd, common);
    // <메인>/.git/worktrees/<이름> → <메인>
    if (abs.endsWith("/.git") || abs.includes("/.git/")) return join(abs.split("/.git")[0]!);
  } catch {
    return null;
  }
  return null;
}

interface TimeTarget {
  root: string;
  key: string;
}

function target(root: string, feature: string, ticket: string): TimeTarget {
  const key = `${feature}/${ticket}`;
  const num = ticket.replace(/^T/i, "");
  const ticketsFile = join(root, "docs", "features", feature, "tickets", `T${num}.md`);
  const issuesDir = join(root, "docs", "features", feature, "issues");
  const exists =
    existsSync(ticketsFile) ||
    (existsSync(issuesDir) && readdirSync(issuesDir).some((f) => f.startsWith(num) && f.endsWith(".md")));
  if (!exists) {
    throw new CliError(
      `티켓 파일을 찾을 수 없습니다:\n  신관례: ${ticketsFile}\n  구관례: ${issuesDir}/${num}-*.md`,
    );
  }
  return { root, key };
}

/** 지금 레코드를 다시 읽는다 — 명령마다 파일이 바뀌므로(target 스냅샷 금지). */
function current(root: string, key: string): TicketTimeRecord | undefined {
  return readTicketRecords(root)[key];
}

function requireStarted(rec: TicketTimeRecord | undefined, what: string): TicketTimeRecord {
  if (!rec || rec.startedAt === null) {
    throw new CliError(`시작되지 않은 티켓입니다(레코드가 없음): ${what}`);
  }
  return rec;
}

/** 시간 명령 실행 — main.ts 가 `time <cmd> <기능> <티켓> [--at <TIME>]` 형태로 넘긴다. */
export function runTimeCommand(argv: readonly string[], cwd: string = process.cwd()): string {
  const [cmd, feature, ticketRaw] = argv;
  if (!cmd || !feature || !ticketRaw) throw new CliError("usage: gootte time <start|pause|resume|end|cancel|drop> <기능> <티켓> [--at <TIME>]");
  const atFlag = argv.indexOf("--at");
  const at = atFlag >= 0 ? argv[atFlag + 1] : undefined;
  const root = resolveMainRoot(cwd);
  const t = target(root, feature, ticketRaw);
  const now = new Date();
  const tCurrent = (key: string): TicketTimeRecord | undefined => current(root, key);

  switch (cmd) {
    case "start": {
      const existing = tCurrent(t.key);
      if (existing) {
        if (existing.finishedAt !== null) {
          throw new CliError(`이미 끝난 티켓의 시작 시간은 바꿀 수 없습니다: ${t.key}`);
        }
        if (existing.startedAt !== null) {
          throw new CliError(`이미 시작된 티켓입니다: ${t.key} (--at 갱신은 bash CLI --update 사용)`);
        }
      }
      // start 는 처음 기록이다 — 빈 레코드를 명시해 만든다(기존 흔적이 있으면 위에서 걸렀다).
      upsertTicketRecord(root, t.key, { startedAt: resolveTime(at, now), finishedAt: null, pauses: [] });
      recalcBadge(root);
      return `${t.key} 시작 기록`;
    }
    case "pause": {
      const rec = requireStarted(tCurrent(t.key), t.key);
      if (rec.finishedAt !== null) throw new CliError(`이미 끝난 티켓입니다: ${t.key}`);
      if (rec.pauses.some((p) => p.resumedAt === null)) {
        throw new CliError(`이미 일시중단된 티켓입니다: ${t.key}`);
      }
      upsertTicketRecord(root, t.key, {
        pauses: [...rec.pauses, { pausedAt: resolveTime(at, now), resumedAt: null }],
      });
      recalcBadge(root);
      return `${t.key} 일시중단 기록`;
    }
    case "resume": {
      const rec = requireStarted(tCurrent(t.key), t.key);
      if (rec.finishedAt !== null) throw new CliError(`이미 끝난 티켓입니다: ${t.key}`);
      const open = rec.pauses.find((p) => p.resumedAt === null);
      if (!open) throw new CliError(`일시중단 상태가 아닙니다(시작 전이거나 이미 재개됨): ${t.key}`);
      const pauses = rec.pauses.map((p) => (p.resumedAt === null ? { ...p, resumedAt: resolveTime(at, now) } : p));
      upsertTicketRecord(root, t.key, { pauses });
      recalcBadge(root);
      return `${t.key} 재개 기록`;
    }
    case "end": {
      const rec = requireStarted(tCurrent(t.key), t.key);
      if (rec.finishedAt !== null) throw new CliError(`이미 끝난 티켓입니다(finished= 가 이미 있음): ${t.key}`);
      if (rec.pauses.some((p) => p.resumedAt === null)) {
        throw new CliError(`일시중단 상태입니다 — resume 먼저: ${t.key}`);
      }
      upsertTicketRecord(root, t.key, { finishedAt: resolveTime(at, now) });
      recalcBadge(root);
      return `${t.key} 완료 기록`;
    }
    case "cancel": {
      const rec = requireStarted(tCurrent(t.key), t.key);
      if (rec.finishedAt !== null) throw new CliError(`이미 끝난 티켓은 취소할 수 없습니다: ${t.key}`);
      if (rec.pauses.some((p) => p.resumedAt === null)) {
        throw new CliError(`이미 작업을 시작(paused 있음)한 티켓은 취소할 수 없습니다: ${t.key}`);
      }
      removeTicketRecord(root, t.key); // MD Time: 줄 삭제의 대응물
      recalcBadge(root);
      return `${t.key} 시작 취소(레코드 삭제)`;
    }
    case "drop": {
      const rec = tCurrent(t.key);
      if (rec?.statusRaw?.startsWith("wontfix")) {
        throw new CliError(`이미 폐기됨: ${t.key}`);
      }
      upsertTicketRecord(root, t.key, {
        // 기존 시작·완료 기록 보존 — drop 은 상태만 바꾼다(bash drop_file 이 Time: 줄을 안 건드리는 것과 동일)
        startedAt: rec?.startedAt ?? null,
        finishedAt: rec?.finishedAt ?? null,
        pauses: rec?.pauses ?? [],
        statusRaw: `wontfix (${resolveDropDate(at, now)})`,
      });
      recalcBadge(root);
      return `${t.key} 폐기 기록`;
    }
    default:
      throw new CliError(`알 수 없는 시간 명령: ${cmd}`);
  }
}

/** 배지 파생 캐시 갱신 — 기록 뒤 같은 트랜잭션의 마지막 걸음(T05).
 * 🔴 레코드 조인(`readFeaturesWithTime`) 뒤의 판정으로 계산한다 — 기록 직후 배지가
 * 방금 바뀐 상태를 반영해야 stale 뷰가 아니다(INV-3, 실측: 조인 안 한 계산은 완료 티켓을 놓쳤다). */
function recalcBadge(root: string): void {
  try {
    recalcProjectState(root, readFeaturesWithTime([root], root));
  } catch {
    // 배지는 파생물 — 재계산 실패가 기록을 막지 않는다(INV-U1). 다음 읽기가 다시 계산한다.
  }
}
