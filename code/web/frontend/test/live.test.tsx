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

describe("useLiveSync", () => {
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

  it("project 메시지 → 그 프로젝트 쿼리 + projects 목록(worktree 카운트) invalidate", () => {
    qc.setQueryData(["plan", "alpha"], 1);
    qc.setQueryData(["doc", "alpha", "todo", "x"], 1);
    qc.setQueryData(["plan", "beta"], 1);
    qc.setQueryData(["projects"], []);
    render(<Harness qc={qc} />);
    const ws = MockWS.instances[0]!;
    ws.open(); // firstOpen — 전체 invalidate 안 함

    expect(invalidated(qc, ["plan", "alpha"])).toBe(false);
    ws.emit({ kind: "project", project: "alpha" });
    expect(invalidated(qc, ["plan", "alpha"])).toBe(true);
    expect(invalidated(qc, ["doc", "alpha", "todo", "x"])).toBe(true);
    expect(invalidated(qc, ["projects"])).toBe(true); // 목록 worktree 카운트 갱신
    expect(invalidated(qc, ["plan", "beta"])).toBe(false); // 다른 프로젝트 무영향
  });

  it("plan 메시지(development-order/07) → plan 쿼리 전부 invalidate, 다른 쿼리는 그대로", () => {
    qc.setQueryData(["plan", "alpha"], 1);
    qc.setQueryData(["plan", "beta"], 1);
    qc.setQueryData(["doc", "alpha", "todo", "x"], 1);
    qc.setQueryData(["projects"], []);
    render(<Harness qc={qc} />);
    const ws = MockWS.instances[0]!;
    ws.open();
    ws.emit({ kind: "plan" });
    // 🔴 project 가 없어 어느 프로젝트인지 모른다 — plan 쿼리는 전부(alpha·beta 둘 다) invalidate.
    expect(invalidated(qc, ["plan", "alpha"])).toBe(true);
    expect(invalidated(qc, ["plan", "beta"])).toBe(true);
    // plan 이 아닌 쿼리는 안 건드린다.
    expect(invalidated(qc, ["doc", "alpha", "todo", "x"])).toBe(false);
    expect(invalidated(qc, ["projects"])).toBe(false);
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

  it("backlog 메시지(tauri-desktop-app T03) → 전체 invalidate(조인이 어느 뷰에 섞일지 모르는 coarse)", () => {
    qc.setQueryData(["projects"], []);
    qc.setQueryData(["plan", "alpha"], 1);
    qc.setQueryData(["doc", "alpha", "todo", "x"], 1);
    render(<Harness qc={qc} />);
    const ws = MockWS.instances[0]!;
    ws.open();

    expect(invalidated(qc, ["projects"])).toBe(false);
    ws.emit({ kind: "backlog" });
    // 백로그 조인(T04)은 어느 프로젝트 줄에 섞일지 모른다 — 결정적 리더가 전부 다시 읽게 한다(INV-4).
    expect(invalidated(qc, ["projects"])).toBe(true);
    expect(invalidated(qc, ["plan", "alpha"])).toBe(true);
    expect(invalidated(qc, ["doc", "alpha", "todo", "x"])).toBe(true);
  });

  it("watch-fallback(tauri-desktop-app T03): active:true → 주기 풀스캔 폴러, active:false → 해제(CPU 안정)", () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(qc, "invalidateQueries");
    render(<Harness qc={qc} />);
    const ws = MockWS.instances[0]!;
    ws.open();

    ws.emit({ kind: "watch-fallback", active: true });
    vi.advanceTimersByTime(5_000);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5_000);
    expect(spy).toHaveBeenCalledTimes(2);

    // 회복 신호 → 폴러 해제. 이후 아무리 기다려도 invalidate 가 늘지 않는다.
    ws.emit({ kind: "watch-fallback", active: false });
    spy.mockClear();
    vi.advanceTimersByTime(60_000);
    expect(spy).not.toHaveBeenCalled();

    // 같은 신호가 되풀이돼도 타이머는 하나다 — 중복 기동 없음.
    ws.emit({ kind: "watch-fallback", active: true });
    ws.emit({ kind: "watch-fallback", active: true });
    vi.advanceTimersByTime(5_000);
    expect(spy).toHaveBeenCalledTimes(1);
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
