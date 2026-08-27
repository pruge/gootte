import { describe, expect, it } from "vitest";
import { parseBacklog } from "./backlog";
import { joinTicketBacklog } from "../project/backlog-join";

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

  /** 실물 모양 — 티켓 경로 메모와 `time:` 줄이 나란히 산다(spec D2). */
  const WITH_TIME = `# Backlog

## In flight
- [ ] widget-tauri-t04 - New-convention docs tree (repo: widget) (kind: ship) (since 2026-08-25)
  Artifacts: projects/widget/docs/features/tauri-desktop-app/.
  time: started=2026-08-27T12:48:43+09:00 finished=2026-08-27T13:02:43+09:00
`;

  it("`time:` 줄에서 착수·완료 시각을 읽는다(기존 메모와 나란히)", () => {
    const [task] = parseBacklog(WITH_TIME);
    expect(task?.startedAt).toBe("2026-08-27T12:48:43+09:00");
    expect(task?.finishedAt).toBe("2026-08-27T13:02:43+09:00");
    expect(task?.note).toContain("projects/widget/docs/features/tauri-desktop-app/");
  });

  it("`finished=` 가 없으면 진행 중 — finishedAt 은 null", () => {
    const doc = `## In flight
- [ ] a-t01 - x (repo: r)
  time: started=2026-08-27T12:00:00+09:00
`;
    const [task] = parseBacklog(doc);
    expect(task?.startedAt).toBe("2026-08-27T12:00:00+09:00");
    expect(task?.finishedAt).toBeNull();
  });

  it("`time:` 줄이 없으면 startedAt·finishedAt 모두 null", () => {
    const [task] = parseBacklog(BACKLOG);
    expect(task?.startedAt).toBeNull();
    expect(task?.finishedAt).toBeNull();
  });

  it("`time:` 줄이 여러 번이면 첫 줄이 이긴다(Status: 파싱과 같은 규율)", () => {
    const doc = `## In flight
- [ ] a-t01 - x (repo: r)
  time: started=2026-08-27T10:00:00+09:00 finished=2026-08-27T10:10:00+09:00
  time: started=2026-08-27T20:00:00+09:00 finished=2026-08-27T20:10:00+09:00
`;
    const [task] = parseBacklog(doc);
    expect(task?.startedAt).toBe("2026-08-27T10:00:00+09:00");
    expect(task?.finishedAt).toBe("2026-08-27T10:10:00+09:00");
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

  /** 실물 백로그 모양 — 부모 작업 메모가 문단 사이 빈 줄을 낀다. */
  const MULTIPARAGRAPH = `# Backlog

## In flight
- [ ] widget-tauri - Tauri desktop app (repo: widget) (kind: ship) (since 2026-08-25)
  Grill round-1 complete. Decisions D1-D5 in grill.md.

  New-convention tickets live under docs/features/tauri-desktop-app/ — status joins from this backlog.

## Done
- [x] widget-tauri-t03 - FS event realtime watching https://github.com/widget/widget/pull/55 (repo: widget) (merged 2026-08-25)
`;

  it("빈 줄이 낀 메모도 문단 전부를 붙인다 — 빈 줄은 메모 블록을 끊지 않는다", () => {
    const [parent] = parseBacklog(MULTIPARAGRAPH);
    expect(parent?.id).toBe("widget-tauri");
    expect(parent?.note).toContain("Grill round-1 complete. Decisions D1-D5 in grill.md.");
    expect(parent?.note).toContain(
      "New-convention tickets live under docs/features/tauri-desktop-app/",
    );
    expect(parent?.note.split("\n")).toHaveLength(2); // 문단 둘이 빈 줄을 넘어 이어진다
  });

  it("빈 줄이 낀 메모로 joinTicketBacklog 이 성공한다(부모 + <parent>-t<NN>", () => {
    const tasks = parseBacklog(MULTIPARAGRAPH);
    const result = joinTicketBacklog(tasks, "widget", "tauri-desktop-app", "03");
    expect(result).toEqual({
      status: "done",
      url: "https://github.com/widget/widget/pull/55",
      completedAt: "2026-08-25",
    });
  });

  it("들여쓰기 없는 본문 줄은 여전히 메모를 끊는다", () => {
    const doc = `## In flight
- [ ] a-t01 - first (repo: r)
  first note
unindented body line
  orphan line — 어느 작업에도 안 붙는다
- [ ] a-t02 - second (repo: r)
  second note
`;
    const [first, second] = parseBacklog(doc);
    expect(first?.note).toBe("first note");
    expect(second?.note).toBe("second note");
  });

  it("절 헤딩과 작업 줄도 여전히 메모를 끊는다", () => {
    const doc = `## In flight
- [ ] a-t01 - first (repo: r)
  note one
## Queued
- [ ] a-t02 - second (repo: r)
  note two
`;
    const tasks = parseBacklog(doc);
    expect(tasks.map((t) => t.note)).toEqual(["note one", "note two"]);
  });
});
