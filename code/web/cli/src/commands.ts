import type { ExtraEntry, ExtraListItem, NextResult, PlanMismatch, PlanOrder } from "@gootte/contract";
import { annotateExtraExistence, computeMismatches, computeNext } from "@gootte/core";
import {
  addExtra,
  defaultPlanDataDir,
  defaultProjectRoots,
  discoverProjects,
  doneExtra,
  dropOrder,
  listExtra,
  migratePlanDb,
  pruneExtra,
  readFeatures,
  readPlanOrder,
  setFeatureOrder,
  setTicketOrder,
} from "@gootte/core-io";
import { CliError, parseArgs, parseTicketRef } from "./args";

/** CLI 명령 로직(순수 배선). main.ts 가 argv 를 명령별로 넘기고, 여기가 wiring: IO → core → text. */

export function discoverText(roots: string[]): string {
  const found = discoverProjects(roots);
  if (found.length === 0) return "(프로젝트 없음)";
  return found.map((p) => `${p.slug}\t${p.path}`).join("\n");
}

/** 프로젝트 slug → 저장소 경로. `discover` 와 같은 뿌리(cwd + `GOOTTE_ROOTS` 기본값)에서 찾는다. */
export function resolveProjectPath(project: string, cwd: string = process.cwd()): string | null {
  const found = discoverProjects([cwd, ...defaultProjectRoots()]);
  return found.find((p) => p.slug === project)?.path ?? null;
}

function requireWhy(flags: Record<string, string | boolean>): string {
  const why = flags.why;
  if (typeof why !== "string" || !why.trim()) throw new CliError('--why 가 필요하다 — "…" 로 한 줄');
  return why;
}

function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagNumber(flags: Record<string, string | boolean>, key: string): number | undefined {
  const raw = flagString(flags, key);
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (Number.isNaN(n)) throw new CliError(`--${key} 는 숫자여야 한다: ${raw}`);
  return n;
}

export function setFeatureText(argv: readonly string[], dataDir = defaultPlanDataDir()): string {
  const { positional, flags } = parseArgs(argv);
  const [project, feature] = positional;
  if (!project || !feature) {
    throw new CliError('usage: gootte set-feature <프로젝트> <기능> --track <트랙> --rank <숫자> --why "…"');
  }
  const why = requireWhy(flags);
  const track = flagString(flags, "track");
  const rank = flagNumber(flags, "rank");
  const entry = setFeatureOrder(dataDir, { project, feature, track, rank, why });
  return `${entry.project} ${entry.feature} → track=${entry.track} rank=${entry.rank} — ${entry.why}`;
}

export function setTicketText(argv: readonly string[], dataDir = defaultPlanDataDir()): string {
  const { positional, flags } = parseArgs(argv);
  const [project, ref] = positional;
  const parsed = ref ? parseTicketRef(ref) : null;
  if (!project || !parsed) {
    throw new CliError(
      'usage: gootte set <프로젝트> <기능>/<번호> [--step 숫자] --why "…"',
    );
  }
  const why = requireWhy(flags);
  const step = flagNumber(flags, "step");
  if (step !== undefined && !Number.isInteger(step)) throw new CliError("--step 은 정수여야 한다");
  const entry = setTicketOrder(dataDir, { project, feature: parsed.feature, ticket: parsed.ticket, step, why });
  return `${entry.project} ${entry.feature}/${entry.ticket} → step=${entry.step} — ${entry.why}`;
}

/**
 * `db migrate` — 기존 DB 를 지금 스키마로 올린다(spec §DB 는 잃어도 되는 물건, 버전 이력 없이
 * 지금 스키마에 맞추는 한 자리). 이미 최신이면 바뀐 게 없다고 그대로 말한다(멱등).
 */
export function dbMigrateText(dataDir = defaultPlanDataDir()): string {
  const { addedColumns, droppedColumns } = migratePlanDb(dataDir);
  if (addedColumns.length === 0 && droppedColumns.length === 0) return "이미 최신이다 — 바꾼 것 없음.";
  const lines = ["스키마를 지금 코드에 맞춰 올렸다:"];
  for (const c of addedColumns) lines.push(`  + ${c}`);
  for (const c of droppedColumns) lines.push(`  - ${c}`);
  return lines.join("\n");
}

export function dropText(argv: readonly string[], dataDir = defaultPlanDataDir()): string {
  const { positional } = parseArgs(argv);
  const [project, ref] = positional;
  if (!project || !ref) throw new CliError("usage: gootte drop <프로젝트> <기능>[/<번호>]");
  const parsed = parseTicketRef(ref);
  dropOrder(dataDir, project, parsed ? parsed.feature : ref, parsed?.ticket);
  return `dropped: ${project} ${ref}`;
}

function readOrderWithMismatches(project: string, dataDir: string): PlanOrder & { mismatches: PlanMismatch[] } {
  const plan = readPlanOrder(dataDir, project);
  const path = resolveProjectPath(project);
  const features = path ? readFeatures(path) : [];
  return { ...plan, mismatches: computeMismatches(features, plan.tickets) };
}

const MISMATCH_LABEL: Record<PlanMismatch["kind"], string> = {
  ticket_without_step: "단계 없는 티켓",
  step_without_ticket: "티켓 없는 단계",
  done_but_staged: "끝났는데 앞 단계에 남은 것",
  blocked_by_unreadable: "Blocked by 못 읽음",
};

function formatMismatches(mismatches: readonly PlanMismatch[]): string {
  if (mismatches.length === 0) return "어긋남: 없음";
  return ["어긋남:", ...mismatches.map((m) => `  [${MISMATCH_LABEL[m.kind]}] ${m.detail}`)].join("\n");
}

export function orderText(argv: readonly string[], dataDir = defaultPlanDataDir()): string {
  const { positional, flags } = parseArgs(argv);
  const [project] = positional;
  if (!project) throw new CliError("usage: gootte order <프로젝트> [--json]");
  const result = readOrderWithMismatches(project, dataDir);
  if (flags.json) return JSON.stringify(result, null, 2);

  const lines: string[] = [`project: ${result.project}`, "", "features:"];
  if (result.features.length === 0) lines.push("  (없음)");
  for (const f of result.features) {
    lines.push(`  [${f.track}] rank=${f.rank} ${f.feature} — ${f.why}${f.whyNeedsReview ? " (확인 필요)" : ""}`);
  }
  lines.push("", "tickets:");
  if (result.tickets.length === 0) lines.push("  (없음)");
  for (const t of result.tickets) {
    lines.push(`  step=${t.step} ${t.feature}/${t.ticket} — ${t.why}`);
  }
  lines.push("", formatMismatches(result.mismatches));
  return lines.join("\n");
}

const EMPTY_REASON_LABEL: Record<NonNullable<NextResult["tracks"][number]["emptyReason"]>, string> = {
  all_blocked: "전부 막힘",
  all_claimed: "전부 임자 있음",
  mixed: "막힘·임자 있음이 섞임",
  no_steps: "이 트랙엔 계획된 단계가 없다",
  all_done: "이 트랙은 다 끝났다",
};

export function nextText(argv: readonly string[], dataDir = defaultPlanDataDir()): string {
  const { positional, flags } = parseArgs(argv);
  const [project] = positional;
  if (!project) throw new CliError("usage: gootte next <프로젝트> [--json]");
  const plan = readPlanOrder(dataDir, project);
  const path = resolveProjectPath(project);
  const features = path ? readFeatures(path) : [];
  const result = computeNext(features, plan.features, plan.tickets);
  if (flags.json) return JSON.stringify(result, null, 2);

  const lines: string[] = [];
  if (result.tracks.length === 0) {
    lines.push("(계획된 트랙 없음)");
  }
  for (const t of result.tracks) {
    lines.push(`[${t.track}] step=${t.step ?? "-"}`);
    if (t.tickets.length === 0) {
      lines.push(`  (없음 — ${EMPTY_REASON_LABEL[t.emptyReason ?? "no_steps"]})`);
    } else {
      for (const tk of t.tickets) lines.push(`  ${tk.feature}/${tk.ticket} ${tk.title} — ${tk.why}`);
    }
  }
  lines.push("", formatMismatches(result.mismatches));
  return lines.join("\n");
}

// ── extra — 티켓 밖에서 더 개발된 것을 잡는다(development-order/05) ──────────

export function extraAddText(argv: readonly string[], dataDir = defaultPlanDataDir()): string {
  const { positional, flags } = parseArgs(argv);
  const [project, ref, note] = positional;
  const parsed = ref ? parseTicketRef(ref) : null;
  if (!project || !parsed || !note) {
    throw new CliError('usage: gootte extra add <프로젝트> <기능>/<번호> "…" [--who 이름]');
  }
  const who = flagString(flags, "who");
  const entry = addExtra(dataDir, { project, feature: parsed.feature, ticket: parsed.ticket, note, who });
  return `#${entry.id} ${entry.project} ${entry.feature}/${entry.ticket} — ${entry.note}`;
}

function extraLine(item: ExtraListItem): string {
  const doneMark = item.done ? "[처리됨] " : "";
  const missing = item.ticketExists ? "" : " ⚠ 티켓 없음";
  const who = item.who ? ` (누가: ${item.who})` : "";
  return `${doneMark}#${item.id} ${item.project} ${item.feature}/${item.ticket}${missing} — ${item.note}${who}`;
}

/**
 * `extra` 항목들을 지금 있는 문서와 대조해 "가리키는 티켓이 있는가" 를 얹는다.
 * 항목이 여러 프로젝트를 가로지를 수 있어(project 필터 생략 시) 프로젝트별로 묶어 계산한다.
 */
function annotateExtraEntries(entries: readonly ExtraEntry[]): ExtraListItem[] {
  const byProject = new Map<string, ExtraEntry[]>();
  for (const e of entries) {
    const list = byProject.get(e.project) ?? [];
    list.push(e);
    byProject.set(e.project, list);
  }
  const items: ExtraListItem[] = [];
  for (const [project, projEntries] of byProject) {
    const path = resolveProjectPath(project);
    const features = path ? readFeatures(path) : [];
    items.push(...annotateExtraExistence(projEntries, features));
  }
  return items.sort((a, b) => a.id - b.id);
}

/**
 * `extra` / `extra --all` — 🔴 `ask` 와 같은 규약(spec §명령): 미처리가 있으면 항목마다 한 줄,
 * 없으면 **빈 문자열**(main.ts 가 빈 문자열이면 아무것도 안 찍는다 — firstmate 확인 장치가
 * 이 침묵으로 깨어난다).
 */
export function extraListText(argv: readonly string[], dataDir = defaultPlanDataDir()): string {
  const { positional, flags } = parseArgs(argv);
  const [project] = positional;
  const entries = listExtra(dataDir, { project, all: Boolean(flags.all) });
  const items = annotateExtraEntries(entries);
  if (flags.json) return JSON.stringify(items, null, 2);
  if (items.length === 0) return "";
  return items.map(extraLine).join("\n");
}

export function extraDoneText(argv: readonly string[], dataDir = defaultPlanDataDir()): string {
  const { positional } = parseArgs(argv);
  const [idRaw] = positional;
  const id = idRaw === undefined ? Number.NaN : Number(idRaw);
  if (!idRaw || Number.isNaN(id)) throw new CliError("usage: gootte extra done <id>");
  const entry = doneExtra(dataDir, id);
  return `#${entry.id} 처리됨`;
}

export function extraPruneText(argv: readonly string[], dataDir = defaultPlanDataDir()): string {
  const { flags } = parseArgs(argv);
  const before = flagString(flags, "before");
  if (!before) throw new CliError("usage: gootte extra prune --before <날짜>");
  const count = pruneExtra(dataDir, before);
  return `삭제: ${count}건`;
}
