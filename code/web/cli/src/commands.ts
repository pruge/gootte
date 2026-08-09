import { discoverProjects } from "@gootte/core-io";

/** CLI 명령 로직(순수 배선). main.ts 가 argv 파싱, 여기가 wiring: IO → core → text. */

export function discoverText(roots: string[]): string {
  const found = discoverProjects(roots);
  if (found.length === 0) return "(프로젝트 없음)";
  return found.map((p) => `${p.slug}\t${p.path}`).join("\n");
}
