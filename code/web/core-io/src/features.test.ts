import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFeatures, readFeatureDoc } from "./features";

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

  // 🔴 `readFeatures` 는 기능 순서를 정렬하지 않는다(티켓 03) — 화면 순서(무리 → 처리중 →
  // 폴더명)는 처리중이 얹힌 뒤 `sortFeatures` 가 정한다. 여기서는 둘 다 실리는지, 그리고
  // 기능 안 티켓은 여전히 번호순인지만 본다.
  it("기능 여러 개를 다 싣는다 — 티켓은 번호순으로", () => {
    spec("zeta", "# zeta\n\nStatus: draft\n");
    spec("alpha", "# alpha\n\nStatus: draft\n");
    issue("alpha", "10-j.md", ticket("10 — j", "draft"));
    issue("alpha", "02-b.md", ticket("02 — b", "draft"));

    const features = readFeatures(repo);
    expect(features.map((f) => f.slug).sort()).toEqual(["alpha", "zeta"]);
    expect(features.find((f) => f.slug === "alpha")?.tickets.map((t) => t.num)).toEqual([
      "02",
      "10",
    ]);
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

  describe("문서 트리 — 폴더에 실제로 있는 것만(티켓 01 §설계 3)", () => {
    it("adr/ 있으면 뜨고, spec.md·architecture.md 같은 낱장도 그대로 뜬다. issues/ 도 실제 파일 목록으로 뜬다", () => {
      spec("f", "# f\n\nStatus: draft\n");
      issue("f", "01-a.md", ticket("01 — a", "draft"));
      writeFileSync(join(repo, "docs", "features", "f", "architecture.md"), "# 구조\n");
      mkdirSync(join(repo, "docs", "features", "f", "adr"), { recursive: true });
      writeFileSync(join(repo, "docs", "features", "f", "adr", "0001-x.md"), "# ADR\n");

      const [f] = readFeatures(repo);
      expect(f?.docs).toEqual([
        { kind: "dir", name: "adr", path: "adr", children: [{ kind: "file", name: "0001-x.md", path: "adr/0001-x.md" }] },
        { kind: "file", name: "architecture.md", path: "architecture.md" },
        { kind: "dir", name: "issues", path: "issues", children: [{ kind: "file", name: "01-a.md", path: "issues/01-a.md" }] },
        { kind: "file", name: "spec.md", path: "spec.md" },
      ]);
    });

    it("🔴 adr/ 없는 기능은 트리에 adr 칸이 없다 — 빈 칸으로도 안 뜬다(INV-4)", () => {
      spec("f", "# f\n\nStatus: draft\n");
      issue("f", "01-a.md", ticket("01 — a", "draft"));

      const [f] = readFeatures(repo);
      expect(f?.docs.map((d) => d.name)).not.toContain("adr");
      expect(f?.docs.map((d) => d.name)).toEqual(["issues", "spec.md"]);
    });
  });

  describe("readFeatureDoc — 기능 폴더 문서 본문 읽기(read-only, INV-2)", () => {
    it("기능 폴더 안의 문서를 읽는다", () => {
      spec("f", "# f\n\n어떤 내용\n");
      const r = readFeatureDoc(repo, "f", "spec.md");
      expect(r).toEqual({ ok: true, content: "# f\n\n어떤 내용\n" });
    });

    it("adr/ 같은 하위 경로도 읽는다", () => {
      mkdirSync(join(repo, "docs", "features", "f", "adr"), { recursive: true });
      writeFileSync(join(repo, "docs", "features", "f", "adr", "0001-x.md"), "# ADR\n");
      expect(readFeatureDoc(repo, "f", "adr/0001-x.md")).toEqual({ ok: true, content: "# ADR\n" });
    });

    it("🔴 상위 경로 탈출(`../`)은 거절한다 — 저장소 밖 파일을 내주지 않는다", () => {
      spec("f", "# f\n");
      writeFileSync(join(repo, "secret.txt"), "비밀");
      const r = readFeatureDoc(repo, "f", "../../secret.txt");
      expect(r).toEqual({ ok: false, reason: "outside" });
    });

    it("🔴 형제 기능 폴더로도 새지 않는다 — 접두 문자열만 같은 폴더('f-evil')를 f 안으로 오인하지 않는다", () => {
      spec("f", "# f\n");
      spec("f-evil", "# 다른 기능\n\n민감\n");
      const r = readFeatureDoc(repo, "f", "../f-evil/spec.md");
      expect(r).toEqual({ ok: false, reason: "outside" });
    });

    it("🔴 절대경로를 줘도 기능 폴더 밖이면 거절한다", () => {
      spec("f", "# f\n");
      const r = readFeatureDoc(repo, "f", "/etc/passwd");
      expect(r).toEqual({ ok: false, reason: "outside" });
    });

    it("없는 문서는 not-found — 조용히 빈 내용이 아니라 무엇이 잘못됐는지 구분된다", () => {
      spec("f", "# f\n");
      expect(readFeatureDoc(repo, "f", "nope.md")).toEqual({ ok: false, reason: "not-found" });
    });
  });
});
