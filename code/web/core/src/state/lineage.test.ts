import { describe, it, expect } from "vitest";
import type { Supersession, TodoItem } from "@gootte/contract";
import { buildLineage, supersedeKind } from "./lineage";
import { buildState } from "./build";
import type { StateInput } from "./model";
import { parseIndex } from "../parse/index-doc";
import { renderLineage } from "../project/render";

describe("supersedeKind — B1 우선순위 reference > partial > supersede", () => {
  it("판정", () => {
    expect(supersedeKind("참조됨(소비)")).toBe("reference");
    expect(supersedeKind("mode 유지(부분)")).toBe("supersede-partial");
    expect(supersedeKind("feature 은퇴")).toBe("supersede");
    expect(supersedeKind("유지하나 참조됨")).toBe("reference"); // reference 우선
  });
});

describe("buildLineage — supersede/ADR/drop 채움", () => {
  const supersessions: Supersession[] = [
    { old: "ghost-house", new: "space", ledger: "owner-space", adr: ["ADR-0005"], note: "feature 은퇴" },
    { old: "cag mode", new: "slot mode", ledger: "algo", adr: [], note: "mode 유지(부분)" },
  ];
  const todos: TodoItem[] = [
    { slug: "t-drop", status: "dropped", priority: "normal", initiative: "x", created: "2026-07-01", resolvedBy: "y/ADR-0004 (흡수)" },
    { slug: "t-live", status: "pending", priority: "normal", initiative: "x", created: "2026-07-01" },
  ];
  const fill = buildLineage({
    supersessions,
    adrs: [{ id: "ADR-0001", title: "", status: "superseded", supersededBy: "ADR-0014", date: "2026-07-01" }],
    todos,
  });

  it("supersession → edge (kind·note verbatim·adr)", () => {
    const e = fill.edges.find((x) => x.to === "space");
    expect(e?.kind).toBe("supersede");
    expect(e?.note).toBe("feature 은퇴");
    expect(e?.adr).toContain("ADR-0005");
    expect(fill.edges.find((x) => x.to === "slot mode")?.kind).toBe("supersede-partial");
  });

  it("ADR 체인 → adr 노드 + supersede edge", () => {
    expect(fill.nodes.find((n) => n.id === "ADR-0001" && n.kind === "adr")).toBeTruthy();
    expect(fill.edges.find((x) => x.from === "ADR-0001" && x.to === "ADR-0014")).toBeTruthy();
  });

  it("drop → DropRecord + edge (resolvedBy verbatim + ADR 추출)", () => {
    expect(fill.drops).toHaveLength(1);
    expect(fill.drops[0]?.todo).toBe("t-drop");
    expect(fill.drops[0]?.resolvedBy).toContain("흡수");
    expect(fill.edges.find((x) => x.from === "t-drop")?.adr).toContain("ADR-0004");
  });
});

describe("parseIndex — Supersession 섹션", () => {
  const index = `## Now/Next
1. **[a](a/ledger.md)** 🔜
## 🔗 Supersession 색인
1. ghost-house → **space** — [owner-space](owner-space/ledger.md) (ADR-0005, feature 은퇴)
2. cag → **control-fsm** — [control-fsm](control-fsm/ledger.md) (ADR-0003)
## 끝
`;
  it("체인 파싱 (old/new/ledger/adr)", () => {
    const { supersessions } = parseIndex(index);
    expect(supersessions).toHaveLength(2);
    expect(supersessions[0]).toMatchObject({ old: "ghost-house", new: "space", ledger: "owner-space" });
    expect(supersessions[0]?.adr).toContain("ADR-0005");
  });
});

describe("renderLineage — verbatim 텍스트 (INV-4)", () => {
  it("supersede 체인 + drop", () => {
    const input: StateInput = {
      ledgers: [{ initiative: "x", status: "active", track: null, deps: [], events: [], supersedes: [] }],
      todos: [{ slug: "t-drop", status: "dropped", priority: "normal", initiative: "x", created: "2026-07-01", resolvedBy: "y (흡수)" }],
      sprints: [],
      worktrees: [],
      specPresent: [],
      supersessions: [{ old: "o", new: "n", ledger: "x", adr: ["ADR-1"], note: "왜왜왜" }],
      adrs: [],
    };
    const txt = renderLineage(buildState(input), "proj");
    expect(txt).toContain("o → **n**");
    expect(txt).toContain("왜왜왜"); // note verbatim (요약 X)
    expect(txt).toContain("t-drop");
    expect(txt).toContain("흡수"); // resolvedBy verbatim
  });
});
