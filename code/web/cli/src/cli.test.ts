import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { beforeAll, beforeEach, describe, it, expect } from "vitest";
import { addOpinionRequest, discoverProjects } from "@gootte/core-io";
import { CliError } from "./args";
import {
  askAnswerText,
  askListText,
  askShowText,
  discoverText,
  dropText,
  extraAddText,
  extraDoneText,
  extraListText,
  extraPruneText,
  nextText,
  orderText,
  setFeatureText,
  setTicketText,
} from "./commands";

function w(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

describe("cli — discover wiring", () => {
  let proj: string;
  beforeAll(() => {
    proj = mkdtempSync(join(tmpdir(), "gootte-proj-"));
    w(proj, "AGENTS.md", "# AGENTS\n");
    w(proj, "docs/features/f/issues/01-x.md", "# 01 — x\n\n**Status:** ready-for-agent\n");
  });

  it("discover — AGENTS.md + docs/features/ 탐지", () => {
    expect(discoverProjects([proj]).map((p) => p.slug)).toContain(basename(proj));
    expect(discoverText([proj])).toContain(basename(proj));
  });

  it("discover — 표식 없는 디렉토리는 빈 목록 문구", () => {
    expect(discoverText([mkdtempSync(join(tmpdir(), "gootte-empty-"))])).toBe("(프로젝트 없음)");
  });
});

describe("cli — set·set-feature·drop·order·next wiring(티켓 01·02)", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "gootte-plan-"));
  });

  it("set-feature — --why 없이 거절한다", () => {
    expect(() => setFeatureText(["p", "a", "--track", "web", "--rank", "10"], dataDir)).toThrow(CliError);
  });

  it("set — --why 없이 거절한다", () => {
    expect(() => setTicketText(["p", "a/01", "--step", "1"], dataDir)).toThrow(CliError);
  });

  it("set-feature → order 가 적은 것을 그대로 되읽는다", () => {
    setFeatureText(["p", "a", "--track", "web", "--rank", "10", "--why", "먼저"], dataDir);
    setTicketText(["p", "a/01", "--step", "1", "--why", "먼저"], dataDir);
    const text = orderText(["p"], dataDir);
    expect(text).toContain("web");
    expect(text).toContain("a/01");
  });

  it("order --json — PlanOrder 형태로 나온다", () => {
    setFeatureText(["p", "a", "--track", "web", "--rank", "10", "--why", "…"], dataDir);
    const parsed = JSON.parse(orderText(["p", "--json"], dataDir));
    expect(parsed.features).toHaveLength(1);
    expect(parsed.mismatches).toEqual([]);
  });

  it("drop — 두 번째 set 없이 지우면 order 에서 사라진다", () => {
    setFeatureText(["p", "a", "--track", "web", "--rank", "10", "--why", "…"], dataDir);
    dropText(["p", "a"], dataDir);
    const parsed = JSON.parse(orderText(["p", "--json"], dataDir));
    expect(parsed.features).toEqual([]);
  });

  it("next --json — 계획이 없으면 빈 트랙 목록", () => {
    const parsed = JSON.parse(nextText(["p", "--json"], dataDir));
    expect(parsed.tracks).toEqual([]);
  });
});

describe("cli — extra wiring(티켓 05)", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "gootte-extra-cli-"));
  });

  it("미처리 0건이면 출력이 비어 있다 — 🔴 첫 커버(firstmate 확인 규약)", () => {
    expect(extraListText(["p"], dataDir)).toBe("");
  });

  it("add 뒤 extra 를 치면 그 한 건이 나온다", () => {
    extraAddText(["p", "a/01", "무언가 더 만들었다"], dataDir);
    const text = extraListText(["p"], dataDir);
    expect(text).toContain("a/01");
    expect(text).toContain("무언가 더 만들었다");
  });

  it("done 뒤 extra 를 치면 다시 비어 있다", () => {
    const added = extraAddText(["p", "a/01", "…"], dataDir);
    const id = added.match(/^#(\d+)/)?.[1];
    extraDoneText([id ?? ""], dataDir);
    expect(extraListText(["p"], dataDir)).toBe("");
  });

  it("--all 이면 처리분까지 보인다", () => {
    const added = extraAddText(["p", "a/01", "…"], dataDir);
    const id = added.match(/^#(\d+)/)?.[1];
    extraDoneText([id ?? ""], dataDir);
    const text = extraListText(["p", "--all"], dataDir);
    expect(text).toContain("[처리됨]");
  });

  it("prune 은 --before 없이 거절한다", () => {
    expect(() => extraPruneText([], dataDir)).toThrow(CliError);
  });
});

describe("cli — ask wiring(티켓 06)", () => {
  let dataDir: string;
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), "gootte-ask-cli-"));
  });

  it("대기 0건이면 출력이 비어 있다 — 🔴 첫 커버(firstmate 확인 규약, extra 와 같다)", () => {
    expect(askListText(["p"], dataDir)).toBe("");
  });

  it("요청이 있으면 ask 에 그 한 줄이 나온다", () => {
    addOpinionRequest(dataDir, { project: "p", batchSummary: "…", question: "이대로 가도 되는지 봐 달라" });
    const text = askListText(["p"], dataDir);
    expect(text).toContain("이대로 가도 되는지 봐 달라");
  });

  it("answer 뒤 ask 를 치면 다시 비어 있다", () => {
    const entry = addOpinionRequest(dataDir, { project: "p", batchSummary: "…", question: "…" });
    askAnswerText([String(entry.id), "--say", "이대로 가자"], dataDir);
    expect(askListText(["p"], dataDir)).toBe("");
  });

  it("ask show 가 배치 요약·물음·답을 verbatim 으로 보여준다", () => {
    const entry = addOpinionRequest(dataDir, { project: "p", batchSummary: "그 순간의 배치", question: "정말 무관한지" });
    askAnswerText([String(entry.id), "--say", "무관하다 — 이대로 가자"], dataDir);
    const text = askShowText([String(entry.id)], dataDir);
    expect(text).toContain("그 순간의 배치");
    expect(text).toContain("정말 무관한지");
    expect(text).toContain("무관하다 — 이대로 가자");
  });

  it("answer 는 --say 없이 거절한다", () => {
    const entry = addOpinionRequest(dataDir, { project: "p", batchSummary: "…", question: "…" });
    expect(() => askAnswerText([String(entry.id)], dataDir)).toThrow(CliError);
  });

  it("show 는 없는 id 면 거절한다", () => {
    expect(() => askShowText(["999"], dataDir)).toThrow(CliError);
  });
});
