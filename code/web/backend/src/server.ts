import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createApp, mountFallback, defaultRoots, planDataDir } from "./app";
import { createLiveHub } from "./live";
import { clearDiscoverCache } from "./discover-cache";
import { createProjectUpdateScheduler } from "./snapshot";
import { createSnapshotRevalidator } from "./snapshot-revalidator";
import { startWatchers, type Watchers } from "./watchers";
import type { ChangeEvent } from "@gootte/contract";
import { readSettings, resolveWatchRoots } from "@gootte/core-io";

/** 로컬 dev/prod 엔트리. PORT env 가 포트를 정한다(기본값은 prod `start` 몫). */
// dev 포트의 SoT 는 code/web/.ports.* 이고 scripts/dev-backend.sh 가 그 값을 PORT 로 넣어준다 —
// 격리 사본은 firstmate 가 써 넣은 .ports.worktree 값으로 갈려 main 과 무충돌.
const port = Number(process.env.PORT ?? 8804);
const roots = defaultRoots();
const dataDir = planDataDir();

/**
 * 부팅 시점의 설정된 firstmate 홈(tauri-desktop-app T02·T03, one-setting-finds-every-copy T05 로
 * 한 칸화) — 요청 경로(app 의 effectiveRoots)와 같은 규칙: 홈에서 파생된 뿌리가 기본값을 이긴다.
 * 감시기도 이 값을 따라가야 live 갱신이 사용자가 정한 홈을 덮는다(INV-3). 설정 파일을 못 읽으면
 * 기본값으로 서비스를 계속한다 — 앱 기동을 죽이지 않는다.
 */
const savedSettings = (() => {
  try {
    return readSettings(dataDir);
  } catch {
    return null;
  }
})();
/** 부팅 시점의 firstmate 홈 — 문서 감시기·백로그 감시기 둘 다의 시작 뿌리. 미설정이면 감시 없음. */
const savedFirstmateHome = savedSettings?.firstmateHome ?? null;
/**
 * 지금 감시해야 할 뿌리 — 명시 `watchRoots` 가 있으면 그것이 권위, 없으면 firstmate 홈에서 파생,
 * 그래도 없으면 env·플랫폼 기본값(`roots`). `resolveWatchRoots` 가 그 판별 하나를 갖는다
 * (per-folder-watch-roots). 감시기는 이 함수가 내놓는 뿌리로 문서를 본다.
 */
const currentWatchRoots = (): string[] => resolveWatchRoots(dataDir, roots);

const hub = createLiveHub();
// T05: 프로젝트 단위 증분 갱신 — 변경 신호를 debounce 로 뭉쳐 재계산하고, **계산이 끝난 뒤** 같은
// `project` 이벤트를 다시 밀어 실시간 갱신 공백(변경 직후 즉시 방송된 refetch 가 낡은 스냅샷을 본 틈)을
// 메운다. 완료/시작 여부 판정은 이 신호가 아니라 문서의 `Time:` 줄이 정한다(T04/ADR-0001).
const scheduleProjectUpdate = createProjectUpdateScheduler({
  dataDir,
  roots: () => currentWatchRoots(),
  broadcast: hub.broadcast,
}).schedule;
const snapshotRevalidator = createSnapshotRevalidator({
  dataDir,
  roots: () => currentWatchRoots(),
  onChange: (event) => {
    if (event.kind === "projects") clearDiscoverCache();
    hub.broadcast(event);
  },
});

/**
 * 지금 폴백 폴링 모드인가(tauri-desktop-app T03) — 접속이 늦은 클라이언트도 알아야 한다.
 * 방송은 이미 연결된 소켓만 닿으니, 열림 순간 마지막 상태를 한 줄 greeting 으로 넘긴다(INV-3).
 */
let watchFallbackActive = false;
const app = createApp({
  roots,
  dataDir,
  // PUT /api/settings 가 firstmate 홈을 바꾸면 문서 감시기와 백로그 감시기를 **둘 다** 새
  // 홈에서 파생된 값으로 다시 묶는다 — 일반화된 재구성 프레임워크가 아니라 있던 startWatchers
  // 위의 배선이다(T02 문서 · T03 백로그 · T05 로 한 통보에서 둘 다 재묶임).
  onFirstmateHomeChange: (firstmateHome) => {
    void watchers.rebind(currentWatchRoots());
    void watchers.rebindBacklog(firstmateHome);
  },
  // per-folder-watch-roots — 명시 감시 뿌리가 바뀌면 문서 감시기를 새 목록으로 다시 묶는다.
  onWatchRootsChange: (nextRoots) => {
    void watchers.rebind(nextRoots);
  },
  // T07: 처리중 관측 갱신이 끝나면 같은 `project` 이벤트로 프론트에 swap 을 알린다.
  broadcast: hub.broadcast,
});

// WS `/api/live` — 실시간 push 채널(2b, ADR-0002). 🔴 캐치올(mountFallback) *전*에 등록해야 `*` 에 안 먹힘.
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
app.get(
  "/api/live",
  upgradeWebSocket(() => ({
    onOpen: (_e, ws) => {
      hub.add(ws);
      // 늦게 붙었거나 **다시** 붙은 클라이언트에게도 폴백 상태는 참해야 한다(INV-3) — 전환 방송은
      // 그 순간 연결된 소켓만 닿으니, 열림마다 현재 상태를 greeting 으로 넘긴다(회복 포함).
      ws.send(JSON.stringify({ kind: "watch-fallback", active: watchFallbackActive }));
    },
    onClose: (_e, ws) => hub.remove(ws),
  })),
);
mountFallback(app);

// 문서·계획·백로그 감시기 → coarse invalidate broadcast (INV-3 웹 실현, plan-board/09 · tauri-desktop-app T03).
// 셋을 한 함수(startWatchers)로 함께 세운다 — 하나만 세우고 잊는 일이 없게. 어느 하나라도
// 감시 불가면 watch-fallback 신호가 나가고 프론트가 주기 풀스캔으로 갈아탄다.
// 시작 뿌리는 저장된 설정(`resolveWatchRoots`)이 이긴다 — 명시 `watchRoots` 가 있으면 그것이,
// 부팅부터 설정값을 본다.
let watchers: Watchers;
{
  const w = startWatchers({
    roots: currentWatchRoots(),
    dataDir,
    firstmateHome: savedFirstmateHome,
    onChange: (c: ChangeEvent) => {
      if (c.kind === "watch-fallback") {
        watchFallbackActive = c.active;
      }
      // 🔴 커밋(HEAD 변화)만으로도 미착지가 live 갱신되게 15초 재검증기(HEAD 스템프 폴링)를 항상 켠다.
      // 예전엔 파일 감시기가 살아있을 땐 폴백 폴링을 껐는데, 그러면 커밋은 작업트리 파일을 안 바꾸니
      // 감시 이벤트가 안 떨어져 미착지 표식이 stale 로 남았다(INV-3 위반). 재검증기는 `sameStamps`(HEAD)로
      // 싼값 비교 후 변화 있을 때만 비싼 재스캔을 하므로 항상 켜둬도 비용은 HEAD 읽기 수준이다(snapshot.ts).
      snapshotRevalidator.setFallbackPolling(true);
      // T05: 변경된 프로젝트만 갱신 — 전체 flush 대신 증분 반영
      if (c.kind === "project") {
        scheduleProjectUpdate(c.project);
      }
      hub.broadcast(c);
    },
    onProjectsChange: clearDiscoverCache,
  });
  watchers = w;
}
// 부팅부터 15초 HEAD 재검증기를 켠다 — 커밋만으로도 미착지가 live 갱신되게(snapshot-revalidator).
snapshotRevalidator.setFallbackPolling(true);

const server = serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`gootte backend → http://localhost:${info.port}\n`);
  process.stdout.write(`  discover roots: ${roots.join(", ")}\n`);
  process.stdout.write(`  live: WS /api/live · watcher on(문서·계획·백로그)\n`);
});
injectWebSocket(server);
// 첫 요청은 스냅샷으로 즉시 서빙한 뒤 다음 이벤트 루프에서 HEAD 재검증을 시작한다(T04).
setImmediate(snapshotRevalidator.run);

const shutdown = (): void => {
  snapshotRevalidator.stop();
  void watchers.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
