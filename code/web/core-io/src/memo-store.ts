import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Memo, type Memo as MemoT, type MemoWriteRequest } from "@gootte/contract";

/**
 * 메모 저장소 — gootte 자기 저장소(`GOOTTE_DATA_DIR`)의 `memos/<project>.json` 하나.
 *
 * INV-5 가 저장을 허락하는 칸이다: 기능을 쓰기 전에 캡틴이 떠올리는 생각은 **어디 문서에도
 * 적혀 있지 않고 사람만 아는 값**이라 저장할 자격이 있다. 관리대상(INV-2)이 아니라 gootte
 * 자기 저장소에만 쓴다 — `docs/features/` 아래 한 글자도 건드리지 않는다.
 * 설정(`settings.json`)·계획(`plan.db`)과 같은 부모(`GOOTTE_DATA_DIR`)를 쓰는 것도 같은 이유다
 * — 사람이 정한 것이 모이는 곳은 하나뿐이어야 한다.
 */

/** 저장 파일 — `<dataDir>/memos/<project>.json`. */
export function memosFile(dataDir: string, project: string): string {
  return join(dataDir, "memos", `${project}.json`);
}

/**
 * 프로젝트 메모 목록 — 파일이 없으면 빈 배열(처음이다). JSON 이 망가진 것은 빈 목록으로
 * 위장하지 않고 던진다 — "사용자가 지운 것" 과 "저장소가 고장 난 것" 을 같게 그리면
 * 화면이 거짓말을 한다(settings-store 와 같은 규율).
 */
export function readMemos(dataDir: string, project: string): MemoT[] {
  const file = memosFile(dataDir, project);
  if (!existsSync(file)) return [];
  return Memo.array().parse(JSON.parse(readFileSync(file, "utf8")));
}

/** 저장 파일에 기록(통째로 교체) — 임시 파일 → rename 으로 반쯤 쓰인 JSON 읽기를 막는다. */
function writeMemosFile(dataDir: string, project: string, memos: readonly MemoT[]): void {
  const file = memosFile(dataDir, project);
  mkdirSync(join(dataDir, "memos"), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(memos, null, 2)}\n`);
  renameSync(tmp, file);
}

/**
 * 새 메모 한 장 — 목록 **뒤에** 붙인다(작성 순서 = 저장 순서. 화면 정렬은 화면 몫).
 * id 는 `<epochMs>-<같은 ms 안 증가 카운터>` — 화면 키·삭제 대상 식별에만 쓴다.
 * `now`(ISO 8601)는 호출자가 주입한다(테스트가 시각을 고정).
 */
export function appendMemo(dataDir: string, project: string, body: MemoWriteRequest, now: string): MemoT {
  const memos = readMemos(dataDir, project);
  const id = `${Date.now()}-${memos.length + 1}`;
  const memo: MemoT = {
    id,
    content: body.content,
    done: body.done ?? false,
    createdAt: now,
    updatedAt: now,
  };
  writeMemosFile(dataDir, project, [...memos, memo]);
  return memo;
}

/** 한 장 고치기 — id 가 없으면 null(404). 내용을 바꾸고, `done` 이 주어지면 완료 표시를 토글한다. */
export function updateMemo(
  dataDir: string,
  project: string,
  id: string,
  body: MemoWriteRequest,
  now: string,
): MemoT | null {
  const memos = readMemos(dataDir, project);
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
  writeMemosFile(dataDir, project, next);
  return next[idx]!;
}

/** 한 장 지우기 — id 가 없으면 false(404). */
export function deleteMemo(dataDir: string, project: string, id: string): boolean {
  const memos = readMemos(dataDir, project);
  const next = memos.filter((m) => m.id !== id);
  if (next.length === memos.length) return false;
  writeMemosFile(dataDir, project, next);
  return true;
}
