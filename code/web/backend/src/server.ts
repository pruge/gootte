import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import type { ChangeEvent } from "@gootte/contract";
import { watchProjects } from "@gootte/core-io";
import { createApp, mountFallback, defaultRoots } from "./app";
import { createLiveHub } from "./live";
import { clearDiscoverCache } from "./discover-cache";

/** 로컬 dev/prod 엔트리. PORT env(기본 8804 = cling 글로벌 레지스트리 main 밴드 배정). */
// worktree 는 /cling:worktree 가 매니페스트로 worktree 밴드 포트를 격리 주입 → main 과 무충돌.
const port = Number(process.env.PORT ?? 8804);
const roots = defaultRoots();
const app = createApp({ roots });
const hub = createLiveHub();

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

const server = serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`gootte backend → http://localhost:${info.port}\n`);
  process.stdout.write(`  discover roots: ${roots.join(", ")}\n`);
  process.stdout.write(`  live: WS /api/live · watcher on\n`);
});
injectWebSocket(server);

const shutdown = (): void => {
  void watcher.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
