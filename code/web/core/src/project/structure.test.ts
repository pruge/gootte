import { describe, it, expect } from "vitest";
import type { StateInput } from "../state/model";
import { buildState } from "../state/build";
import { buildStructure, type RawMermaidDoc } from "./structure";
import { extractMermaidBlock } from "../parse/mermaid";

const led = (initiative: string, track: string | null) => ({
  initiative,
  status: "active",
  track,
  deps: [] as string[],
  events: [],
  supersedes: [],
});

const input: StateInput = {
  ledgers: [led("web-dashboard", "W"), led("web-viz", "W"), led("lineage-engine", "E")],
  todos: [],
  sprints: [],
  worktrees: [],
  specPresent: [],
  indexOrder: ["lineage-engine", "web-dashboard", "web-viz"],
  tracks: new Map([
    ["E", "엔진/lineage"],
    ["W", "웹 대시보드"],
  ]),
};
const state = buildState(input);

const doc = (id: string, sources: string[], body: string, status = "living"): RawMermaidDoc => ({
  file: `${id}-x.md`,
  content: `---\nid: ${id}\ntitle: ${id} 제목\nstatus: ${status}\nsources:\n${sources
    .map((s) => `  - ${s}`)
    .join("\n")}\n---\n\n${body}\n`,
});

const MMD = "```mermaid\nflowchart TB\n  a-->b\n```";

describe("extractMermaidBlock", () => {
  it("첫 블록 추출(트림)", () => {
    expect(extractMermaidBlock("전\n```mermaid\nflowchart TB\n  a-->b\n```\n후")).toBe(
      "flowchart TB\n  a-->b",
    );
  });
  it("블록 없으면 null", () => {
    expect(extractMermaidBlock("본문만\n```ts\nconst x=1\n```")).toBeNull();
  });
  it("복수면 첫째만", () => {
    const body = "```mermaid\nA\n```\n\n```mermaid\nB\n```";
    expect(extractMermaidBlock(body)).toBe("A");
  });
});

describe("buildStructure", () => {
  const raw = [
    doc("M-0001", ["docs/roadmap/project-manager/blueprint.md"], MMD), // 횡단 → 시스템
    doc("M-0002", ["docs/roadmap/project-manager/web-dashboard/spec.md"], MMD),
    doc("M-0003", ["docs/roadmap/project-manager/web-viz/spec.md"], MMD, "superseded"),
    doc("M-0099", ["docs/roadmap/project-manager/web-viz/spec.md"], "코드 없음"), // 제외
  ];
  const groups = buildStructure(raw, state);

  it("그룹 순서 = 시스템(null) first → trackOrder(W)", () => {
    expect(groups.map((g) => g.track?.key ?? "SYSTEM")).toEqual(["SYSTEM", "W"]);
  });
  it("시스템 그룹 = 이니셔티브 소스 없는 횡단 그림", () => {
    expect(groups[0]!.track).toBeNull();
    expect(groups[0]!.diagrams.map((d) => d.id)).toEqual(["M-0001"]);
  });
  it("W 그룹 = sources 이니셔티브→track 파생, M-ID asc", () => {
    const w = groups[1]!;
    expect(w.track).toEqual({ key: "W", label: "웹 대시보드" });
    expect(w.diagrams.map((d) => d.id)).toEqual(["M-0002", "M-0003"]);
  });
  it("status 매핑(living/superseded) + 코드 추출", () => {
    const w = groups[1]!;
    expect(w.diagrams.find((d) => d.id === "M-0003")!.status).toBe("superseded");
    expect(w.diagrams.find((d) => d.id === "M-0002")!.status).toBe("living");
    expect(w.diagrams[0]!.code).toContain("flowchart TB");
  });
  it("mermaid 블록 없는 그림 제외(M-0099)", () => {
    const ids = groups.flatMap((g) => g.diagrams.map((d) => d.id));
    expect(ids).not.toContain("M-0099");
  });
  it("빈 입력 → 빈 그룹", () => {
    expect(buildStructure([], state)).toEqual([]);
  });
});
