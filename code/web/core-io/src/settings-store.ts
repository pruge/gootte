import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Settings, type Settings as SettingsT, type SettingsUpdateRequest } from "@gootte/contract";

/**
 * 설정 저장소 — gootte 자기 저장소(`GOOTTE_DATA_DIR`) 안의 `settings.json` 하나.
 *
 * INV-5 가 저장을 허락하는 칸이다: 감시 루트와 firstmate 홈은 **어디 문서에도 적혀 있지 않고
 * 사람만 아는 값**이라 저장할 자격이 있다. 반면 "경로가 존재하는가" 는 FS 를 다시 보면 나오는
 * 사실이라 여기 한 칸도 없다(INV-1) — 응답 때마다 `dirExists` 로 다시 본다(INV-3).
 * 계획 저장소(`plan-store.ts`)와 같은 자리를 쓰는 이유도 그렇다 — 사람이 정한 것이 모이는 곳은
 * 하나뿐이어야 한다.
 */

/** 저장 파일 — `<dataDir>/settings.json`. plan.db 와 같은 부모. */
export function settingsFile(dataDir: string): string {
  return join(dataDir, "settings.json");
}

/**
 * 경로 입력 정규화 — trim · `~` 전개 · 절대 경로화. 결정적(INV-4).
 * 🔴 상대 경로는 조용히 어딘가에 붙이지 않고 **거절한다** — 붙여 넣은 자리(프로세스 CWD)마다
 * 다른 값이 되는 것은 설정값으로 자격이 없다. 오류 메시지는 그대로 화면까지 올라간다.
 */
export function normalizeDirPath(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") throw new Error("경로가 비었습니다");
  const expanded = trimmed.startsWith("~")
    ? join(homedir(), trimmed.slice(1))
    : trimmed;
  if (!expanded.startsWith("/")) {
    throw new Error(`절대 경로여야 합니다: ${trimmed}`);
  }
  return resolve(expanded);
}

/** 경로가 실제로 디렉토리인가 — 응답 때마다 다시 본다(INV-3). 저장하지 않는다. */
export function dirExists(p: string | null): boolean {
  if (!p) return false;
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** firstmate 홈 후보 — 호스트에 실제로 있는지 검사할 자리들. */
export function defaultFirstmateHomeCandidates(): string[] {
  return [join(homedir(), "Documents", "ai2", "firstmate2")];
}

/**
 * firstmate 홈 placeholder 추천 — 호스트 실측(존재하는 폴더)만 준다. 저장하지 않는다(INV-1) —
 * 응답 때마다 다시 계산되는 추천일 뿐, 값이 아니다. 후보가 하나도 없으면 null(placeholder 생략).
 * `candidates` 는 테스트가 실제 host 경로 대신 임시 디렉토리를 주입할 수 있게 하는 자리.
 */
export function suggestFirstmateHome(
  candidates: string[] = defaultFirstmateHomeCandidates(),
): string | null {
  return candidates.find((p) => dirExists(p)) ?? null;
}

const DEFAULTS: SettingsT = { firstmateHome: null };

/**
 * 설정 읽기 — 파일이 없으면 기본값(전부 null). 소비처는 null 이면 기존 기본값(env·플랫폼)으로
 * 떨어진다. JSON 이 망가진 것은 빈 설정으로 위장하지 않고 던진다 — "사용자가 지운 것" 과
 * "저장소가 고장 난 것" 을 같게 그리면 화면이 거짓말을 한다.
 */
export function readSettings(dataDir: string): SettingsT {
  const file = settingsFile(dataDir);
  if (!existsSync(file)) return { ...DEFAULTS };
  return Settings.parse(JSON.parse(readFileSync(file, "utf8")));
}

/**
 * 설정 쓰기(merge) — 들어온 키만 갈아 끼운다. `undefined` = 무변경, `null` = 지움(unset),
 * 문자열 = 교체(정규화는 호출자 — backend — 가 이미 끝낸 값이라 여기선 믿는다).
 * 임시 파일 → rename 으로 통째로 교체한다: 반쯤 쓰인 JSON 읽기를 못 하게.
 */
export function writeSettings(
  dataDir: string,
  update: Partial<Pick<SettingsUpdateRequest, "firstmateHome">>,
): SettingsT {
  const current = readSettings(dataDir);
  const next: SettingsT = {
    firstmateHome:
      update.firstmateHome === undefined ? current.firstmateHome : update.firstmateHome,
  };
  mkdirSync(dataDir, { recursive: true });
  const file = settingsFile(dataDir);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  renameSync(tmp, file);
  return next;
}
