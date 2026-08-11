import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { ChangeEvent } from "@gootte/contract";
import { watchProjects, watchPlanDb } from "@gootte/core-io";
import { createApp, mountFallback, defaultRoots, planDataDir } from "./app";
import { createLiveHub } from "./live";
import { clearDiscoverCache } from "./discover-cache";

/** 로컬 dev/prod 엔트리. PORT env 가 포트를 정한다(기본값은 prod `start` 몫). */
// dev 포트의 SoT 는 code/web/.ports.* 이고 scripts/dev-backend.sh 가 그 값을 PORT 로 넣어준다 —
// 격리 사본은 firstmate 가 써 넣은 .ports.worktree 값으로 갈려 main 과 무충돌.
const port = Number(process.env.PORT ?? 8804);
const roots = defaultRoots();
const dataDir = planDataDir();
const hub = createLiveHub();
// 드래그(POST)가 성공하면 정확한 project 로 즉시 push(development-order/07) — plan.db 워처보다 먼저 온다.
const app = createApp({ roots, dataDir, onPlanChange: (project) => hub.broadcast({ kind: "project", project }) });

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

// 파일 watcher → coarse invalidate broadcast (INV-3 웹 실현). projects 변경 시 discover-cache bust.
const watcher = watchProjects(roots, (c: ChangeEvent) => {
  if (c.kind === "projects") clearDiscoverCache();
  hub.broadcast(c);
});

// `plan.db` watcher(development-order/07) — CLI(`gootte set`/`drop`)는 서버 프로세스 밖이라
// onPlanChange 콜백을 못 타므로, 파일 변경 자체를 지켜봐 잡는다. 누가 바꿨는지 몰라 coarse `plan`.
const planWatcher = watchPlanDb(dataDir, () => hub.broadcast({ kind: "plan" }));

const server = serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`gootte backend → http://localhost:${info.port}\n`);
  process.stdout.write(`  discover roots: ${roots.join(", ")}\n`);
  process.stdout.write(`  live: WS /api/live · watcher on(문서) · plan.db watcher on(계획)\n`);
});
injectWebSocket(server);

const shutdown = (): void => {
  void watcher.close();
  void planWatcher.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
