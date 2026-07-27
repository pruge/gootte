import { describe, it, expect } from "vitest";
import { createLiveHub, type LiveSocket } from "../src/live";

describe("createLiveHub (022)", () => {
  it("broadcast → 연결된 모든 소켓에 ChangeEvent JSON", () => {
    const hub = createLiveHub();
    const a: string[] = [];
    const b: string[] = [];
    const sa: LiveSocket = { send: (d) => a.push(d) };
    const sb: LiveSocket = { send: (d) => b.push(d) };
    hub.add(sa);
    hub.add(sb);
    expect(hub.size()).toBe(2);

    hub.broadcast({ kind: "project", project: "alpha" });
    expect(a).toEqual(['{"kind":"project","project":"alpha"}']);
    expect(b).toEqual(['{"kind":"project","project":"alpha"}']);
  });

  it("send 실패 소켓은 broadcast 중 제거, remove 로도 제거", () => {
    const hub = createLiveHub();
    const ok: string[] = [];
    const bad: LiveSocket = {
      send: () => {
        throw new Error("closed");
      },
    };
    const good: LiveSocket = { send: (d) => ok.push(d) };
    hub.add(bad);
    hub.add(good);

    hub.broadcast({ kind: "projects" });
    expect(hub.size()).toBe(1); // 끊긴 bad 제거
    expect(ok).toEqual(['{"kind":"projects"}']);

    hub.remove(good);
    expect(hub.size()).toBe(0);
  });
});
