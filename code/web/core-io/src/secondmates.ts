import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 세컨드메이트 홈 명부(every-home-reports-its-status T02) — `<firstmateHome>/data/secondmates.md`
 * 에서 홈 경로를 읽어 목록을 **파생**한다. 설정 계약(`contract` 의 `firstmateHome`
 * 단수 문자열)은 건드리지 않는다 — 목록은 사용자가 정하는 값이 아니라 지도부가 이미 유지하는
 * 명부에서 재생성되는 파생물이다(INV-1).
 *
 * 🔴 결정적·LLM-free(INV-4). 🔴 명부 없음·읽기 실패는 빈 목록 — 지도부 홈만으로 계속 동작한다.
 */

/** 세컨드메이트 명부 파일 한 곳 — `<firstmateHome>/data/secondmates.md`. */
export function secondmatesFile(firstmateHome: string): string {
  return join(firstmateHome, "data", "secondmates.md");
}

// 실물 명부 줄은 한 줄에 산문이 섞여 있다:
// `- gootte-mate - 설명 (home: /…/firstmate2; scope: …; added 2026-08-26)`
// 줄 어디서든 `home:` 을 찾되 경로는 공백·`;`·`)` 앞에서 끊는다. 단독 줄
// `home: /경로` 도 같은 규칙이 받는다(상위집합). 빈 값(`home:` 로 끝)은 후보 아님.
const HOME_TOKEN = /home:\s*([^\s;)]+)/;

/**
 * 명부 내용 → 홈 경로 목록. `home:` 토큰이 있는 줄에서 경로를 명부 순 그대로 뽑고
 * (중복은 첫 번째만), 나머지 줄은 무시한다 — 명부의 산문은 지도부의 것이니 여기선 해석하지 않는다.
 */
export function parseSecondmateHomes(content: string): string[] {
  const homes: string[] = [];
  for (const line of content.split("\n")) {
    const match = HOME_TOKEN.exec(line);
    const home = match?.[1];
    if (home && !homes.includes(home)) homes.push(home);
  }
  return homes;
}

/**
 * 지도부 홈의 명부를 읽어 세컨드메이트 홈 목록을 낸다. 명부 파일이 없거나 못 읽으면 빈 목록 —
 * 예외로 죽지 않고 조용히 건너뛴다(홈 하나가 사라져도 판과 명령은 살아 있어야 한다).
 */
export function readSecondmateHomes(firstmateHome: string | null | undefined): string[] {
  if (!firstmateHome?.trim()) return [];
  try {
    return parseSecondmateHomes(readFileSync(secondmatesFile(firstmateHome), "utf8"));
  } catch {
    return [];
  }
}
