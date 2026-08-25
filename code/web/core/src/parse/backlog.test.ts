import { describe, expect, it } from "vitest";
import { parseBacklog } from "./backlog";

/** firstmate 홈 백로그(`data/backlog.md`) 픽스처 — 이 저장소 자신의 백로그를 픽스처로 쓰지 않는다. */
const BACKLOG = `# Backlog

## In flight
- [ ] widget-tauri-t04 - New-convention docs tree + backlog status join blocked-by: widget-tauri-t02 (repo: widget) (kind: ship) (since 2026-08-25)
- [ ] widget-tauri - Tauri desktop app (repo: widget) (kind: ship) (since 2026-08-25)
  Grill round-1 complete. Artifacts: projects/widget/docs/features/tauri-desktop-app/. Decisions D1-D5 in grill.md.
## Queued
- [ ] widget-tauri-t05 - T-review: captain acceptance blocked-by: widget-tauri-t04 (repo: widget) (kind: ship) (since 2026-08-25)
## Done
- [x] widget-tauri-t03 - FS event realtime watching https://github.com/widget/widget/pull/55 blocked-by: widget-tauri-t02 (repo: widget) (kind: ship) (merged 2026-08-25)
`;

describe("parseBacklog", () => {
  it("절 헤딩으로 작업을 나눈다", () => {
    const tasks = parseBacklog(BACKLOG);
    expect(tasks.map((t) => [t.id, t.section, t.checked])).toEqual([
      ["widget-tauri-t04", "in_flight", false],
      ["widget-tauri", "in_flight", false],
      ["widget-tauri-t05", "queued", false],
      ["widget-tauri-t03", "done", true],
    ]);
  });

  it("`(repo: ...)` 를 읽는다", () => {
    const tasks = parseBacklog(BACKLOG);
    expect(tasks.every((t) => t.repo === "widget")).toBe(true);
  });

  it("들여쓴 메모를 바로 위 작업에 붙인다", () => {
    const [, parent] = parseBacklog(BACKLOG);
    expect(parent?.note).toContain("projects/widget/docs/features/tauri-desktop-app/");
  });

  it("완료 작업의 URL·머지일을 읽는다", () => {
    const tasks = parseBacklog(BACKLOG);
    const done = tasks.find((t) => t.id === "widget-tauri-t03");
    expect(done?.url).toBe("https://github.com/widget/widget/pull/55");
    expect(done?.since).toBe("2026-08-25");
  });

  it("절 헤딩 전에 나온 줄은 세지 않는다(소속을 모르는 작업은 조인 대상이 아니다)", () => {
    const tasks = parseBacklog("- [ ] orphan-t01 - 헤딩 없는 작업 (repo: x) (kind: ship) (since 2026-08-25)\n");
    expect(tasks).toEqual([]);
  });

  it("빈 문서는 빈 목록이다", () => {
    expect(parseBacklog("")).toEqual([]);
  });
});
