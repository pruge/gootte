import { readFileSync } from "node:fs";
import { type BacklogTaskDoc, parseBacklog } from "@gootte/core";
import { backlogFile } from "./backlog-watch";

/**
 * firstmate 홈 백로그 리더(T04) — IO 오케스트레이션만 한다: 읽어서 core 파서(`parseBacklog`)에
 * 넘긴다. 해석 규칙은 여기 없다(계층 경계, `core-io/src/features.ts` 와 같은 원리).
 *
 * 🔴 read-only(INV-2). 파생물이라 매 호출 재계산한다(INV-1·INV-3 — 캐시·스냅샷 없음).
 * 🔴 홈이 미설정이거나 백로그 파일이 아직 없으면 빈 목록 — 예외로 죽지 않는다(설정 전 화면도 서야 한다).
 */
export function readBacklogTasks(firstmateHome: string | null | undefined): BacklogTaskDoc[] {
  if (!firstmateHome?.trim()) return [];
  try {
    return parseBacklog(readFileSync(backlogFile(firstmateHome), "utf8"));
  } catch {
    return [];
  }
}
