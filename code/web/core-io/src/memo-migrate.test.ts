import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Memo } from "@gootte/contract";
import { planMemoMigration } from "./memo-migrate";

/**
 * `planMemoMigration` — central → 프로젝트 파일 이관의 **판정만** 잰다
 * (memos-live-with-the-project/T01). 쓰기는 여기 scope 밖이다(`memo-store` 의 쓰기 규율은
 * `memo-store.test.ts` 가, 쓰기→purge 순서는 `cli/src/cli.test.ts` 가 잰다).
 *
 * 전부 임시 디렉토리 픽스처 — 이 저장소 자신의 `docs/` 나 캡틴의 `~/.gootte` 를 읽지 않는다.
 */

let root: string;
let centralFile: string;
let projectFile: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "gootte-memo-mig-"));
  centralFile = join(root, "central", "jinwooauto.json");
  projectFile = join(root, "proj", ".gootte", "memo.json");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const memo = (n: number, done = false): Memo => ({
  id: `178827743576${n}-1`,
  content: `메모 ${n}`,
  done,
  createdAt: `2026-09-0${n}T00:00:00.000Z`,
  updatedAt: `2026-09-0${n}T00:00:00.000Z`,
});

function put(file: string, memos: readonly Memo[] | string): void {
  mkdirSync(join(file, ".."), { recursive: true });
  const body = typeof memos === "string" ? memos : `${JSON.stringify(memos, null, 2)}\n`;
  writeFileSync(file, body);
}

const plan = () => planMemoMigration({ centralFile, projectFile });

describe("planMemoMigration — 세 얼굴", () => {
  it("원본이 없다 → none(무엇도 만들 이유가 없다)", () => {
    expect(plan()).toEqual({ action: "none" });
    expect(existsSync(projectFile)).toBe(false);
  });

  it("원본 0건 → none — 빈 목록으로 파일을 늘리지 않는다", () => {
    put(centralFile, []);
    expect(plan()).toEqual({ action: "none" });
    expect(existsSync(projectFile)).toBe(false);
  });

  it("원본 있고 대상 없다 → write. 내용은 파싱한 그대로(요약 없는 verbatim, INV-4)", () => {
    put(centralFile, [memo(1), memo(2, true)]);
    expect(plan()).toEqual({ action: "write", memos: [memo(1), memo(2, true)] });
  });

  it("대상 이미 있고 내용이 같다 → skip(멱등 — 두 번 돌려도 안전)", () => {
    const memos = [memo(1), memo(2, true)];
    put(centralFile, memos);
    put(projectFile, memos);
    expect(plan()).toEqual({ action: "skip", memos });
  });

  it("대상 이미 있고 내용이 다르다 → error. 어느 쪽이 최신인지 사람이 정한다", () => {
    put(centralFile, [memo(1), memo(2)]);
    put(projectFile, [memo(1)]);
    const got = plan();
    expect(got.action).toBe("error");
    // 원인은 한 줄로: 대상 경로와 두 건수가 다 드러난다(무엇을 비교해서 틀렸는지 재계산 못 하게).
    expect(got.action === "error" && got.reason).toContain(projectFile);
    expect(got.action === "error" && got.reason).toContain("central 2건");
    expect(got.action === "error" && got.reason).toContain("대상 1건");
  });

  it("🔴 판정은 아무것도 쓰지 않는다 — write 판정 뒤에도 대상 파일은 없다(쓰기의 주체는 store)", () => {
    put(centralFile, [memo(1)]);
    plan();
    expect(existsSync(projectFile)).toBe(false);
    // 원본도 그대로다(purge 는 명시 호출의 몫).
    expect(JSON.parse(readFileSync(centralFile, "utf8"))).toHaveLength(1);
  });
});

describe("planMemoMigration — 고장은 충돌과 갈라 쓴다", () => {
  it("원본 JSON 이 망가졌다 → error(빈 목록으로 위장하지 않는다)", () => {
    put(centralFile, "{ not json");
    const got = plan();
    expect(got.action).toBe("error");
    expect(got.action === "error" && got.reason).toContain(centralFile);
  });

  it("대상 JSON 이 망가졌다 → error. 내용을 비교할 수 없으므로 건드리지 않는다", () => {
    put(centralFile, [memo(1)]);
    put(projectFile, "not json at all");
    const got = plan();
    expect(got.action).toBe("error");
    expect(got.action === "error" && got.reason).toContain(projectFile);
    // 원본은 그대로 — 비교 실패가 데이터 손실로 이어지지 않는다.
    expect(existsSync(centralFile)).toBe(true);
  });

  it("🔴 이 세대가 모르는 필드가 있으면 옮기지 않는다 — 옮기다가 그 필드를 버리는 것보다 멈추는 편이 낫다", () => {
    mkdirSync(join(centralFile, ".."), { recursive: true });
    writeFileSync(centralFile, JSON.stringify([{ ...memo(1), tags: ["나중 세대 필드"] }]));
    const got = plan();
    expect(got.action).toBe("error");
    expect(got.action === "error" && got.reason).toContain(centralFile);
  });

  it("bytes 는 다르고 내용은 같은 사본 → skip(형식 차이를 충돌로 오인하지 않는다)", () => {
    put(centralFile, [memo(1), memo(2)]);
    mkdirSync(join(projectFile, ".."), { recursive: true });
    writeFileSync(projectFile, JSON.stringify([memo(1), memo(2)])); // 들여쓰기 없는 한 줄
    expect(plan().action).toBe("skip");
  });

  it("done 을 생략한 옛 central 도 같은 배열로 본다(zod 기본값) — 형식 차이가 충돌이 되지 않는다", () => {
    // 실측 서식: 옛 원장은 `done` 칸 없이도 굴렀다. 파싱하면 done:false 로 채워진다.
    mkdirSync(join(centralFile, ".."), { recursive: true });
    writeFileSync(
      centralFile,
      JSON.stringify([{ id: "1-1", content: "옛날 메모", createdAt: "2026-09-01", updatedAt: "2026-09-01" }]),
    );
    const legacy: Memo = { id: "1-1", content: "옛날 메모", done: false, createdAt: "2026-09-01", updatedAt: "2026-09-01" };
    expect(plan()).toEqual({ action: "write", memos: [legacy] });
    // 대상에 명시적 done:false 가 이미 실려 있으면 — 같은 내용이다(skip).
    put(projectFile, [legacy]);
    expect(plan()).toEqual({ action: "skip", memos: [legacy] });
  });
});
