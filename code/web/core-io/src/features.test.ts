import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyBacklogStatus } from "@gootte/core";
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

/** `docs/features/<slug>/tickets/<file>` 합성(T04 신관례). */
function newTicket(slug: string, file: string, body: string): void {
  const dir = join(repo, "docs", "features", slug, "tickets");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), body);
}

/** `docs/features/<slug>/<file>` 낱장 문서 합성 — grill.md·wayfinder.md 등. */
function doc(slug: string, file: string, body: string): void {
  const dir = join(repo, "docs", "features", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), body);
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "gootte-features-"));
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("readFeatures — docs/features/ 를 읽는다", () => {
  it("spec 표제·상태 + 티켓 네 가지를 뽑는다", () => {
    spec("firstmate-project-source", "# 관리 대상 전환\n\nStatus: ready-for-agent (2026-08-09)\n");
    issue("firstmate-project-source", "01-discover.md", ticket("01 — 발견 규칙 전환", "resolved (2026-08-08)"));
    issue("firstmate-project-source", "02-read.md", ticket("02 — 할일 목록", "ready-for-agent", "01"));

    const [f] = readFeatures([repo]);
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

    const b = readFeatures([repo])[0]?.tickets.find((t) => t.num === "02");
    expect(b?.startable).toBe(false);
    expect(b?.waitingOn).toEqual(["01"]);
  });

  it("🔴 알 수 없는 상태의 티켓도 목록에 남는다 — 사라지면 화면이 `할 일 없음` 이라고 거짓말한다", () => {
    spec("f", "# f\n\nStatus: 이상한값\n");
    issue("f", "01-a.md", ticket("01 — a", "진행중"));

    const [f] = readFeatures([repo]);
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

    const features = readFeatures([repo]);
    expect(features.map((f) => f.slug).sort()).toEqual(["alpha", "zeta"]);
    expect(features.find((f) => f.slug === "alpha")?.tickets.map((t) => t.num)).toEqual([
      "02",
      "10",
    ]);
  });

  it("spec.md 없는 기능 폴더도 티켓을 싣는다(표제 = 폴더명)", () => {
    issue("no-spec", "01-a.md", ticket("01 — a", "draft"));
    const [f] = readFeatures([repo]);
    expect(f?.title).toBe("no-spec");
    expect(f?.statusKnown).toBe(false);
    expect(f?.tickets).toHaveLength(1);
  });

  it("issues/ 없는 기능도, 폴더 안 md 아닌 파일도 넘어간다", () => {
    spec("only-spec", "# only\n\nStatus: draft\n");
    writeFileSync(join(repo, "docs", "features", "only-spec", "notes.txt"), "무시");
    expect(readFeatures([repo])[0]?.tickets).toEqual([]);
  });

  it("adr/ 는 읽지 않는다 — 이번 범위 밖", () => {
    spec("f", "# f\n\nStatus: draft\n");
    mkdirSync(join(repo, "docs", "features", "f", "adr"), { recursive: true });
    writeFileSync(join(repo, "docs", "features", "f", "adr", "0001-x.md"), "# ADR\n\nStatus: accepted\n");
    expect(readFeatures([repo])[0]?.tickets).toEqual([]);
  });

  it("docs/features/ 가 없으면 빈 목록 — 예외로 죽지 않는다", () => {
    expect(() => readFeatures([repo])).not.toThrow();
    expect(readFeatures([repo])).toEqual([]);
    expect(readFeatures([join(repo, "nope")])).toEqual([]);
  });

  it("파일이 바뀌면 다음 read 가 곧바로 반영한다(INV-3 — 캐시 없음)", () => {
    spec("f", "# f\n\nStatus: draft\n");
    issue("f", "01-a.md", ticket("01 — a", "ready-for-agent"));
    issue("f", "02-b.md", ticket("02 — b", "ready-for-agent", "01"));
    expect(readFeatures([repo])[0]?.tickets[1]?.startable).toBe(false);

    issue("f", "01-a.md", ticket("01 — a", "resolved (2026-08-09)"));
    expect(readFeatures([repo])[0]?.tickets[1]?.startable).toBe(true);
  });

  describe("문서 트리 — 폴더에 실제로 있는 것만(티켓 01 §설계 3)", () => {
    it("adr/ 있으면 뜨고, spec.md·architecture.md 같은 낱장도 그대로 뜬다. issues/ 도 실제 파일 목록으로 뜬다", () => {
      spec("f", "# f\n\nStatus: draft\n");
      issue("f", "01-a.md", ticket("01 — a", "draft"));
      writeFileSync(join(repo, "docs", "features", "f", "architecture.md"), "# 구조\n");
      mkdirSync(join(repo, "docs", "features", "f", "adr"), { recursive: true });
      writeFileSync(join(repo, "docs", "features", "f", "adr", "0001-x.md"), "# ADR\n");

      const [f] = readFeatures([repo]);
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

      const [f] = readFeatures([repo]);
      expect(f?.docs.map((d) => d.name)).not.toContain("adr");
      expect(f?.docs.map((d) => d.name)).toEqual(["issues", "spec.md"]);
    });
  });

  describe("readFeatureDoc — 기능 폴더 문서 본문 읽기(read-only, INV-2)", () => {
    it("기능 폴더 안의 문서를 읽는다", () => {
      spec("f", "# f\n\n어떤 내용\n");
      const r = readFeatureDoc([repo], "f", "spec.md");
      expect(r).toEqual({ ok: true, content: "# f\n\n어떤 내용\n" });
    });

    it("adr/ 같은 하위 경로도 읽는다", () => {
      mkdirSync(join(repo, "docs", "features", "f", "adr"), { recursive: true });
      writeFileSync(join(repo, "docs", "features", "f", "adr", "0001-x.md"), "# ADR\n");
      expect(readFeatureDoc([repo], "f", "adr/0001-x.md")).toEqual({ ok: true, content: "# ADR\n" });
    });

    it("🔴 상위 경로 탈출(`../`)은 거절한다 — 저장소 밖 파일을 내주지 않는다", () => {
      spec("f", "# f\n");
      writeFileSync(join(repo, "secret.txt"), "비밀");
      const r = readFeatureDoc([repo], "f", "../../secret.txt");
      expect(r).toEqual({ ok: false, reason: "outside" });
    });

    it("🔴 형제 기능 폴더로도 새지 않는다 — 접두 문자열만 같은 폴더('f-evil')를 f 안으로 오인하지 않는다", () => {
      spec("f", "# f\n");
      spec("f-evil", "# 다른 기능\n\n민감\n");
      const r = readFeatureDoc([repo], "f", "../f-evil/spec.md");
      expect(r).toEqual({ ok: false, reason: "outside" });
    });

    it("🔴 절대경로를 줘도 기능 폴더 밖이면 거절한다", () => {
      spec("f", "# f\n");
      const r = readFeatureDoc([repo], "f", "/etc/passwd");
      expect(r).toEqual({ ok: false, reason: "outside" });
    });

    it("없는 문서는 not-found — 조용히 빈 내용이 아니라 무엇이 잘못됐는지 구분된다", () => {
      spec("f", "# f\n");
      expect(readFeatureDoc([repo], "f", "nope.md")).toEqual({ ok: false, reason: "not-found" });
    });
  });
});

describe("readFeatures — 신관례(T04): tickets/·grill.md/design/·wayfinder.md", () => {
  it("tickets/T<NN>.md 를 newTickets 로 뽑는다 — 파일에 상태가 없다(백로그가 SoT)", () => {
    spec("tauri-desktop-app", "# 데스크톱 앱\n");
    newTicket("tauri-desktop-app", "T04.md", "# T04 — 신관례 문서 표시 + 백로그 상태 조인\n\n## Goal\n본문\n");

    const [f] = readFeatures([repo]);
    expect(f?.newTickets?.map((t) => [t.num, t.slug, t.path, t.title, t.status, t.docConvention, t.joinFailed])).toEqual([
      ["04", "T04", "tickets/T04.md", "신관례 문서 표시 + 백로그 상태 조인", "pending", "tickets", false],
    ]);
  });

  it("tickets/ 가 없으면 newTickets 가 빈 배열이다(INV-4: 실재하는 것만)", () => {
    spec("f", "# f\n");
    const [f] = readFeatures([repo]);
    expect(f?.newTickets).toEqual([]);
  });

  it("숫자가 아닌 파일(README 등)은 티켓으로 안 줍는다", () => {
    spec("f", "# f\n");
    newTicket("f", "T01.md", "# T01 — a\n");
    newTicket("f", "README.md", "# 안내\n");
    const [f] = readFeatures([repo]);
    expect(f?.newTickets?.map((t) => t.slug)).toEqual(["T01"]);
  });

  it("🔴 `## Depends on` 을 blockedBy 로 읽고, 미완 선행이 있으면 대기로 판정한다(T01)", () => {
    spec("f", "# f\n");
    newTicket("f", "T01.md", "# T01 — a\n\n## Depends on\n- none\n");
    newTicket("f", "T02.md", "# T02 — b\n\n## Depends on\n- T01 (먼저 끝내기)\n\n## Can run in parallel with\n- nothing\n");

    const [f] = readFeatures([repo]);
    const t1 = f?.newTickets?.find((t) => t.num === "01");
    const t2 = f?.newTickets?.find((t) => t.num === "02");
    expect(t1?.blockedBy).toEqual([]);
    expect(t1?.startable).toBe(true);
    expect(t2?.blockedBy).toEqual(["01"]);
    expect(t2?.waitingOn).toEqual(["01"]); // 빌드 시점의 신관례 상태는 백로그 조인 전(pending)
    expect(t2?.startable).toBe(false);
    expect(t2?.unreadableBlockedBy).toEqual([]);
  });

  it("grill.md·design/·wayfinder.md 가 실재하면 문서 트리에 그대로 뜬다(원문 열람 경로 재사용)", () => {
    spec("tauri-desktop-app", "# 데스크톱 앱\n");
    doc("tauri-desktop-app", "grill.md", "# Grill\n");
    doc("tauri-desktop-app", "wayfinder.md", "# Wayfinder\n");
    mkdirSync(join(repo, "docs", "features", "tauri-desktop-app", "design"), { recursive: true });
    writeFileSync(join(repo, "docs", "features", "tauri-desktop-app", "design", "0001-x.md"), "# 설계\n");

    const [f] = readFeatures([repo]);
    const names = f?.docs.map((d) => d.name).sort();
    expect(names).toEqual(["design", "grill.md", "spec.md", "wayfinder.md"]);
    expect(readFeatureDoc([repo], "tauri-desktop-app", "grill.md")).toEqual({ ok: true, content: "# Grill\n" });
    expect(readFeatureDoc([repo], "tauri-desktop-app", "design/0001-x.md")).toEqual({ ok: true, content: "# 설계\n" });
  });

  it("실재하지 않는 grill.md/design/wayfinder.md 는 트리에 나타나지 않는다(INV-4)", () => {
    spec("f", "# f\n");
    const [f] = readFeatures([repo]);
    expect(f?.docs.map((d) => d.name)).toEqual(["spec.md"]);
  });
});

// ── T02 — 여러 사본 합집합 + 나중 판 판정 (🔴 실물 git 저장소 두 벌, 지어낸 출력 없음) ──
describe("readFeatures — 여러 사본 합집합 + 나중 판 (T02)", () => {
  let tmp: string;
  let a: string;
  let b: string;

  const initRepo = (dir: string): void => {
    mkdirSync(dir, { recursive: true });
    execFileSync("git", ["init", "-q", dir], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "config", "user.email", "crew@example.com"], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "config", "user.name", "crew"], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "config", "commit.gpgsign", "false"], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "symbolic-ref", "HEAD", "refs/heads/main"], { stdio: "ignore" });
  };
  const commit = (dir: string, msg: string): void => {
    execFileSync("git", ["-C", dir, "add", "-A"], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "commit", "-q", "-m", msg], { stdio: "ignore" });
  };
  const feat = (dir: string, slug: string, specBody: string): void => {
    const d = join(dir, "docs", "features", slug);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, "spec.md"), specBody);
  };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gootte-merge-"));
    a = join(tmp, "a");
    b = join(tmp, "b");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("AC1/AC2 — 한쪽 사본에만 있는 기능이 합집합에 뜬다", () => {
    initRepo(a);
    feat(a, "onlyA", "# A 만\n\nStatus: draft\n");
    commit(a, "a");
    initRepo(b);
    feat(b, "onlyB", "# B 만\n\nStatus: draft\n");
    commit(b, "b");
    expect(readFeatures([a, b]).map((f) => f.slug).sort()).toEqual(["onlyA", "onlyB"]);
  });

  it("AC3 — 양쪽에 있고 내용이 같으면 한 벌만(spec.md §절차 1)", () => {
    initRepo(a);
    feat(a, "f", "# 같음\n\nStatus: draft\n");
    commit(a, "a");
    execFileSync("git", ["clone", "-q", a, b], { stdio: "ignore" });
    const [f] = readFeatures([a, b]);
    expect(f?.slug).toBe("f");
    expect(f?.title).toBe("같음");
    expect(f?.conflict).toEqual([]);
  });

  it("AC4 — 양쪽에 있고 B 만 미커밋 변경이 있으면 B 의 내용이 뜬다(절차 2)", () => {
    initRepo(a);
    feat(a, "f", "# A 커밋됨\n\nStatus: draft\n");
    commit(a, "a");
    execFileSync("git", ["clone", "-q", a, b], { stdio: "ignore" });
    feat(b, "f", "# B 커밋됨\n\nStatus: draft\n");
    commit(b, "b");
    // A 는 커밋 안 한 채 고친다(미커밋) — B 가 이긴다.
    feat(a, "f", "# A 작업중\n\nStatus: draft\n");
    const [f] = readFeatures([a, b]);
    expect(f?.title).toBe("A 작업중");
    expect(f?.conflict).toEqual([]);
  });

  it("AC5 — 양쪽 커밋 상태이고 B HEAD 가 A 후손이면 B 의 내용이 뜬다(절차 3)", () => {
    initRepo(a);
    feat(a, "f", "# base\n\nStatus: draft\n");
    commit(a, "a");
    execFileSync("git", ["clone", "-q", a, b], { stdio: "ignore" });
    feat(b, "f", "# B 나중\n\nStatus: draft\n");
    commit(b, "b");
    const [f] = readFeatures([a, b]);
    expect(f?.title).toBe("B 나중");
    expect(f?.conflict).toEqual([]);
  });

  it("AC6 — 조상 관계가 어느 쪽도 아니면 고르지 않고 conflict 에 실린다(절차 4)", () => {
    initRepo(a);
    feat(a, "f", "# base\n\nStatus: draft\n");
    commit(a, "a");
    execFileSync("git", ["clone", "-q", a, b], { stdio: "ignore" });
    // A 가 독립 커밋, B 도 독립 커밋 → 어느 쪽도 상대 HEAD 의 조상이 아님(진짜 갈라짐).
    feat(a, "f", "# A 쪽\n\nStatus: draft\n");
    commit(a, "a2");
    feat(b, "f", "# B 쪽\n\nStatus: draft\n");
    commit(b, "b2");
    const [f] = readFeatures([a, b]);
    expect(f?.conflict).toEqual([{ path: "spec.md", copies: [a, b].sort() }]);
  });

  it("AC7 — 사본 하나뿐이면 지금과 같은 내용이 뜬다(merge = 단일 사본)", () => {
    initRepo(a);
    feat(a, "f", "# 단독\n\nStatus: ready-for-agent\n");
    mkdirSync(join(a, "docs", "features", "f", "issues"), { recursive: true });
    writeFileSync(join(a, "docs", "features", "f", "issues", "01-x.md"), "# 01\n\n**Status:** draft\n");
    commit(a, "a");
    const [f] = readFeatures([a]);
    expect(f?.slug).toBe("f");
    expect(f?.title).toBe("단독");
    expect(f?.tickets.map((t) => t.num)).toEqual(["01"]);
    expect(f?.conflict).toEqual([]);
  });

  it("AC8 — 사본 경로 하나가 없거나 저장소가 아니어도 나머지가 그대로 뜬다", () => {
    initRepo(a);
    feat(a, "f", "# A\n\nStatus: draft\n");
    commit(a, "a");
    // 존재하지 않는 경로는 무시되고 a 가 보인다.
    expect(readFeatures([a, join(tmp, "nope")]).map((f) => f.slug)).toEqual(["f"]);
    // .git 없는 plain 디렉토리(저장소 아님)는 git 질의 불가 사본으로 건너뛴다.
    const plain = join(tmp, "plain");
    feat(plain, "f", "# plain\n\nStatus: draft\n");
    const got = readFeatures([a, plain]);
    expect(got.map((f) => f.slug)).toEqual(["f"]);
    expect(got[0]?.title).toBe("A"); // git 저장소 a 의 내용이 이긴다
  });

  it("AC9 — readFeatureDoc 는 각 사본 경계 밖 경로를 거절한다", () => {
    initRepo(a);
    feat(a, "f", "# A\n\nStatus: draft\n");
    commit(a, "a");
    execFileSync("git", ["clone", "-q", a, b], { stdio: "ignore" });
    expect(readFeatureDoc([a, b], "f", "spec.md")).toEqual({ ok: true, content: "# A\n\nStatus: draft\n" });
    expect(readFeatureDoc([a, b], "f", "../../secret.txt")).toEqual({ ok: false, reason: "outside" });
  });
});

// ── T04 — 미착지 표식 + 추적 제외 파일 제외 (실물 git 저장소, `.git/info/exclude` 실물 줄) ──
describe("readFeatures — 미착지 표식 · 추적 제외 (T04)", () => {
  let tmp: string;
  let a: string;

  const initRepo = (dir: string): void => {
    mkdirSync(dir, { recursive: true });
    execFileSync("git", ["init", "-q", dir], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "config", "user.email", "crew@example.com"], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "config", "user.name", "crew"], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "config", "commit.gpgsign", "false"], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "symbolic-ref", "HEAD", "refs/heads/main"], { stdio: "ignore" });
  };
  const commit = (dir: string, msg: string): void => {
    execFileSync("git", ["-C", dir, "add", "-A"], { stdio: "ignore" });
    execFileSync("git", ["-C", dir, "commit", "-q", "-m", msg], { stdio: "ignore" });
  };

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gootte-unlanded-"));
    a = join(tmp, "a");
    initRepo(a);
    repo = a; // 위 module-scope `spec`/`issue`/`doc` 헬퍼가 이 변수를 쓴다 — 이 describe 안에서는 a 를 가리키게 한다.
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("AC1 — 추적 제외된 design/*.html 은 문서 트리에 뜨지 않는다(실물: docs/features/*/design/)", () => {
    spec("f", "# f\n\nStatus: draft\n");
    mkdirSync(join(a, ".git", "info"), { recursive: true });
    writeFileSync(join(a, ".git", "info", "exclude"), "docs/features/*/design/\n");
    mkdirSync(join(a, "docs", "features", "f", "design"), { recursive: true });
    writeFileSync(join(a, "docs", "features", "f", "design", "delete-dialog.html"), "<html></html>\n");
    commit(a, "init");
    const [f] = readFeatures([a]);
    expect(f?.docs.map((d) => d.name)).toEqual(["spec.md"]);
  });

  it("AC2 — 추적 중이지만 커밋 안 된 문서에 미착지 표식이 붙는다", () => {
    spec("f", "# f\n\nStatus: draft\n");
    commit(a, "init");
    writeFileSync(join(a, "docs", "features", "f", "spec.md"), "# f\n\nStatus: draft\n\n고침\n");
    const [f] = readFeatures([a]);
    const node = f?.docs.find((d) => d.name === "spec.md");
    expect(node?.unlanded).toBe(true);
  });

  it("AC3 — 추적 안 된 새 문서도 트리에 뜨고 같은 표식이 붙는다", () => {
    spec("f", "# f\n\nStatus: draft\n");
    commit(a, "init");
    doc("f", "wayfinder.md", "# Wayfinder\n");
    const [f] = readFeatures([a]);
    const node = f?.docs.find((d) => d.name === "wayfinder.md");
    expect(node?.unlanded).toBe(true);
  });

  it("AC4 — 착지 완료된 문서에는 표식이 없다(기존 화면 불변)", () => {
    spec("f", "# f\n\nStatus: draft\n");
    commit(a, "init");
    const [f] = readFeatures([a]);
    const node = f?.docs.find((d) => d.name === "spec.md");
    expect(node?.unlanded).toBeUndefined();
  });

  it("🔴 추적 제외이면서 미착지인 파일은 제외가 이긴다(안 보인다)", () => {
    spec("f", "# f\n\nStatus: draft\n");
    mkdirSync(join(a, ".git", "info"), { recursive: true });
    writeFileSync(join(a, ".git", "info", "exclude"), "docs/features/*/design/\n");
    commit(a, "init");
    mkdirSync(join(a, "docs", "features", "f", "design"), { recursive: true });
    writeFileSync(join(a, "docs", "features", "f", "design", "new-idea.html"), "<html></html>\n"); // 새로 생김 = 미착지 후보이기도 함
    const [f] = readFeatures([a]);
    expect(f?.docs.map((d) => d.name)).toEqual(["spec.md"]);
  });

  it("티켓(issues/)에도 같은 표식이 실린다 — docs.tree 와 같은 판정을 옮겨 쓴다", () => {
    spec("f", "# f\n\nStatus: draft\n");
    commit(a, "init");
    issue("f", "01-a.md", ticket("01 — a", "draft"));
    const [f] = readFeatures([a]);
    expect(f?.tickets[0]?.unlanded).toBe(true);
  });

  it("AC6 — git 이 답하지 않는 사본(plain 디렉토리)의 문서는 표식 없이 그대로 보인다", () => {
    const plain = join(tmp, "plain");
    spec2(plain, "f", "# plain\n\nStatus: draft\n");
    const [f] = readFeatures([plain]);
    const node = f?.docs.find((d) => d.name === "spec.md");
    expect(node?.unlanded).toBeUndefined();
    expect(f?.docs.map((d) => d.name)).toEqual(["spec.md"]);
  });
});

/** T04 헬퍼 — 임의 루트 아래 `docs/features/<slug>/spec.md` 합성(plain 디렉토리 픽스처용). */
function spec2(root: string, slug: string, body: string): void {
  const dir = join(root, "docs", "features", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "spec.md"), body);
}

// ── T05 — 여러 사본의 `Time:` 줄을 정방향으로 합친다 ──
/** 사본 하나를 plain 디렉토리에 합성(git 미사용 — git 병합 로직과 독립적으로 Time 병합만 본다). */
function copyDir(root: string, copy: string, slug: string, ticketBody?: string): string {
  const dir = join(root, copy, "docs", "features", slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "spec.md"), `# ${slug}\n`);
  if (ticketBody !== undefined) {
    mkdirSync(join(dir, "tickets"), { recursive: true });
    writeFileSync(join(dir, "tickets", "T04.md"), ticketBody);
  }
  return join(root, copy);
}
const TICKET_NO_TIME = "# T04 — 티켓\n";
const ticketWithTime = (started: string, finished?: string): string =>
  `# T04 — 티켓\n\nTime: started=${started}${finished ? ` finished=${finished}` : ""}\n`;
/** 상태까지 굴려 본다(T04 3단 규칙이 Time 에서 읽는지 확인) — 백로그 없이. */
const joined = (features: ReturnType<typeof readFeatures>) =>
  applyBacklogStatus(features, [], "", "2026-08-30T00:00:00Z")[0]?.newTickets?.[0];

describe("readFeatures — 여러 사본 Time: 정방향 병합 (T05)", () => {
  let tmp: string;
  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "gootte-time-merge-"));
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("AC1 — main 에 Time: 없고 2nd 에 finished 있으면 화면은 완료(버그 수정)", () => {
    const a = copyDir(tmp, "main", "f", TICKET_NO_TIME);
    const b = copyDir(tmp, "secondmate", "f", ticketWithTime("2026-08-29T10:00:00+09:00", "2026-08-29T11:00:00+09:00"));
    const t = readFeatures([a, b])[0]?.newTickets?.[0];
    expect(t?.startedAt).toBe("2026-08-29T10:00:00+09:00");
    expect(t?.finishedAt).toBe("2026-08-29T11:00:00+09:00");
    expect(joined(readFeatures([a, b]))?.status).toBe("done");
  });

  it("AC2 — 그 반대(main 에 있고 2nd 에 없음)도 화면은 완료", () => {
    const a = copyDir(tmp, "main", "f", ticketWithTime("2026-08-29T10:00:00+09:00", "2026-08-29T11:00:00+09:00"));
    const b = copyDir(tmp, "secondmate", "f", TICKET_NO_TIME);
    const t = readFeatures([a, b])[0]?.newTickets?.[0];
    expect(t?.finishedAt).toBe("2026-08-29T11:00:00+09:00");
    expect(joined(readFeatures([a, b]))?.status).toBe("done");
  });

  it("AC3 — 두 사본 다 없으면 pending(문서 자급: 막히지 않으면 착수 가능), 한쪽만 startedAt 이면 in_progress", () => {
    const a = copyDir(tmp, "main", "f", TICKET_NO_TIME);
    const b = copyDir(tmp, "secondmate", "f", TICKET_NO_TIME);
    const neither = joined(readFeatures([a, b]));
    expect(neither?.status).toBe("pending");
    expect(neither?.joinFailed).toBe(false); // 신관례 자급 — 백로그 없어도 막히지 않은 티켓은 착수 가능(joinFailed 아님)
    expect(neither?.startable).toBe(true);

    const c = copyDir(tmp, "only-started", "f", ticketWithTime("2026-08-29T10:00:00+09:00"));
    expect(joined(readFeatures([a, c]))?.status).toBe("in_progress");
  });

  it("정방향 전용 — 2nd 가 시작하고 main 이 끝냈어도 둘 다 반영(없음으로 안 사라진다)", () => {
    const a = copyDir(tmp, "main", "f", ticketWithTime("2026-08-29T08:00:00+09:00", "2026-08-29T12:00:00+09:00"));
    const b = copyDir(tmp, "secondmate", "f", ticketWithTime("2026-08-29T09:00:00+09:00"));
    const t = readFeatures([a, b])[0]?.newTickets?.[0];
    expect(t?.startedAt).toBe("2026-08-29T08:00:00+09:00"); // main 의 시작이 더 빠르다
    expect(t?.finishedAt).toBe("2026-08-29T12:00:00+09:00"); // main 의 끝이 더 늦다
    expect(joined(readFeatures([a, b]))?.status).toBe("done");
  });

  it("여러 사본이 서로 다른 시각을 둘 다 갖으면 가장 빠른 start · 가장 늦은 finish", () => {
    const a = copyDir(tmp, "main", "f", ticketWithTime("2026-08-29T10:00:00+09:00", "2026-08-29T11:00:00+09:00"));
    const b = copyDir(tmp, "secondmate", "f", ticketWithTime("2026-08-29T09:30:00+09:00", "2026-08-29T13:00:00+09:00"));
    const t = readFeatures([a, b])[0]?.newTickets?.[0];
    expect(t?.startedAt).toBe("2026-08-29T09:30:00+09:00"); // 둘 중 더 빠른 start
    expect(t?.finishedAt).toBe("2026-08-29T13:00:00+09:00"); // 둘 중 더 늦은 finish
    expect(joined(readFeatures([a, b]))?.status).toBe("done");
  });
});
