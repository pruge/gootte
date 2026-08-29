/**
 * firstmate 홈 백로그(`data/backlog.md`, tasks-axi) 파서 — 문자열 → 구조. 순수·결정적(INV-4).
 * 서식 SoT 는 firstmate 자신(`bin/fm-tasks-axi-lib.sh`) — 여기는 그 출력을 읽기만 한다(INV-2).
 *
 * 🔴 `## Archived <date>` 헤딩(`data/done-archive.md`, tasks-axi 가 오래된 done 항목을 옮겨
 * 두는 자리)도 `done` 절로 받는다(tauri-desktop-app T05 검수) — 조인(`joinTicketBacklog`)이
 * 살아있는 `backlog.md` 하나만 보면, 완료된 하위 티켓이 아카이빙되는 순간 조인이 끊겨 완료
 * 표시가 사라진다(INV-1·INV-2·INV-4 는 그대로: 캐시 없이 두 파일을 매번 다시 읽어 병합할
 * 뿐이다 — `code/web/core-io/src/backlog.ts` 참고).
 */

export type BacklogSection = "in_flight" | "queued" | "done";

/** 백로그 한 줄(+ 딸린 들여쓴 메모) — `<parent>-t<NN>` 자식 작업도 부모 작업도 같은 모양. */
export interface BacklogTaskDoc {
  id: string; // 작업 id verbatim(`gootte-tauri-t04`)
  checked: boolean; // `- [x]` 인가
  section: BacklogSection; // 소속 절(`## In flight`·`## Queued`·`## Done`)
  repo: string | null; // `(repo: gootte)` 값
  url: string | null; // 줄에 있는 첫 URL(PR·머지 링크 등) verbatim
  since: string | null; // `(since|merged|done: ...)` 값 verbatim
  note: string; // 줄 아래 들여쓴 메모(부모 작업의 "Artifacts: ..." 가 여기 온다) — 없으면 ""
}

const SECTION_HEADING: Readonly<Record<string, BacklogSection>> = {
  "In flight": "in_flight",
  Queued: "queued",
  Done: "done",
};
const ARCHIVED_HEADING = /^Archived\b/;
const HEADING = /^##\s+(.+?)\s*$/;

/** 헤딩 텍스트 → 절. `Archived 2026-08-24` 같은 done-archive.md 헤딩도 done 으로 받는다. */
function sectionForHeading(heading: string): BacklogSection | null {
  return SECTION_HEADING[heading] ?? (ARCHIVED_HEADING.test(heading) ? "done" : null);
}
const TASK_LINE = /^-\s\[([ xX])\]\s+(\S+)\s-\s(.*)$/;
const REPO_TAG = /\(repo:\s*([^)]+)\)/;
const DATE_TAG = /\((?:since|merged|done):?\s*([^)]+)\)/;
const URL = /(https?:\/\/\S+)/;
const INDENTED = /^[ \t]+\S/;
const BLANK = /^\s*$/;

/**
 * 백로그 전문 → 작업 목록. 절 헤딩이 없는 줄 위의 작업은 세지 않는다(소속을 모르는 채로
 * 섞으면 상태 조인이 추측이 된다) — 헤딩을 먼저 만나야 작업이 쌓이기 시작한다.
 * 들여쓴 줄은 바로 위 작업의 메모로 붙는다 — `joinTicketBacklog` 가 부모 작업 하나를
 * 그 메모 속 `docs/features/<slug>/` 문구로 찾아낸다(D4 `<parent>-t<NN>` 규약).
 */
export function parseBacklog(content: string): BacklogTaskDoc[] {
  const tasks: BacklogTaskDoc[] = [];
  let section: BacklogSection | null = null;
  let current: BacklogTaskDoc | null = null;

  for (const line of content.split("\n")) {
    const headingMatch = HEADING.exec(line);
    if (headingMatch) {
      section = sectionForHeading(headingMatch[1] as string);
      current = null;
      continue;
    }
    const taskMatch = TASK_LINE.exec(line);
    if (taskMatch) {
      const [, checkedRaw, id, rest] = taskMatch as unknown as [string, string, string, string];
      current = null;
      if (section === null) continue; // 소속 절을 모르는 작업은 세지 않는다
      const task: BacklogTaskDoc = {
        id,
        checked: checkedRaw.toLowerCase() === "x",
        section,
        repo: REPO_TAG.exec(rest)?.[1]?.trim() ?? null,
        url: URL.exec(rest)?.[1] ?? null,
        since: DATE_TAG.exec(rest)?.[1]?.trim() ?? null,
        note: "",
      };
      tasks.push(task);
      current = task;
      continue;
    }
    if (current && INDENTED.test(line)) {
      const trimmed = line.trim();
      current.note = current.note ? `${current.note}\n${trimmed}` : trimmed;
    } else if (!BLANK.test(line)) {
      // 빈 줄은 메모 블록을 끊지 않는다 — 실물 백로그의 작업 메모는 문단 사이에 빈 줄이 낀다.
      // 끊는 것은 헤딩·작업 줄(위에서 continue)과 들여쓰기 없는 비어 있지 않은 줄뿐이다.
      current = null;
    }
  }
  return tasks;
}
