import type { ChangeEvent } from "@gootte/contract";

/** WS 소켓 최소 인터페이스 — @hono/node-ws WSContext(.send) 및 테스트 mock 공용. */
export interface LiveSocket {
  send(data: string): void;
}

export interface LiveHub {
  add(s: LiveSocket): void;
  remove(s: LiveSocket): void;
  size(): number;
  broadcast(ev: ChangeEvent): void;
}

/**
 * 연결된 WS 소켓 레지스트리 + broadcast — server.ts 가 watcher onChange 를 이걸로 전파.
 * send 실패(끊긴 소켓)는 조용히 레지스트리에서 제거. 메시지 = ChangeEvent JSON(INV-4 신호만).
 */
export function createLiveHub(): LiveHub {
  const clients = new Set<LiveSocket>();
  return {
    add: (s) => void clients.add(s),
    remove: (s) => void clients.delete(s),
    size: () => clients.size,
    broadcast(ev) {
      const data = JSON.stringify(ev);
      for (const s of clients) {
        try {
          s.send(data);
        } catch {
          clients.delete(s);
        }
      }
    },
  };
}
