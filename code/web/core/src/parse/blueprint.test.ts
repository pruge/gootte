import { describe, it, expect } from "vitest";
import { parseBlueprint } from "./blueprint";

const BLUEPRINT = `# blueprint — project-manager

## goal
여러 cling 프로젝트를 관리.

## phases — 로드맵
| phase | capability | dep |
|---|---|---|
| **1 · lineage-engine** ✅ done | CORE | — |
| **1b · lineage-supersede** ✅ done | supersede | 1 |
| **2a · web-dashboard** ✅ done | Hono | 1b |
| **2b · web-realtime** 🔜 Now | WS | 2a |
| **2c · web-viz** 🔜 Next | 칸반 | 2a |
| **3 · remote-mobile** ⬜ Later | 터널 | 2 |

## open
- 나중에.
`;

describe("019 parseBlueprint — ## phases 표 → 이니셔티브", () => {
  const phases = parseBlueprint(BLUEPRINT);

  it("표 행만 파싱(헤더·구분선 제외)", () => {
    expect(phases.map((p) => p.slug)).toEqual([
      "lineage-engine",
      "lineage-supersede",
      "web-dashboard",
      "web-realtime",
      "web-viz",
      "remote-mobile",
    ]);
  });

  it("이모지 → 상태 매핑(✅ shipped · 🔜 active · ⬜ planned)", () => {
    const bySlug = Object.fromEntries(phases.map((p) => [p.slug, p.status]));
    expect(bySlug["lineage-engine"]).toBe("shipped");
    expect(bySlug["web-realtime"]).toBe("active");
    expect(bySlug["remote-mobile"]).toBe("planned");
  });

  it("표 순서 = order (indexOrder 대체)", () => {
    expect(phases.map((p) => p.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(phases[0]?.num).toBe("1");
    expect(phases[3]?.num).toBe("2b");
  });

  it("phases 섹션 밖 표/텍스트는 무시", () => {
    const noPhases = "# x\n## other\n| a · b **c** ✅ | |\n";
    // '## phases' 없으면 전체를 훑되, 형식 안 맞으면 빈 배열
    expect(parseBlueprint(noPhases)).toEqual([]);
  });
});
