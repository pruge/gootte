import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { beforeAll, describe, it, expect } from "vitest";
import { discoverProjects } from "@gootte/core-io";
import { planText, discoverText } from "./commands";

function w(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

const todo = (init: string, prio: string) =>
  `---\nstatus: pending\npriority: ${prio}\ninitiative: ${init}\ncreated: 2026-07-01\n---\n# ${init} todo\n`;

describe("cli — 프로젝트 로드 → plan (T8·T10 wiring)", () => {
  let proj: string;
  beforeAll(() => {
    proj = mkdtempSync(join(tmpdir(), "gootte-proj-"));
    w(proj, ".cling/profile.md", "# profile\n");
    w(
      proj,
      "docs/roadmap/INDEX.md",
      "## Now/Next\n1. **[alpha](alpha/ledger.md)** 🔜\n2. **[beta](beta/ledger.md)** ⬜\n",
    );
    w(
      proj,
      "docs/roadmap/alpha/ledger.md",
      "# alpha — ledger\n- 상태: 🔜 active · 트랙: A · 의존: 없음\n## supersede\n- —\n",
    );
    w(proj, "docs/roadmap/alpha/spec.md", "# spec\n");
    w(proj, "docs/roadmap/beta/ledger.md", "# beta — ledger\n- 상태: ⬜ planned · 트랙: B · 의존: gamma\n");
    w(proj, "docs/todo/t-alpha.md", todo("alpha", "high"));
    w(proj, "docs/todo/t-beta.md", todo("beta", "normal"));
  });

  it("planText — 순서(alpha → beta) + 왜 섹션", () => {
    const txt = planText(proj);
    expect(txt).toContain("## 왜 이 순서");
    expect(txt.indexOf("alpha")).toBeGreaterThanOrEqual(0);
    expect(txt.indexOf("alpha")).toBeLessThan(txt.indexOf("beta"));
  });

  it("planText — beta 는 blocked(gamma 선행)", () => {
    expect(planText(proj)).toMatch(/blocked.*gamma/);
  });

  it("discover — .cling/profile.md 탐지", () => {
    expect(discoverProjects([proj]).map((p) => p.slug)).toContain(basename(proj));
    expect(discoverText([proj])).toContain(basename(proj));
  });
});
