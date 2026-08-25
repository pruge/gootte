import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createApp, mountFallback, defaultRoots, planDataDir } from "./app";
import { createLiveHub } from "./live";
import { clearDiscoverCache } from "./discover-cache";
import { startWatchers, type Watchers } from "./watchers";
import { readSettings } from "@gootte/core-io";

/** 로컬 dev/prod 엔트리. PORT env 가 포트를 정한다(기본값은 prod `start` 몫). */
// dev 포트의 SoT 는 code/web/.ports.* 이고 scripts/dev-backend.sh 가 그 값을 PORT 로 넣어준다 —
// 격리 사본은 firstmate 가 써 넣은 .ports.worktree 값으로 갈려 main 과 무충돌.
const port = Number(process.env.PORT ?? 8804);
const roots = defaultRoots();
const dataDir = planDataDir();

/**
 * 부팅 시점의 설정된 감시 루트(tauri-desktop-app T02) — 요청 경로(app 의 effectiveRoots)와 같은
 * 규칙: 설정값이 기본값을 이긴다. 감시기도 이 값을 따라가야 live 갱신이 사용자가 정한 폴더를
 * 덮는다(INV-3). 설정 파일을 못 읽으면 기본값으로 서비스를 계속한다 — 앱 기동을 죽이지 않는다.
 */
const savedSettings = (() => {
  try {
    return readSettings(dataDir);
  } catch {
    return null;
  }
})();
const savedWatchRoot = savedSettings?.watchRoot ?? null;
/** 부팅 시점의 firstmate 홈(tauri-desktop-app T03) — 백로그 감시기의 시작 뿌리. 미설정이면 감시 없음. */
const savedFirstmateHome = savedSettings?.firstmateHome ?? null;
const watcherRoots = (watchRoot: string | null): string[] => (watchRoot ? [watchRoot] : roots);

const hub = createLiveHub();
/**
 * 지금 폴백 폴링 모드인가(tauri-desktop-app T03) — 접속이 늦은 클라이언트도 알아야 한다.
 * 방송은 이미 연결된 소켓만 닿으니, 열림 순간 마지막 상태를 한 줄 greeting 으로 넘긴다(INV-3).
 */
let watchFallbackActive = false;
const app = createApp({
  roots,
  dataDir,
  // PUT /api/settings 가 감시 루트·firstmate 홈을 바꾸면 해당 감시기를 새 값으로 다시 묶는다 —
  // 일반화된 재구성 프레임워크가 아니라 있던 startWatchers 위의 배선이다(T02 문서 · T03 백로그).
  onWatchRootChange: (watchRoot) => void watchers.rebind(watcherRoots(watchRoot)),
  onFirstmateHomeChange: (firstmateHome) => void watchers.rebindBacklog(firstmateHome),
});

// WS `/api/live` — 실시간 push 채널(2b, ADR-0002). 🔴 캐치올(mountFallback) *전*에 등록해야 `*` 에 안 먹힘.
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
app.get(
  "/api/live",
  upgradeWebSocket(() => ({
    onOpen: (_e, ws) => {
      hub.add(ws);
      // 늦게 붙은 클라이언트에게도 폴백 상태는 참해야 한다 — 방송 시점에 없었으면 못 받는다.
      if (watchFallbackActive) ws.send(JSON.stringify({ kind: "watch-fallback", active: true }));
    },
    onClose: (_e, ws) => hub.remove(ws),
  })),
);
mountFallback(app);

// 문서·계획·백로그 감시기 → coarse invalidate broadcast (INV-3 웹 실현, plan-board/09 · tauri-desktop-app T03).
// 셋을 한 함수(startWatchers)로 함께 세운다 — 하나만 세우고 잊는 일이 없게. 어느 하나라도
// 감시 불가면 watch-fallback 신호가 나가고 프론트가 주기 풀스캔으로 갈아탄다.
// 시작 뿌리는 저장된 설정값이 이긴다(위 watcherRoots·savedFirstmateHome) — 부팅부터 설정값을 본다.
let watchers: Watchers;
{
  const w = startWatchers({
    roots: watcherRoots(savedWatchRoot),
    dataDir,
    firstmateHome: savedFirstmateHome,
    onChange: (c) => {
      if (c.kind === "watch-fallback") watchFallbackActive = c.active;
      hub.broadcast(c);
    },
    onProjectsChange: clearDiscoverCache,
  });
  watchers = w;
}

const server = serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`gootte backend → http://localhost:${info.port}\n`);
  process.stdout.write(`  discover roots: ${roots.join(", ")}\n`);
  process.stdout.write(`  live: WS /api/live · watcher on(문서·계획·백로그)\n`);
});
injectWebSocket(server);

const shutdown = (): void => {
  void watchers.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
