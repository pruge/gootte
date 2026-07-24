import { serve } from "@hono/node-server";
import { createApp, defaultRoots } from "./app";

/** 로컬 dev/prod 엔트리. PORT env(기본 8787) — main 밴드 배정은 /cling:ops(구현 후). */
const port = Number(process.env.PORT ?? 8787);
const roots = defaultRoots();
const app = createApp({ roots });

serve({ fetch: app.fetch, port }, (info) => {
  process.stdout.write(`gootte backend → http://localhost:${info.port}\n`);
  process.stdout.write(`  discover roots: ${roots.join(", ")}\n`);
});
