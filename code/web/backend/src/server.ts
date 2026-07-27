import { serve } from "@hono/node-server";
import { createApp, defaultRoots } from "./app";

/** 로컬 dev/prod 엔트리. PORT env(기본 8804 = cling 글로벌 레지스트리 main 밴드 배정). */
// worktree 는 /cling:worktree 가 매니페스트로 worktree 밴드 포트를 격리 주입 → main 과 무충돌.
const port = Number(process.env.PORT ?? 8804);
const roots = defaultRoots();
const app = createApp({ roots });

serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`gootte backend → http://localhost:${info.port}\n`);
  process.stdout.write(`  discover roots: ${roots.join(", ")}\n`);
});
