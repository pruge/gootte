import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { addExtra, doneExtra, listExtra, pruneExtra } from "./extra-store";

/** 임시 디렉토리 픽스처 — 이 저장소 자신의 문서를 픽스처로 쓰지 않는다(AGENTS.md §Verify gate). */
let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-extra-"));
});

describe("extra-store — 소비하는 큐(development-order/05, INV-5 와 다른 성격)", () => {
  it("add 두 번 → 둘 다 남는다(덮어쓰지 않는다)", () => {
    addExtra(dataDir, { project: "p", feature: "a", ticket: "01", note: "하나" });
    addExtra(dataDir, { project: "p", feature: "a", ticket: "01", note: "둘" });
    expect(listExtra(dataDir)).toHaveLength(2);
  });

  it("기본 질의는 미처리만 돌려준다 — 🔴 첫 커버", () => {
    const a = addExtra(dataDir, { project: "p", feature: "a", ticket: "01", note: "…" });
    addExtra(dataDir, { project: "p", feature: "b", ticket: "01", note: "…" });
    doneExtra(dataDir, a.id);
    const pending = listExtra(dataDir);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.feature).toBe("b");
  });

  it("--all 이면 처리분까지 나온다", () => {
    const a = addExtra(dataDir, { project: "p", feature: "a", ticket: "01", note: "…" });
    doneExtra(dataDir, a.id);
    expect(listExtra(dataDir, { all: true })).toHaveLength(1);
  });

  it("done 이 표시만 하고 행이 남는다 — 🔴 첫 커버", () => {
    const a = addExtra(dataDir, { project: "p", feature: "a", ticket: "01", note: "…" });
    const done = doneExtra(dataDir, a.id);
    expect(done.done).toBe(true);
    const all = listExtra(dataDir, { all: true });
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBe(a.id);
  });

  it("없는 id 를 done 하면 거절한다", () => {
    expect(() => doneExtra(dataDir, 999)).toThrow(/찾을 수 없다/);
  });

  it("project 필터가 프로젝트를 가른다", () => {
    addExtra(dataDir, { project: "p1", feature: "a", ticket: "01", note: "…" });
    addExtra(dataDir, { project: "p2", feature: "a", ticket: "01", note: "…" });
    expect(listExtra(dataDir, { project: "p1" })).toHaveLength(1);
  });

  it("prune 이 미처리를 안 지운다 — 🔴 첫 커버", () => {
    addExtra(dataDir, { project: "p", feature: "a", ticket: "01", note: "…" });
    const removed = pruneExtra(dataDir, "9999-12-31T00:00:00.000Z");
    expect(removed).toBe(0);
    expect(listExtra(dataDir)).toHaveLength(1);
  });

  it("prune 이 처리분 중 기준일 이전만 지운다", () => {
    const a = addExtra(dataDir, { project: "p", feature: "a", ticket: "01", note: "옛것" });
    doneExtra(dataDir, a.id);
    const b = addExtra(dataDir, { project: "p", feature: "b", ticket: "01", note: "새것" });
    doneExtra(dataDir, b.id);
    const removed = pruneExtra(dataDir, "9999-12-31T00:00:00.000Z");
    expect(removed).toBe(2);
    expect(listExtra(dataDir, { all: true })).toHaveLength(0);
  });

  it("who 를 생략하면 null", () => {
    const entry = addExtra(dataDir, { project: "p", feature: "a", ticket: "01", note: "…" });
    expect(entry.who).toBeNull();
  });
});
