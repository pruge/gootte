import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { addOpinionRequest, answerOpinionRequest, getOpinionRequest, listOpinionRequests } from "./opinion-store";

/** 임시 디렉토리 픽스처 — 이 저장소 자신의 문서를 픽스처로 쓰지 않는다(AGENTS.md §Verify gate). */
let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "gootte-opinion-"));
});

describe("opinion-store — 판단 요청 큐(development-order/06, extra 와 같은 성격)", () => {
  it("add 두 번 → 둘 다 남는다(덮어쓰지 않는다)", () => {
    addOpinionRequest(dataDir, { project: "p", batchSummary: "…", question: "하나" });
    addOpinionRequest(dataDir, { project: "p", batchSummary: "…", question: "둘" });
    expect(listOpinionRequests(dataDir)).toHaveLength(2);
  });

  it("기본 질의는 대기 중만 돌려준다 — 🔴 첫 커버(ask 의 침묵 규약이 이 기본값을 쓴다)", () => {
    const a = addOpinionRequest(dataDir, { project: "p", batchSummary: "…", question: "하나" });
    addOpinionRequest(dataDir, { project: "p", batchSummary: "…", question: "둘" });
    answerOpinionRequest(dataDir, a.id, "이대로 가자");
    const pending = listOpinionRequests(dataDir);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.question).toBe("둘");
  });

  it("--all 이면 답변 완료까지 나온다", () => {
    const a = addOpinionRequest(dataDir, { project: "p", batchSummary: "…", question: "하나" });
    answerOpinionRequest(dataDir, a.id, "이대로 가자");
    expect(listOpinionRequests(dataDir, { all: true })).toHaveLength(1);
  });

  it("answer 가 verbatim 으로 실리고 done 이 선다 — 🔴 첫 커버(INV-4)", () => {
    const a = addOpinionRequest(dataDir, { project: "p", batchSummary: "…", question: "…" });
    const answered = answerOpinionRequest(dataDir, a.id, "이대로 가자 — 요약 없이 그대로");
    expect(answered.answer).toBe("이대로 가자 — 요약 없이 그대로");
    expect(answered.done).toBe(true);
    const all = listOpinionRequests(dataDir, { all: true });
    expect(all[0]?.answer).toBe("이대로 가자 — 요약 없이 그대로");
  });

  it("답이 달려도 행을 지우지 않는다", () => {
    const a = addOpinionRequest(dataDir, { project: "p", batchSummary: "…", question: "…" });
    answerOpinionRequest(dataDir, a.id, "…");
    expect(listOpinionRequests(dataDir, { all: true })).toHaveLength(1);
  });

  it("없는 id 를 answer 하면 거절한다", () => {
    expect(() => answerOpinionRequest(dataDir, 999, "…")).toThrow(/찾을 수 없다/);
  });

  it("project 필터가 프로젝트를 가른다", () => {
    addOpinionRequest(dataDir, { project: "p1", batchSummary: "…", question: "…" });
    addOpinionRequest(dataDir, { project: "p2", batchSummary: "…", question: "…" });
    expect(listOpinionRequests(dataDir, { project: "p1" })).toHaveLength(1);
  });

  it("getOpinionRequest 가 배치 요약과 물음 전체를 되읽는다(ask show)", () => {
    const a = addOpinionRequest(dataDir, { project: "p", batchSummary: "그 순간의 배치", question: "이대로?" });
    const got = getOpinionRequest(dataDir, a.id);
    expect(got).toMatchObject({ batchSummary: "그 순간의 배치", question: "이대로?", answer: null, done: false });
  });

  it("getOpinionRequest 는 없는 id 면 null", () => {
    expect(getOpinionRequest(dataDir, 999)).toBeNull();
  });
});
