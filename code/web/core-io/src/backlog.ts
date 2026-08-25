import { readFileSync } from "node:fs";
import { type BacklogTaskDoc, parseBacklog } from "@gootte/core";
import { archivedBacklogFile, backlogFile } from "./backlog-watch";

/**
 * firstmate 홈 백로그 리더(T04) — IO 오케스트레이션만 한다: 읽어서 core 파서(`parseBacklog`)에
 * 넘긴다. 해석 규칙은 여기 없다(계층 경계, `core-io/src/features.ts` 와 같은 원리).
 *
 * 🔴 read-only(INV-2). 파생물이라 매 호출 재계산한다(INV-1·INV-3 — 캐시·스냅샷 없음).
 * 🔴 홈이 미설정이거나 백로그 파일이 아직 없으면 빈 목록 — 예외로 죽지 않는다(설정 전 화면도 서야 한다).
 *
 * 🔴 살아있는 `backlog.md` 뿐 아니라 **`done-archive.md`도 함께 읽어 병합한다**(tauri-desktop-app
 * T05 검수, 실제 결함: 완료된 하위 티켓이 tasks-axi 의 아카이빙으로 `backlog.md`에서 빠지면
 * `joinTicketBacklog`가 그 순간부터 조인을 못 해 완료 표시가 영구히 사라졌다). sqlite 캐시가
 * 아니라 **두 파일을 매번 다시 읽는 것**으로 고친다 — INV-1(파생물만)·INV-5(완료 여부는 저장
 * 금지 목록)를 위반하지 않으면서, 아카이빙되어도 원문이 `done-archive.md`에 남아있는 한 조인이
 * 계속 성립한다. 같은 id 가 둘 다에 있으면(있을 수 없는 상태지만) 살아있는 쪽을 우선한다 —
 * `backlog.md`가 현재 진행 상황의 더 신선한 원천이다.
 */
export function readBacklogTasks(firstmateHome: string | null | undefined): BacklogTaskDoc[] {
  if (!firstmateHome?.trim()) return [];
  const live = readOne(backlogFile(firstmateHome));
  const archived = readOne(archivedBacklogFile(firstmateHome));
  if (archived.length === 0) return live;
  const liveIds = new Set(live.map((t) => t.id));
  return [...live, ...archived.filter((t) => !liveIds.has(t.id))];
}

function readOne(path: string): BacklogTaskDoc[] {
  try {
    return parseBacklog(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}
