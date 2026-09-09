import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Settings, type Settings as SettingsT, type SettingsUpdateRequest } from "@gootte/contract";

/**
 * 설정 저장소 — gootte 자기 저장소(`GOOTTE_DATA_DIR`) 안의 `settings.json` 하나.
 *
 * INV-5 가 저장을 허락하는 칸이다: 명시 감시 프로젝트(`projects`)는 **어디 문서에도
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

const DEFAULTS: SettingsT = { projects: [], blockedCopies: [], autoClose: true };

/**
 * 설정 읽기 — 파일이 없으면 기본값(전부 빈 배열). 소비처는 빈 배열이면 기본값(env·플랫폼)으로
 * 떨어진다. JSON 이 망가진 것은 빈 설정으로 위장하지 않고 던진다 — "사용자가 지운 것" 과
 * "저장소가 고장 난 것" 을 같게 그리면 화면이 거짓말을 한다.
 *
 * 🔴 `projects` 키가 저장 파일에 **없으면** 여기선 건드리지 않는다 — 파생 여부 판별(`settingsHasProjects`)은
 * 호출자가 raw 키 유무로 한다(D6). 그래야 "키 없음 = 파생 규칙" 과 "키 있음(빈 배열) =
 * 명시적으로 아무것도 안 보기" 를 구분할 수 있다.
 */
export function readSettings(dataDir: string): SettingsT {
  const file = settingsFile(dataDir);
  if (!existsSync(file)) return { ...DEFAULTS };
  return Settings.parse(JSON.parse(readFileSync(file, "utf8")));
}

/**
 * 저장 파일에 `projects` 키가 **있는가** — 있는 것과 빈 배열은 다르다(D6):
 * 키가 없으면 파생 규칙(`resolveProjects`)이 env·플랫폼 기본값으로 떨어지고,
 * 키가 있으면(빈 배열 포함) 그 값이 권위다. JSON 읽기 하나라 매 요청에 감당 가능.
 */
export function settingsHasProjects(dataDir: string): boolean {
  const file = settingsFile(dataDir);
  if (!existsSync(file)) return false;
  try {
    return "projects" in (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>);
  } catch {
    return false;
  }
}

/**
 * 실제 감시 프로젝트 — 매 요청 다시 계산(INV-3, 파생물·결정적).
 *
 * 🔴 `projects` 키가 있으면(빈 배열 포함) 그것이 권위다. 키가 없으면(최초·마이그레이션 전)
 * `fallbackProjects`(env `GOOTTE_ROOTS` · 플랫폼 기본)로 떨어진다.
 */
export function resolveProjects(dataDir: string, fallbackProjects: string[]): string[] {
  const settings = readSettings(dataDir);
  if (settingsHasProjects(dataDir)) return settings.projects;
  return fallbackProjects;
}

/**
 * 설정 쓰기(merge) — raw JSON 을 그대로 돌려쓰므로 **들어온 키만** 갈아 끼우고 나머지(특히
 * `projects` 키 부재)를 보존한다. `undefined` = 무변경, `null` = 지움(unset), 값 = 교체.
 * 정규화(절대 경로)는 호출자 — backend — 가 이미 끝낸 값이라 여기선 믿는다.
 * 임시 파일 → rename 으로 통째로 교체한다: 반쯤 쓰인 JSON 읽기를 못 하게.
 */
export function writeSettings(
  dataDir: string,
  update: Partial<
    Pick<SettingsUpdateRequest, "projects" | "blockedCopies" | "autoClose">
  >,
): SettingsT {
  const file = settingsFile(dataDir);
  const raw: Record<string, unknown> = existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>)
    : {};
  if (update.projects !== undefined) {
    // `null` = 지움(unset) — 키 자체를 지워야 파생 규칙(`resolveProjects`)이 다시 살아난다.
    // `null` 을 그대로 박으면 다음 `readSettings` 가 `Settings.parse` 에서 타입 오류를 낸다
    // (zod 기본값은 키 부재에만 적용되지 null 값엔 적용되지 않는다).
    if (update.projects === null) delete raw.projects;
    else raw.projects = update.projects;
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
