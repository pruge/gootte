import { mkdirSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { backlogFile, watchBacklog, type BacklogWatcher } from "./backlog-watch";

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
 * firstmate 홈 백로그 감시(tauri-desktop-app T03) — 상태의 단일 출처가 바뀌는 순간을 놓치면
 * 화면이 옛 상태를 그린다(INV-3). 임시 디렉토리에 firstmate 홈 모양(`data/backlog.md`)을
 * 합성해 실측한다 — 이 저장소 자신의 문서를 픽스처로 쓰지 않는다.
 */
describe("watchBacklog (tauri-desktop-app T03)", () => {
  let w: BacklogWatcher | null = null;
  let home = "";
  afterEach(async () => {
    await w?.close();
    w = null;
    if (home) rmSync(home, { recursive: true, force: true });
    home = "";
  });

  /** firstmate 홈 모양 합성 — `<home>/data/` 까지 만들고 백로그는 필요할 때 쓴다. */
  const makeHome = (withBacklog: boolean): string => {
    home = mkdtempSync(join(tmpdir(), "gootte-backlogwatch-"));
    mkdirSync(join(home, "data"), { recursive: true });
    if (withBacklog) writeFileSync(backlogFile(home), "# Backlog\n");
    return home;
  };

  it("backlog.md 생성·변경 → onChange 가 불린다(디바운스 뭉침)", async () => {
    makeHome(false);
    let calls = 0;
    w = watchBacklog(home, () => calls++, { debounceMs: 40 });
    await sleep(300); // chokidar ready

    writeFileSync(backlogFile(home), "# Backlog\n- [ ] a\n");
    await waitFor(() => calls > 0);

    const before = calls;
    appendFileSync(backlogFile(home), "- [ ] b\n");
    appendFileSync(backlogFile(home), "- [ ] c\n");
    await waitFor(() => calls > before);
  });

  it("data/ 안의 다른 파일은 신호를 안 낸다", async () => {
    // 백로그 없이 시작한다 — 감시 시작 직전의 백ログ 생성 이벤트가 FSEvents 를 타고 늦게
    // 도착해 필터 판정을 오염시키지 않게(plan-watch 의 무관 파일 테스트와 같은 배려).
    makeHome(false);
    let calls = 0;
    w = watchBacklog(home, () => calls++, { debounceMs: 40 });
    await sleep(300);

    writeFileSync(join(home, "data", "learnings.md"), "x");
    await sleep(300);
    expect(calls).toBe(0);
  });

  it("홈 미설정(null·빈 문자열)이면 감시기 없이 멱등 close", async () => {
    let calls = 0;
    w = watchBacklog(null, () => calls++);
    await w.close(); // 아무 일도 없어야 하고, 두 번 불려도 안 터진다
    await w.close();
    expect(calls).toBe(0);
  });

  it("data/ 가 없으면 onError 로 통보한다 — 조용한 감시기가 아니게", async () => {
    home = mkdtempSync(join(tmpdir(), "gootte-backlogwatch-")); // data/ 를 안 만든다
    const onError = vi.fn();
    w = watchBacklog(home, () => {}, { onError });
    expect(onError).toHaveBeenCalledTimes(1);
    await w.close();
  });
});
