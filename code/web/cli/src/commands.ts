import type { NextResult, PlanMismatch, PlanOrder, TicketKind } from "@gootte/contract";
import { computeMismatches, computeNext } from "@gootte/core";
import {
  defaultPlanDataDir,
  defaultProjectRoots,
  discoverProjects,
  dropOrder,
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

const KIND_KO_TO_EN: Record<string, TicketKind> = {
  "계획": "planned",
  "틈틈이": "interstitial",
  "순서밖": "out_of_order",
};
const KIND_EN_TO_KO: Record<TicketKind, string> = {
  planned: "계획",
  interstitial: "틈틈이",
  out_of_order: "순서밖",
};
const KIND_VALUES = new Set<string>(Object.values(KIND_KO_TO_EN));

function parseKind(raw: string): TicketKind {
  const kind = KIND_KO_TO_EN[raw] ?? raw;
  if (!KIND_VALUES.has(kind)) {
    throw new CliError(`--kind 값이 올바르지 않다: ${raw} (계획|틈틈이|순서밖)`);
  }
  return kind as TicketKind;
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
      'usage: gootte set <프로젝트> <기능>/<번호> [--step 숫자] [--kind 계획|틈틈이|순서밖] --why "…"',
    );
  }
  const why = requireWhy(flags);
  const step = flagNumber(flags, "step");
  if (step !== undefined && !Number.isInteger(step)) throw new CliError("--step 은 정수여야 한다");
  const rawKind = flagString(flags, "kind");
  const kind = rawKind === undefined ? undefined : parseKind(rawKind);
  const entry = setTicketOrder(dataDir, { project, feature: parsed.feature, ticket: parsed.ticket, step, kind, why });
  return `${entry.project} ${entry.feature}/${entry.ticket} → step=${entry.step} kind=${KIND_EN_TO_KO[entry.kind]} — ${entry.why}`;
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
    lines.push(`  step=${t.step} ${t.feature}/${t.ticket} [${KIND_EN_TO_KO[t.kind]}] — ${t.why}`);
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
