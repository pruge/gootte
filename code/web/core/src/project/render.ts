import type { PlanItem, PlanRationale } from "@gootte/contract";

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
function mark(n: number): string {
  return n >= 1 && n <= 10 ? CIRCLED[n - 1]! : `${n}.`;
}

/** 순수 — plan + rationale → "개발해야 할 순서(full) + 왜" 텍스트(사용자 샘플 형태). */
export function renderPlan(plan: PlanItem[], rationale: PlanRationale[], project: string): string {
  const rByInit = new Map(rationale.map((r) => [r.initiative, r]));
  const out: string[] = [`# 개발해야 할 순서 (full) — ${project}`, ""];

  for (const p of plan) {
    const now = p.now ? "▶ NOW  " : "       ";
    const track = p.track ? ` (${p.track})` : "";
    const done = p.completeOn ? ` [${p.completeOn}]` : "";
    out.push(`${now}${mark(p.order)} ${p.initiative}${track} — ${p.status}${done}`);
    if (p.subSteps.length) out.push(`         할일: ${p.subSteps.join(" · ")}`);
    if (p.deps.length) out.push(`         의존: ${p.deps.join(", ")}`);
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
