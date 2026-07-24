import type { PlanItem, PlanRationale, Supersession } from "@gootte/contract";
import type { ProjectState } from "../state/model";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
function mark(n: number): string {
  return n >= 1 && n <= 10 ? CIRCLED[n - 1]! : `${n}.`;
}
const adrTag = (adr?: string[]): string => (adr && adr.length > 0 ? ` (${adr.join("·")})` : "");

/** 순수 — plan + rationale → "개발해야 할 순서(full) + 왜" 텍스트. state 주면 supersede 주석. */
export function renderPlan(
  plan: PlanItem[],
  rationale: PlanRationale[],
  project: string,
  state?: ProjectState,
): string {
  const rByInit = new Map(rationale.map((r) => [r.initiative, r]));
  const supByOwner = new Map<string, Supersession[]>();
  for (const s of state?.supersessions ?? []) {
    const arr = supByOwner.get(s.ledger) ?? [];
    arr.push(s);
    supByOwner.set(s.ledger, arr);
  }

  const out: string[] = [`# 개발해야 할 순서 (full) — ${project}`, ""];
  for (const p of plan) {
    const now = p.now ? "▶ NOW  " : "       ";
    const track = p.track ? ` (${p.track})` : "";
    const done = p.completeOn ? ` [${p.completeOn}]` : "";
    out.push(`${now}${mark(p.order)} ${p.initiative}${track} — ${p.status}${done}`);
    if (p.subSteps.length) out.push(`         할일: ${p.subSteps.join(" · ")}`);
    if (p.deps.length) out.push(`         의존: ${p.deps.join(", ")}`);
    for (const s of supByOwner.get(p.initiative) ?? []) {
      out.push(`         뒤엎음: ${s.old} → ${s.new}${adrTag(s.adr)}`);
    }
  }

  out.push("", "## 왜 이 순서", "");
  for (const p of plan) {
    const r = rByInit.get(p.initiative);
    if (!r) continue;
    out.push(`- ${mark(p.order)} ${p.initiative}: ${r.priorityBasis}`);
    if (r.delayCost) out.push(`     · 방치비용: ${r.delayCost}`);
    if (r.stoppingPoint) out.push(`     · ${r.stoppingPoint}`);
  }
  return out.join("\n") + "\n";
}

/** supersede 체인 + drop 텍스트 뷰 (verbatim, INV-4 — 요약 X). */
export function renderLineage(state: ProjectState, project: string): string {
  const out: string[] = [`# lineage — ${project}`, ""];

  out.push(`## supersede 체인 (${state.supersessions.length})`, "");
  for (const s of state.supersessions) {
    out.push(`- ${s.old} → **${s.new}**${adrTag(s.adr)}`);
    if (s.note) out.push(`     ${s.note}`);
  }

  out.push("", `## drop (${state.drops.length}) — 무엇이 이 todo 를 뒤엎었나`, "");
  for (const d of state.drops) {
    const init = d.initiative ? ` [${d.initiative}]` : "";
    out.push(`- ${d.todo}${init} → ${d.resolvedBy}`);
  }

  return out.join("\n") + "\n";
}
