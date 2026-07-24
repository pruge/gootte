import { basename } from "node:path";
import { buildPlan, renderPlan, renderLineage } from "@gootte/core";
import { loadProjectState, emitDigest, discoverProjects } from "@gootte/core-io";

/** T8 — CLI 명령 로직(순수 배선). main.ts 가 argv 파싱, 여기가 wiring: IO → core → text. */

export function planText(repoPath: string): string {
  const { state, gitSignals } = loadProjectState(repoPath);
  const { plan, rationale } = buildPlan({ state, gitSignals });
  return renderPlan(plan, rationale, basename(repoPath), state);
}

/** supersede 체인 + drop 텍스트 (결정적·verbatim, INV-4). */
export function lineageText(repoPath: string): string {
  const { state } = loadProjectState(repoPath);
  return renderLineage(state, basename(repoPath));
}

export function writeDigest(repoPath: string): string {
  return emitDigest(repoPath, planText(repoPath));
}

export function discoverText(roots: string[]): string {
  const found = discoverProjects(roots);
  if (found.length === 0) return "(cling 프로젝트 없음)";
  return found.map((p) => `${p.slug}\t${p.path}`).join("\n");
}
