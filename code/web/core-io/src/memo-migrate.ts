import { existsSync, readFileSync } from "node:fs";
import { Memo, type Memo as MemoT } from "@gootte/contract";

/**
 * central → 프로젝트 안(`.gootte/memo.json`) 이관의 **판정만** 하는 자리
 * (memos-live-with-the-project/T01).
 *
 * 읽기는 T02 에서 프로젝트 파일로 돌아갔다 — 쓰는 자리를 만들고(T01) → 이관하고 → 읽기를
 * 돌린 순서가 강제였던 근거는 `grill.md` Locked 5·6(읽기를 먼저 돌리면 미이관 프로젝트의
 * 메모가 화면에서 사라진 것처럼 보인다). 순서가 끝난 지금도 이 파일은 **어디서 읽고 어디에
 * 쓰는지를 모른다** — 주어진 두 파일의 존재와 내용만 비교한다. 그래서 이 판정 자체가 소비처의
 * 폴백이 되지 못한다(호출자가 경로를 골라 넘긴다).
 *
 * 🔴 side effect 0: 쓰지도 지우지도 않는다. 쓰기(`writeMemoFile`)와 삭제의 주체는 `memo-store`
 * 이고, 호출 순서(쓰기 성공 **뒤에** purge)는 CLI 배선이 소유한다 — 지우고 쓰면 실패할 때
 * 데이터를 잃는다(Locked 5).
 * 🔴 조용한 덮어쓰기 금지: 대상이 있고 내용이 다르면 **오류로 멈춘다** — 어느 쪽이 최신인지
 * 사람이 정해야 한다(Locked 3). 같은 명령을 두 번 돌려도 안전하다(멱등: 두 번째는 skip).
 */

/**
 * 메모 파일 원문 판독 — `Memo.array()` 대신 **`.strict()`** 를 쓴다. 이 명령의 목적이 "원장을
 * 옮기되 내용을 잃지 않는 것" 이므로, 이 세대가 모르는 필드가 있는 파일을 만나면 조용히 그
 * 필드를 버리고 덮어쓰는 대신 **멈춘다**(zod 기본은 unknown key strip — 데이터 손실의 통로다).
 */
const MemoFile = Memo.strict().array();

export interface MemoMigrationTargets {
  /** 읽을 원본 — `<dataDir>/memos/<slug>.json` (지금의 central 규약). */
  centralFile: string;
  /** 쓸 대상 — `<메인 프로젝트>/.gootte/memo.json`. */
  projectFile: string;
}

export type MemoMigrationPlan =
  /** 원본이 없다(또는 0건) → 만들 파일도, 지울 것도 없다. exit 0. */
  | { action: "none" }
  /** 대상이 아직 없다 → 쓴다. */
  | { action: "write"; memos: MemoT[] }
  /** 대상이 이미 있고 내용이 같다 → 건드리지 않는다(멱등). */
  | { action: "skip"; memos: MemoT[] }
  /** 대상이 있는데 내용이 다르다(또는 둘 중 하나가 망가졌다) → 멈춘다. 원인을 한 줄로 준다. */
  | { action: "error"; reason: string };

/** 파일 읽기의 세 얼굴 — 없음 / 고장 / 내용. "지운 것" 과 "고장 난 것" 을 같게 보지 않는다. */
type ReadResult = { kind: "missing" } | { kind: "broken"; cause: string } | { kind: "memos"; memos: MemoT[] };

function readMemoFile(file: string): ReadResult {
  if (!existsSync(file)) return { kind: "missing" };
  try {
    return { kind: "memos", memos: MemoFile.parse(JSON.parse(readFileSync(file, "utf8"))) };
  } catch (err) {
    return { kind: "broken", cause: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 내용 동일 판정 — **파싱한 배열**을 canonical JSON 으로 비교한다(원문 bytes 비교 아님).
 * 두 파일 다 같은 쓰기 함수(`writeMemoFile`) 를 지나면 bytes 도 같지만, 사람이 편집하거나
 * 들여쓰기가 다른 사본은 bytes 가 달라도 내용이 같으면 같다고 말해야 한다(INV-4: 내용은
 * 요약하지 않고 그대로 — 형식의 차이를 충돌로 오인하지 않는다).
 */
function sameMemos(a: readonly MemoT[], b: readonly MemoT[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 두 파일의 존재와 내용만 비교해 이관 판정을 낸다. 아무것도 쓰지 않는다. */
export function planMemoMigration({ centralFile, projectFile }: MemoMigrationTargets): MemoMigrationPlan {
  const central = readMemoFile(centralFile);
  if (central.kind === "missing") return { action: "none" };
  if (central.kind === "broken") {
    return { action: "error", reason: `원본을 메모 스키마로 읽을 수 없다 — 옮기지도 지우지도 않는다: ${centralFile} — ${central.cause}` };
  }
  // 0건 원본은 만들 대상이 없다 — 빈 목록으로 파일을 늘리지 않는다(T02 Locked 3 과 같은 규율).
  if (central.memos.length === 0) return { action: "none" };

  const target = readMemoFile(projectFile);
  if (target.kind === "missing") return { action: "write", memos: central.memos };
  if (target.kind === "broken") {
    return { action: "error", reason: `대상 파일을 메모 스키마로 읽을 수 없다 — 비교할 수 없으므로 건드리지 않는다: ${projectFile} — ${target.cause}` };
  }
  if (sameMemos(central.memos, target.memos)) return { action: "skip", memos: central.memos };
  return {
    action: "error",
    reason:
      `대상이 이미 있고 원본과 내용이 다르다 — 어느 쪽이 최신인지 사람이 정한다 (central ${central.memos.length}건 · 대상 ${target.memos.length}건): ${projectFile}`,
  };
}
