import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFeatures } from "./features";

let repo: string;

/** `docs/features/<slug>/spec.md` 합성. */
function spec(slug: string, body: string): void {
  const dir = join(repo, "docs", "features", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "spec.md"), body);
}

/** `docs/features/<slug>/issues/<file>` 합성. */
function issue(slug: string, file: string, body: string): void {
  const dir = join(repo, "docs", "features", slug, "issues");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), body);
}

const ticket = (title: string, status: string, blockedBy?: string): string =>
  [
    `# ${title}`,
    "",
    ...(blockedBy ? [`**Blocked by:** ${blockedBy}`] : []),
    `**Status:** ${status}`,
  ].join("\n");

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "gootte-features-"));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("readFeatures — docs/features/ 를 읽는다", () => {
  it("spec 표제·상태 + 티켓 네 가지를 뽑는다", () => {
    spec("firstmate-project-source", "# 관리 대상 전환\n\nStatus: ready-for-agent (2026-08-09)\n");
    issue("firstmate-project-source", "01-discover.md", ticket("01 — 발견 규칙 전환", "resolved (2026-08-08)"));
    issue("firstmate-project-source", "02-read.md", ticket("02 — 할일 목록", "ready-for-agent", "01"));

    const [f] = readFeatures(repo);
    expect(f?.slug).toBe("firstmate-project-source");
    expect(f?.title).toBe("관리 대상 전환");
    expect(f?.sourceStatus).toBe("ready-for-agent");

    expect(f?.tickets.map((t) => [t.num, t.title, t.sourceStatus, t.startable])).toEqual([
      ["01", "발견 규칙 전환", "resolved", true],
      ["02", "할일 목록", "ready-for-agent", true], // 01 이 완료 → 계산으로 해제
    ]);
    expect(f?.tickets[0]?.completedAt).toBe("2026-08-08");
    expect(f?.tickets[0]?.status).toBe("done");
  });

  it("선행이 미완이면 막힘 — 무엇을 기다리는지 실려 나온다", () => {
    spec("f", "# f\n\nStatus: draft\n");
    issue("f", "01-a.md", ticket("01 — a", "ready-for-agent"));
    issue("f", "02-b.md", ticket("02 — b", "ready-for-agent", "01"));

    const b = readFeatures(repo)[0]?.tickets.find((t) => t.num === "02");
    expect(b?.startable).toBe(false);
    expect(b?.waitingOn).toEqual(["01"]);
  });

  it("🔴 알 수 없는 상태의 티켓도 목록에 남는다 — 사라지면 화면이 `할 일 없음` 이라고 거짓말한다", () => {
    spec("f", "# f\n\nStatus: 이상한값\n");
    issue("f", "01-a.md", ticket("01 — a", "진행중"));

    const [f] = readFeatures(repo);
    expect(f?.statusKnown).toBe(false);
    expect(f?.sourceStatus).toBe("이상한값");
    expect(f?.tickets).toHaveLength(1);
    expect(f?.tickets[0]?.statusKnown).toBe(false);
    expect(f?.tickets[0]?.sourceStatus).toBe("진행중");
  });

  it("기능 여러 개를 폴더명 순으로, 티켓은 번호순으로", () => {
    spec("zeta", "# zeta\n\nStatus: draft\n");
    spec("alpha", "# alpha\n\nStatus: draft\n");
    issue("alpha", "10-j.md", ticket("10 — j", "draft"));
    issue("alpha", "02-b.md", ticket("02 — b", "draft"));

    const features = readFeatures(repo);
    expect(features.map((f) => f.slug)).toEqual(["alpha", "zeta"]);
    expect(features[0]?.tickets.map((t) => t.num)).toEqual(["02", "10"]);
  });

  it("spec.md 없는 기능 폴더도 티켓을 싣는다(표제 = 폴더명)", () => {
    issue("no-spec", "01-a.md", ticket("01 — a", "draft"));
    const [f] = readFeatures(repo);
    expect(f?.title).toBe("no-spec");
    expect(f?.statusKnown).toBe(false);
    expect(f?.tickets).toHaveLength(1);
  });

  it("issues/ 없는 기능도, 폴더 안 md 아닌 파일도 넘어간다", () => {
    spec("only-spec", "# only\n\nStatus: draft\n");
    writeFileSync(join(repo, "docs", "features", "only-spec", "notes.txt"), "무시");
    expect(readFeatures(repo)[0]?.tickets).toEqual([]);
  });

  it("adr/ 는 읽지 않는다 — 이번 범위 밖", () => {
    spec("f", "# f\n\nStatus: draft\n");
    mkdirSync(join(repo, "docs", "features", "f", "adr"), { recursive: true });
    writeFileSync(join(repo, "docs", "features", "f", "adr", "0001-x.md"), "# ADR\n\nStatus: accepted\n");
    expect(readFeatures(repo)[0]?.tickets).toEqual([]);
  });

  it("docs/features/ 가 없으면 빈 목록 — 예외로 죽지 않는다", () => {
    expect(() => readFeatures(repo)).not.toThrow();
    expect(readFeatures(repo)).toEqual([]);
    expect(readFeatures(join(repo, "nope"))).toEqual([]);
  });

  it("파일이 바뀌면 다음 read 가 곧바로 반영한다(INV-3 — 캐시 없음)", () => {
    spec("f", "# f\n\nStatus: draft\n");
    issue("f", "01-a.md", ticket("01 — a", "ready-for-agent"));
    issue("f", "02-b.md", ticket("02 — b", "ready-for-agent", "01"));
    expect(readFeatures(repo)[0]?.tickets[1]?.startable).toBe(false);

    issue("f", "01-a.md", ticket("01 — a", "resolved (2026-08-09)"));
    expect(readFeatures(repo)[0]?.tickets[1]?.startable).toBe(true);
  });
});
