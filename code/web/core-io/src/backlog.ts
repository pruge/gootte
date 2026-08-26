import { readFileSync } from "node:fs";
import { type BacklogTaskDoc, parseBacklog } from "@gootte/core";
import { archivedBacklogFile, backlogFile } from "./backlog-watch";
import { readSecondmateHomes } from "./secondmates";

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
 *
 * 🔴 **등록된 세컨드메이트 홈의 백로그도 함께 읽는다**(every-home-reports-its-status T02).
 * 병합 순서는 지도부(live→archived) → 세컨드메이트 홈(명부 순, 각 홈 live→archived)이고,
 * 같은 id 는 먼저 온 것이 이긴다 — 기존 live 우선 규칙의 자연스러운 확장이자 T01 의 부모 판정
 * 계약(지도부 항목이 항상 앞)을 지키는 자리다. 명부 없음·읽기 실패·경로 부재는 조용히 건너뛴다
 * — 세컨드메이트 홈 하나가 사라져도 지도부 상태는 그대로 보인다. 세컨드메이트 홈의 `projects/`
 * 는 보지 않는다 — 문서는 한 벌(spec §결정), 여기서 읽는 것은 상태뿐이다.
 */
export function readBacklogTasks(firstmateHome: string | null | undefined): BacklogTaskDoc[] {
  const seen = new Set<string>();
  const merged: BacklogTaskDoc[] = [];
  for (const home of backlogHomes(firstmateHome)) {
    // 홈 안에서 live 가 archived 를 이긴다 — 전체 목록에서 먼저 온 id 가 이기는 규칙 하나로
    // 충분하다(live → archived 순으로 편집되므로).
    const live = readOne(backlogFile(home));
    const archived = readOne(archivedBacklogFile(home));
    for (const task of [...live, ...archived]) {
      if (!seen.has(task.id)) {
        seen.add(task.id);
        merged.push(task);
      }
    }
  }
  return merged;
}

/**
 * 읽을 홈 목록 — 지도부 홈이 항상 첫 번째고(T01 부모 우선 계약), 명부에 등록된 세컨드메이트
 * 홈이 그 뒤를 따른다. 홈 미설정이면 빈 목록이다.
 */
function backlogHomes(firstmateHome: string | null | undefined): string[] {
  if (!firstmateHome?.trim()) return [];
  return [firstmateHome, ...readSecondmateHomes(firstmateHome)];
}

function readOne(path: string): BacklogTaskDoc[] {
  try {
    return parseBacklog(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}
