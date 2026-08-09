import { describe, expect, it } from "vitest";
import type { Feature, FeatureTicket } from "@gootte/contract";
import { parseTicketPath } from "../parse/ticket-path";
import { applyInProgress, type CopyState, type ObservedCopy } from "./in-progress";

const ticket = (num: string, slug: string, over: Partial<FeatureTicket> = {}): FeatureTicket => ({
  num,
  slug,
  title: slug,
  status: "pending",
  sourceStatus: "ready-for-agent",
  statusKnown: true,
  blockedBy: [],
  waitingOn: [],
  startable: true,
  workedBy: [],
  ...over,
});

const feature = (slug: string, tickets: FeatureTicket[]): Feature => ({
  slug,
  title: slug,
  status: "pending",
  sourceStatus: "ready-for-agent",
  statusKnown: true,
  tickets,
});

const copy = (slug: string, branch: string, touched: string[] = []): ObservedCopy => ({
  slug,
  path: `/tmp/${slug}`,
  state: branch ? "working" : "idle",
  branch,
  touched,
});
const broken = (slug: string, state: CopyState): ObservedCopy => ({
  slug,
  path: `/tmp/${slug}`,
  state,
  branch: "",
  touched: [],
});

const scan = (copies: ObservedCopy[]) => ({ root: "/tmp/th", rootExists: true, copies });

const FEATURES = [
  feature("auth", [ticket("01", "01-session"), ticket("02", "02-screen")]),
  feature("billing", [ticket("01", "01-plan")]),
];
const find = (features: Feature[], f: string, t: string) =>
  features.find((x) => x.slug === f)?.tickets.find((x) => x.slug === t);

describe("parseTicketPath — 경로 하나가 티켓을 가리키는가", () => {
  it("티켓 파일이면 기능·번호·슬러그로 쪼갠다", () => {
    expect(parseTicketPath("docs/features/auth/issues/02-screen.md")).toEqual({
      feature: "auth",
      slug: "02-screen",
      num: "02",
    });
  });

  it("티켓이 아닌 문서는 티켓이 아니다 — 같은 폴더여도 어느 티켓 작업인지 정해지지 않는다", () => {
    for (const p of [
      "docs/features/auth/spec.md",
      "docs/features/auth/adr/0001-x.md",
      "docs/features/auth/issues/nested/02-x.md",
      "docs/agents/domain.md",
      "code/web/core/src/index.ts",
      "",
    ])
      expect(parseTicketPath(p)).toBeNull();
  });

  it("번호 없는 티켓 파일도 버리지 않는다 — num 만 빈 문자열", () => {
    expect(parseTicketPath("docs/features/auth/issues/hotfix.md")?.slug).toBe("hotfix");
    expect(parseTicketPath("docs/features/auth/issues/hotfix.md")?.num).toBe("");
  });
});

describe("applyInProgress — 붙들려 있는 티켓 계산", () => {
  it("작업 가지의 커밋이 건드린 티켓이 처리중이 된다", () => {
    const { features, inProgress } = applyInProgress(
      FEATURES,
      scan([copy("pool/1", "fm/x", ["docs/features/auth/issues/02-screen.md", "README.md"])]),
    );

    expect(find(features, "auth", "02-screen")?.status).toBe("in_progress");
    expect(find(features, "auth", "02-screen")?.workedBy).toEqual(["fm/x"]);
    expect(find(features, "auth", "01-session")?.status).toBe("pending");
    expect(inProgress).toMatchObject({ copies: 1, working: 1, tickets: 1, unknown: [] });
  });

  it("유휴 사본(detached)은 아무 티켓도 처리중으로 만들지 않는다", () => {
    const { features, inProgress } = applyInProgress(
      FEATURES,
      scan([copy("pool/1", "", ["docs/features/auth/issues/02-screen.md"])]),
    );

    expect(features.flatMap((f) => f.tickets).every((t) => t.status === "pending")).toBe(true);
    expect(inProgress).toMatchObject({ copies: 1, working: 0, tickets: 0, unknown: [] });
  });

  it("🔴 티켓을 못 밝힌 작업중 사본은 사라지지 않고 미상으로 세어진다", () => {
    const { features, inProgress } = applyInProgress(
      FEATURES,
      scan([copy("pool/1", "fm/mystery", ["code/web/core/src/index.ts"])]),
    );

    expect(features.flatMap((f) => f.tickets).every((t) => t.status === "pending")).toBe(true);
    expect(inProgress.tickets).toBe(0);
    expect(inProgress.working).toBe(1); // 작업중이라는 사실 자체는 남는다
    expect(inProgress.unknown).toEqual([
      { slug: "pool/1", branch: "fm/mystery", path: "/tmp/pool/1" },
    ]);
  });

  it("목록에 없는 티켓 파일을 건드린 작업도 미상이다 — 화면에 없는 것에 표시를 붙일 수 없다", () => {
    const { inProgress } = applyInProgress(
      FEATURES,
      scan([copy("pool/1", "fm/gone", ["docs/features/auth/issues/99-deleted.md"])]),
    );
    expect(inProgress.unknown.map((u) => u.branch)).toEqual(["fm/gone"]);
  });

  it("한 티켓을 두 사본이 붙들어도 티켓은 한 번만 센다", () => {
    const path = "docs/features/auth/issues/02-screen.md";
    const { features, inProgress } = applyInProgress(
      FEATURES,
      scan([copy("pool/1", "fm/a", [path]), copy("pool/2", "fm/b", [path])]),
    );

    expect(inProgress.tickets).toBe(1); // 티켓 수 — 사본 수가 아니다
    expect(inProgress.working).toBe(2);
    expect(find(features, "auth", "02-screen")?.workedBy).toEqual(["fm/a", "fm/b"]);
  });

  it("끝난 일은 다시 처리중이 되지 않는다 — 붙들고 있는 가지만 실린다", () => {
    const features = [feature("auth", [ticket("01", "01-session", { status: "done" })])];
    const marked = applyInProgress(
      features,
      scan([copy("pool/1", "fm/a", ["docs/features/auth/issues/01-session.md"])]),
    );

    expect(find(marked.features, "auth", "01-session")?.status).toBe("done");
    expect(find(marked.features, "auth", "01-session")?.workedBy).toEqual(["fm/a"]);
    expect(marked.inProgress.tickets).toBe(0);
    expect(marked.inProgress.unknown).toEqual([]); // 이어졌으므로 미상이 아니다
  });

  it("🔴 상태를 못 읽은 사본을 유휴로 접지 않는다 — 따로 세어 드러낸다", () => {
    const { inProgress } = applyInProgress(
      FEATURES,
      scan([broken("pool/1", "git-failed"), broken("pool/2", "no-repo"), copy("pool/3", "")]),
    );

    // 유휴로 접으면 `working` 도 `unknown` 도 아닌 곳으로 사라져 아무 데도 안 남는다.
    expect(inProgress.unreadable).toEqual([
      { slug: "pool/1", path: "/tmp/pool/1", reason: "git-failed" },
      { slug: "pool/2", path: "/tmp/pool/2", reason: "no-repo" },
    ]);
    expect(inProgress.copies).toBe(3); // 못 읽은 것까지 사본 수에 든다
    expect(inProgress.working).toBe(0); // 작업중이라고 단정하지도 않는다
    expect(inProgress.unknown).toEqual([]);
  });

  it("입력을 고치지 않는다 — 파생물은 새 객체다(INV-1)", () => {
    applyInProgress(
      FEATURES,
      scan([copy("pool/1", "fm/x", ["docs/features/auth/issues/02-screen.md"])]),
    );
    expect(find([...FEATURES], "auth", "02-screen")?.status).toBe("pending");
  });
});
