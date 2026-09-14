import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Memo, type Memo as MemoT, type MemoWriteRequest } from "@gootte/contract";

/**
 * 메모 저장소 — **`<메인 프로젝트>/.gootte/memo.json` 하나**(memos-live-with-the-project/T02).
 *
 * INV-5 가 저장을 허락하는 칸이다: 기능을 쓰기 전에 캡틴이 떠올리는 생각은 **어디 문서에도
 * 적혀 있지 않고 사람만 아는 값**이라 저장할 자격이 있다. 관리대상(INV-2)이 아니라 gootte
 * 자기 산출물 자리(`.gootte/`)에만 쓴다 — `docs/features/` 아래 한 글자도 건드리지 않는다.
 * 그 예외는 시간·상태 기록(`.gootte/state.json`, 캡틴 승인 2026-09-09)과 **같은 계보**다
 * (`docs/features/memos-live-with-the-project/adr/0001-memos-live-in-the-project.md`).
 *
 * 🔴 **이중 원장 금지** — 읽기·쓰기는 전부 이 파일 하나의 좌표를 지난다. 예전의 central
 * (`GOOTTE_DATA_DIR/memos/<slug>.json`) 는 **더 이상 원장이 아니라 읽지 않는다**(폴백 없음,
 * grill Locked 5). central 에 남은 이름은 좌표 하나뿐이다: `centralMemosFile` — 그것은
 * `memo migrate` 가 **옮길 원본**을 가리키는 주소지, 메모를 읽고 쓰는 자리가 아니다.
 *
 * 왜 중앙이 아니라 저장소 안인가: 중앙에 있으면 메모가 클론·기계 사이에 안 이동한다 —
 * 경험이 git 을 따라가지 못하던 통증의 해법이 이 한 줄이다.
 */

/**
 * 메모 파일 좌표 — `<projectDir>/.gootte/memo.json`.
 *
 * 인자는 **메인 프로젝트 경로 하나뿐**(Locked 1 — `(dataDir, slug)` 식의 두 자리 지원은
 * 이중 원장을 코드에 박는 것이다). 메인 사본을 누가 해소해 넘기느냐:
 * - 화면(백엔드): discover 의 대표 경로(`resolveSlug(...).path`) — 시간 기록과 같은 자리(D4).
 * - 터미널(CLI 읽기): cwd → 프로젝트 → `mainRootOf`(worktree 면 메인 승격, **판독만** 한다).
 * - 터미널(CLI 이관 쓰기): 같은 해소의 caching 면(`resolveMainRoot`) — 사본에 config.json 을 남긴다.
 */
export function memosFile(projectDir: string): string {
  return join(projectDir, ".gootte", "memo.json");
}

/**
 * 옛 central 좌표 — `<dataDir>/memos/<project>.json`.
 *
 * 🔴 **`memo migrate` 의 원본 읽기 전용이다. 메모를 읽고 쓰는 자리가 아니다**(T02).
 * 읽기 경로(`readMemos`·백엔드 라우트·`gootte memo`)가 이 함수를 부르면 그 자체가 폴백이며
 * 폴백은 "이관 안 된 것을 이관된 척" 그리는 거짓이다(grill Locked 5). central 을 지우는 일은
 * `--purge` 의 몫으로 남는다 — 이 표는 읽지 않을 뿐, 지우지 않는다.
 */
export function centralMemosFile(dataDir: string, project: string): string {
  return join(dataDir, "memos", `${project}.json`);
}

/**
 * 메모 파일 한 장에 통째로 쓴다 — 임시 파일 → rename 으로 반쯤 쓰인 JSON 읽기를 막는다.
 * 🔴 **메모를 만드는 유일한 통로** — 쓰기만 디렉토리를 만들고(Locked 3) 읽기는 만들지
 * 않는다(빈 목록이 사본을 더럽히면 안 된다). 임시 파일 → rename 은 `readMemos` 와 함께 산다.
 */
export function writeMemoFile(file: string, memos: readonly MemoT[]): void {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(memos, null, 2)}\n`);
  renameSync(tmp, file);
}

/**
 * 메모 파일 한 장을 지운다(`memo migrate --purge` 의 central 정리).
 * 🔴 호출 순서는 배선의 규율이다 — **대상 쓰기 성공 뒤에** 부를 것(지우고 쓰면 실패할 때 데이터가
 * 사라진다, T01 Locked 5). 없는 파일을 지우려는 것은 조용히 넘긴다(멱등).
 */
export function removeMemoFile(file: string): void {
  rmSync(file, { force: true });
}

/**
 * 프로젝트 메모 목록 — 파일이 없으면 빈 배열(처음이다). JSON 이 망가진 것은 빈 목록으로
 * 위장하지 않고 던진다 — "사용자가 지운 것" 과 "저장소가 고장 난 것" 을 같게 그리면
 * 화면이 거짓말을 한다(settings-store 와 같은 규율).
 * 🔴 읽기는 아무것도 만들지 않는다 — `existsSync` 로만 분기한다(Locked 3).
 */
export function readMemos(projectDir: string): MemoT[] {
  const file = memosFile(projectDir);
  if (!existsSync(file)) return [];
  return Memo.array().parse(JSON.parse(readFileSync(file, "utf8")));
}

/** 저장 파일에 기록(통째로 교체) — 쓰기 규율은 `writeMemoFile` 하나뿐이다. */
function writeMemosFile(projectDir: string, memos: readonly MemoT[]): void {
  writeMemoFile(memosFile(projectDir), memos);
}

/**
 * 새 메모 한 장 — 목록 **뒤에** 붙인다(작성 순서 = 저장 순서. 화면 정렬은 화면 몫).
 * id 는 `<epochMs>-<같은 ms 안 증가 카운터>` — 화면 키·삭제 대상 식별에만 쓴다.
 * `now`(ISO 8601)는 호출자가 주입한다(테스트가 시각을 고정).
 */
export function appendMemo(projectDir: string, body: MemoWriteRequest, now: string): MemoT {
  const memos = readMemos(projectDir);
  const id = `${Date.now()}-${memos.length + 1}`;
  const memo: MemoT = {
    id,
    content: body.content,
    done: body.done ?? false,
    createdAt: now,
    updatedAt: now,
  };
  writeMemosFile(projectDir, [...memos, memo]);
  return memo;
}

/** 한 장 고치기 — id 가 없으면 null(404). 내용을 바꾸고, `done` 이 주어지면 완료 표시를 토글한다. */
export function updateMemo(
  projectDir: string,
  id: string,
  body: MemoWriteRequest,
  now: string,
): MemoT | null {
  const memos = readMemos(projectDir);
  const idx = memos.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const next = memos.map((m) =>
    m.id === id
      ? {
          ...m,
          content: body.content,
          ...(body.done !== undefined ? { done: body.done } : {}),
          updatedAt: now,
        }
      : m,
  );
  writeMemosFile(projectDir, next);
  return next[idx]!;
}

/** 한 장 지우기 — id 가 없으면 false(404). */
export function deleteMemo(projectDir: string, id: string): boolean {
  const memos = readMemos(projectDir);
  const next = memos.filter((m) => m.id !== id);
  if (next.length === memos.length) return false;
  writeMemosFile(projectDir, next);
  return true;
}
