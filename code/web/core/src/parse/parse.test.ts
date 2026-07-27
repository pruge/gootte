import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { parseTodo, parseSprint, parseAdr, parseLedger, parseIndex } from "./index";

const here = fileURLToPath(new URL(".", import.meta.url));
const FX = join(here, "..", "__fixtures__", "jinwooauto");
const read = (f: string) => readFileSync(join(FX, f), "utf8");

describe("parse — jinwooauto 실 fixture", () => {
  it("todo frontmatter", () => {
    const t = parseTodo("weather-report-per-site", read("todo-sample.md"));
    expect(t.status).toBe("pending");
    expect(t.priority).toBe("low");
    expect(t.initiative).toBe("weather-report-per-site");
    expect(t.created).toBe("2026-06-18");
  });

  it("sprint frontmatter (+날짜 — Gantt 소스)", () => {
    const s = parseSprint("auth-hardening", read("sprint-sample.md"));
    expect(s.status).toBe("pending");
    expect(s.todos.length).toBeGreaterThan(0);
    expect(s.worktree).toBeNull();
    expect(s.created).toBe("2026-06-26"); // 날짜 파싱
    expect(s.startedAt).toBeUndefined(); // 없으면 undefined
  });

  it("adr Status/Date/id", () => {
    const a = parseAdr(read("adr-sample.md"));
    expect(a.id).toBe("ADR-0001");
    expect(a.status).toBe("accepted");
    expect(a.date).toBe("2026-07-01");
    expect(a.supersededBy).toBeNull();
  });

  it("ledger — 산문 fallback (## events 없음)", () => {
    const l = parseLedger("alarm-model-owner-based", read("ledger-sample.md"));
    expect(l.status).toBe("shipped"); // ✅
    expect(l.events).toHaveLength(0); // 구조화 없음 → fallback
    expect(Array.isArray(l.supersedes)).toBe(true);
  });

  it("INDEX Now/Next 순서", () => {
    const idx = parseIndex(read("INDEX.md"));
    expect(idx.order.length).toBeGreaterThan(0);
    expect(idx.order).toContain("control-execution-role-separation");
  });
});

describe("parse — 기록계약 하이브리드 (구조화 ## events)", () => {
  const withEvents = `# feat — ledger
- 상태: 🔜 active · 트랙: D · 의존: 없음
## events
- kind: re-kickoff
  at: 2026-07-19T14:00
  trigger: "read 스택 detour 발견"
  interrupted: calc-linear-tfull
  supersedes: [ADR-0005]
  spawns: [read-generic-targets]
## supersede
- supersedes ADR-0005 — loop 재설계 (ADR-0008)
`;

  it("구조화 events 파싱 (권위 있는 trigger)", () => {
    const l = parseLedger("feat", withEvents);
    expect(l.status).toBe("active");
    expect(l.events).toHaveLength(1);
    expect(l.events[0]?.kind).toBe("re-kickoff");
    expect(l.events[0]?.trigger).toContain("detour");
    expect(l.events[0]?.interrupted).toBe("calc-linear-tfull");
    expect(l.events[0]?.supersedes).toContain("ADR-0005");
    expect(l.supersedes).toContain("ADR-0005");
  });
});

describe("parse — ledger 트랙 프로즈 형식 관용 (볼드/전각콜론)", () => {
  const ledger = (trackLine: string) =>
    `# feat — ledger\n- **상태**: 🔜 active\n${trackLine}\n- **의존**: 없음\n`;

  it("볼드 `- **트랙**: F` (트랙**:) 를 인식 — 원문 반환", () => {
    // 회귀: jinwooauto gateway-bus-hang-fix 등 다수가 볼드 형식 → 옛 `/트랙:/` 이 놓쳐 미분류 오탐.
    const l = parseLedger("feat", ledger("- **트랙**: F(실시간 / 게이트웨이 오케스트레이션)"));
    expect(l.track).toBe("F(실시간 / 게이트웨이 오케스트레이션)");
  });

  it("비볼드 `- 트랙: G — legacy` 무회귀", () => {
    const l = parseLedger("feat", ledger("- 트랙: G — legacy/living-spec"));
    expect(l.track).toBe("G — legacy/living-spec");
  });

  it("전각 콜론 `트랙：C` 도 인식", () => {
    const l = parseLedger("feat", ledger("- 트랙：C(제어 알고리즘)"));
    expect(l.track).toBe("C(제어 알고리즘)");
  });

  it("frontmatter track 이 프로즈보다 우선", () => {
    const l = parseLedger("feat", `---\ntrack: A\n---\n# feat\n- **트랙**: F(무시됨)\n`);
    expect(l.track).toBe("A");
  });
});
