import { parentPort, workerData } from "node:worker_threads";
import { scanWorkingCopies } from "@gootte/core-io";
import { recordInProgress } from "./snapshot";

// 🔴 처리중 관측 갱신을 메인 이벤트 루프 밖에서 돈다 — `scanWorkingCopies` 는 사본마다
// sync git 하위프로세스라 ~2s 를 잡아, 메인에서 돌리면 첫 화면 이후의 모든 요청을 2s 씩
// 막는다(fast-cold-start, plan-board/13). 워커가 디스크에만 기록하고 메인은 다음 읽기에서
// 갱신된 스냅샷을 받는다. 실패는 조용히 — 옛 값을 그대로 유지(INV-U1).
const { treehouse, project, dataDir } = workerData as {
  treehouse: string;
  project: string;
  dataDir: string;
};

try {
  const scan = scanWorkingCopies(treehouse, project);
  recordInProgress(dataDir, project, scan);
} catch {
  // 관측 실패는 무시 — 기존 스냅샷 유지
} finally {
  parentPort?.postMessage("done");
}
