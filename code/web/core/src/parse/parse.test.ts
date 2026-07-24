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
