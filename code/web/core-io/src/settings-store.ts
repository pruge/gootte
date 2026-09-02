import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Settings, type Settings as SettingsT, type SettingsUpdateRequest } from "@gootte/contract";
import { deriveWatchRoots } from "./discover";

/**
 * 설정 저장소 — gootte 자기 저장소(`GOOTTE_DATA_DIR`) 안의 `settings.json` 하나.
 *
 * INV-5 가 저장을 허락하는 칸이다: 명시 감시 루트(`watchRoots`)와 firstmate 홈은 **어디 문서에도
 * 적혀 있지 않고 사람만 아는 값**이라 저장할 자격이 있다. 반면 "경로가 존재하는가" 는 FS 를 다시 보면 나오는
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

const DEFAULTS: SettingsT = { firstmateHome: null, watchRoots: [], blockedCopies: [], autoClose: true };

/**
 * 설정 읽기 — 파일이 없으면 기본값(전부 null). 소비처는 null 이면 기존 기본값(env·플랫폼)으로
 * 떨어진다. JSON 이 망가진 것은 빈 설정으로 위장하지 않고 던진다 — "사용자가 지운 것" 과
 * "저장소가 고장 난 것" 을 같게 그리면 화면이 거짓말을 한다.
 *
 * 🔴 `watchRoots` 키가 저장 파일에 **없으면** 여기선 건드리지 않는다 — 파생 여부 판별(`settingsHasWatchRoots`)은
 * 호출자가 raw 키 유무로 한다(per-folder-watch-roots). 그래야 "키 없음 = 파생 규칙" 과 "키 있음(빈 배열) =
 * 명시적으로 아무것도 안 보기" 를 구분할 수 있다.
 */
export function readSettings(dataDir: string): SettingsT {
  const file = settingsFile(dataDir);
  if (!existsSync(file)) return { ...DEFAULTS };
  return Settings.parse(JSON.parse(readFileSync(file, "utf8")));
}

/**
 * 저장 파일에 `watchRoots` 키가 **있는가** — 있는 것과 빈 배열은 다르다(per-folder-watch-roots):
 * 키가 없으면 파생 규칙(`resolveWatchRoots`)이 firstmate 홈에서 뿌리를 만들고, 키가 있으면(빈 배열
 * 포함) 그 값이 권위다. JSON 읽기 하나라 매 요청에 감당 가능.
 */
export function settingsHasWatchRoots(dataDir: string): boolean {
  const file = settingsFile(dataDir);
  if (!existsSync(file)) return false;
  try {
    return "watchRoots" in (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>);
  } catch {
    return false;
  }
}

/**
 * 실제 감시 뿌리 — 매 요청 다시 계산(INV-3, 파생물·결정적).
 *
 * 🔴 `watchRoots` 키가 있으면(빈 배열 포함) 그것이 권위다. 키가 없으면(최초·마이그레이션 전)
 * `deriveWatchRoots(firstmateHome)` 으로 firstmate 홈에서 뿌리를 만들고, 그래도 비면
 * `fallbackRoots`(env `GOOTTE_ROOTS` · 플랫폼 기본)로 떨어진다. firstmate 가 금지된 뒤에도
 * 감시는 사람이 명시한 `watchRoots` 가 주인이므로, 이 함수 하나가 "firstmate 구조 고정" 을 푼다.
 */
export function resolveWatchRoots(dataDir: string, fallbackRoots: string[]): string[] {
  const settings = readSettings(dataDir);
  if (settingsHasWatchRoots(dataDir)) return settings.watchRoots;
  const derived = deriveWatchRoots(settings.firstmateHome);
  if (derived.length > 0) return derived;
  return fallbackRoots;
}

/**
 * 설정 쓰기(merge) — raw JSON 을 그대로 돌려쓰므로 **들어온 키만** 갈아 끼우고 나머지(특히
 * `watchRoots` 키 부재)를 보존한다. `undefined` = 무변경, `null` = 지움(unset), 값 = 교체.
 * 정규화(절대 경로)는 호출자 — backend — 가 이미 끝낸 값이라 여기선 믿는다.
 * 임시 파일 → rename 으로 통째로 교체한다: 반쯤 쓰인 JSON 읽기를 못 하게.
 */
export function writeSettings(
  dataDir: string,
  update: Partial<
    Pick<SettingsUpdateRequest, "firstmateHome" | "watchRoots" | "blockedCopies" | "autoClose">
  >,
): SettingsT {
  const file = settingsFile(dataDir);
  const raw: Record<string, unknown> = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
    : {};
  if (update.firstmateHome !== undefined) raw.firstmateHome = update.firstmateHome;
  if (update.watchRoots !== undefined) {
    // `null` = 지움(unset) — 키 자체를 지워야 파생 규칙(`resolveWatchRoots`)이 다시 살아난다.
    // `null` 을 그대로 박으면 다음 `readSettings` 가 `Settings.parse` 에서 타입 오류를 낸다
    // (zod 기본값은 키 부재에만 적용되지 null 값엔 적용되지 않는다).
    if (update.watchRoots === null) delete raw.watchRoots;
    else raw.watchRoots = update.watchRoots;
  }
  // 차단 목록 — gootte 자기 저장소의 사용자 결정(INV-5). `<풀>/<슬롯>` 식별자 문자열이라 경로
  // 정규화는 하지 않고 그대로 둔다. `[]` 이면 명시적으로 모두 해제.
  if (update.blockedCopies !== undefined) raw.blockedCopies = update.blockedCopies;
  // 자동 완료 — 모든 티켓이 완료되면 카드를 완료 칸으로 옮길지(캡틴 결정 2026-09-02: 토글).
  if (update.autoClose !== undefined) raw.autoClose = update.autoClose;
  mkdirSync(dataDir, { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(raw, null, 2)}\n`);
  renameSync(tmp, file);
  return readSettings(dataDir);
}
