import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { createApp, mountFallback, defaultRoots, planDataDir } from "./app";
import { createLiveHub } from "./live";
import { clearDiscoverCache } from "./discover-cache";
import { startWatchers } from "./watchers";

/** 로컬 dev/prod 엔트리. PORT env 가 포트를 정한다(기본값은 prod `start` 몫). */
// dev 포트의 SoT 는 code/web/.ports.* 이고 scripts/dev-backend.sh 가 그 값을 PORT 로 넣어준다 —
// 격리 사본은 firstmate 가 써 넣은 .ports.worktree 값으로 갈려 main 과 무충돌.
const port = Number(process.env.PORT ?? 8804);
const roots = defaultRoots();
const dataDir = planDataDir();
const hub = createLiveHub();
const app = createApp({ roots });

// WS `/api/live` — 실시간 push 채널(2b, ADR-0002). 🔴 캐치올(mountFallback) *전*에 등록해야 `*` 에 안 먹힘.
const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
app.get(
  "/api/live",
  upgradeWebSocket(() => ({
    onOpen: (_e, ws) => hub.add(ws),
    onClose: (_e, ws) => hub.remove(ws),
  })),
);
mountFallback(app);

// 문서·계획 감시기 → coarse invalidate broadcast (INV-3 웹 실현, plan-board/09).
// 둘을 한 함수(startWatchers)로 함께 세운다 — 하나만 세우고 잊는 일이 없게.
const watchers = startWatchers({
  roots,
  dataDir,
  onChange: (c) => hub.broadcast(c),
  onProjectsChange: clearDiscoverCache,
});

const server = serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`gootte backend → http://localhost:${info.port}\n`);
  process.stdout.write(`  discover roots: ${roots.join(", ")}\n`);
  process.stdout.write(`  live: WS /api/live · watcher on(문서·계획)\n`);
});
injectWebSocket(server);

const shutdown = (): void => {
  void watchers.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
