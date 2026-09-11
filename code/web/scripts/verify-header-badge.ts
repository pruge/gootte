/**
 * 실물 확인 스크립트(the-header-agrees-with-its-tickets 검증) — 화면이 보는 것과 **같은 판정
 * 자리**를 지난다: readFeatures → finalizeFeatureStatus. 머리글 한 줄(네 수 + 배지)을 출력한다.
 * 읽기 전용 — 아무것도 쓰지 않는다(INV-2).
 *
 *   npx tsx scripts/verify-header-badge.ts <관리대상 프로젝트 뿌리>
 */
import { readFeatures } from "../core-io/src/index";
import { allTickets, finalizeFeatureStatus } from "../core/src/index";

const root = process.argv[2];
if (!root) {
  console.error("usage: tsx scripts/verify-header-badge.ts <project-root>");
  process.exit(1);
}

const now = new Date().toISOString();
const features = finalizeFeatureStatus(readFeatures([root]), now);

for (const f of features) {
  const tickets = allTickets(f);
  const done = tickets.filter((t) => t.status === "done").length;
  const dropped = tickets.filter((t) => t.status === "dropped").length;
  const working = tickets.filter((t) => t.status === "in_progress").length;
  const open = tickets.length - done - dropped;
  const startable = tickets.filter((t) => t.status === "pending" && t.startable).length;
  const badge = f.sourceStatus ? `[${f.sourceStatus}]` : "[배지 없음]";
  console.log(
    `${f.slug.padEnd(40)} ${badge}  남은 일 ${open} · 완료 ${done} · 착수 가능 ${startable} · 처리중 ${working}` +
      (tickets.length > 0 ? "" : "  (티켓 0)"),
  );
}
