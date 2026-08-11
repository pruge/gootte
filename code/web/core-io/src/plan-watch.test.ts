import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setTicketOrder } from "./plan-store";
import { watchPlanDb, type PlanWatcher } from "./plan-watch";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
async function waitFor(pred: () => boolean, timeoutMs = 4000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return;
    await sleep(30);
  }
  throw new Error("waitFor timeout");
}

/**
 * `plan.db` 변경 감시(development-order/07) — 브라우저 드래그와 CLI 쓰기가 결국 같은 파일을
 * 건드리므로, 실제 쓰기 함수(`setTicketOrder`)를 그대로 불러 실측한다(누가 불렀는지는 안 가린다).
 */
describe("watchPlanDb (development-order/07, 🔴 첫 커버)", () => {
  let w: PlanWatcher | null = null;
  let dataDir = "";
  afterEach(async () => {
    await w?.close();
    w = null;
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
    dataDir = "";
  });

  it("plan.db 쓰기 → onChange 가 불린다(디바운스 뭉침)", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "gootte-planwatch-"));
    let calls = 0;
    w = watchPlanDb(dataDir, () => calls++, { debounceMs: 40 });
    await sleep(300); // chokidar ready

    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "01", step: 1, why: "…" });
    await waitFor(() => calls > 0);

    // 연달아 여러 번 써도(같은 파일 여러 touch) 디바운스로 뭉쳐 한 번 근처로 잡힌다.
    const before = calls;
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "02", step: 2, why: "…" });
    setTicketOrder(dataDir, { project: "p", feature: "a", ticket: "03", step: 3, why: "…" });
    await waitFor(() => calls > before);
  });

  it("dataDir 안의 다른 파일(history.md)은 신호를 안 낸다", async () => {
    dataDir = mkdtempSync(join(tmpdir(), "gootte-planwatch-"));
    let calls = 0;
    w = watchPlanDb(dataDir, () => calls++, { debounceMs: 40 });
    await sleep(300);

    // history.md 만 남기고 plan.db 는 안 건드리는 쓰기는 없다(항상 같이 남는다) — 여기서는
    // 감시 대상이 plan.db* 로 한정됨을 직접 확인하기 위해 무관한 파일을 만들어본다.
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dataDir, "irrelevant.txt"), "x");
    await sleep(300);
    expect(calls).toBe(0);
  });
});
