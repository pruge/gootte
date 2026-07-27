import { render } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLiveSync } from "../src/lib/live";

class MockWS {
  static instances: MockWS[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  constructor(public url: string) {
    MockWS.instances.push(this);
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

function Harness({ qc }: { qc: QueryClient }) {
  useLiveSync(qc);
  return null;
}

const invalidated = (qc: QueryClient, key: unknown[]): boolean =>
  qc.getQueryState(key)?.isInvalidated ?? false;

describe("useLiveSync (023)", () => {
  let qc: QueryClient;

  beforeEach(() => {
    vi.stubGlobal("WebSocket", MockWS);
    MockWS.instances = [];
    qc = new QueryClient();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("project 메시지 → 그 프로젝트 쿼리만 invalidate", () => {
    qc.setQueryData(["plan", "alpha"], 1);
    qc.setQueryData(["doc", "alpha", "todo", "x"], 1);
    qc.setQueryData(["plan", "beta"], 1);
    render(<Harness qc={qc} />);
    const ws = MockWS.instances[0]!;
    ws.open(); // firstOpen — 전체 invalidate 안 함

    expect(invalidated(qc, ["plan", "alpha"])).toBe(false);
    ws.emit({ kind: "project", project: "alpha" });
    expect(invalidated(qc, ["plan", "alpha"])).toBe(true);
    expect(invalidated(qc, ["doc", "alpha", "todo", "x"])).toBe(true);
    expect(invalidated(qc, ["plan", "beta"])).toBe(false); // 다른 프로젝트 무영향
  });

  it("projects 메시지 → projects 쿼리만 invalidate", () => {
    qc.setQueryData(["projects"], []);
    qc.setQueryData(["plan", "alpha"], 1);
    render(<Harness qc={qc} />);
    const ws = MockWS.instances[0]!;
    ws.open();
    ws.emit({ kind: "projects" });
    expect(invalidated(qc, ["projects"])).toBe(true);
    expect(invalidated(qc, ["plan", "alpha"])).toBe(false);
  });

  it("잘못된 메시지는 무시(invalidate 없음)", () => {
    qc.setQueryData(["plan", "alpha"], 1);
    render(<Harness qc={qc} />);
    const ws = MockWS.instances[0]!;
    ws.open();
    ws.emit({ kind: "nope" });
    expect(invalidated(qc, ["plan", "alpha"])).toBe(false);
  });

  it("끊기면 재연결 + 재연결 open 시 전체 invalidate(놓친 변경 흡수)", () => {
    vi.useFakeTimers();
    qc.setQueryData(["plan", "alpha"], 1);
    render(<Harness qc={qc} />);
    const ws0 = MockWS.instances[0]!;
    ws0.open(); // first open — invalidate 안 함
    ws0.close(); // onclose → backoff 재연결 스케줄
    vi.advanceTimersByTime(500);
    expect(MockWS.instances.length).toBe(2); // 재연결됨

    MockWS.instances[1]!.open(); // 재연결 open → 전체 invalidate
    expect(invalidated(qc, ["plan", "alpha"])).toBe(true);
  });
});
