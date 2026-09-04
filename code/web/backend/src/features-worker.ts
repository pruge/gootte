/**
 * 기능 파생물 계산 워커(read-path-redesign/T07).
 *
 * 🔴 이 파일은 **계산만** 한다 — 관리대상에 아무것도 쓰지 않는다(INV-2). 하는 일은
 * `readFeatures(copies)` 한 줄이고, 그것이 요청 스레드 **밖**에서 도는 것이 이 파일의 존재 이유다.
 *
 * 폴더 단위 캐시(T04)는 이 워커 안에 산다 — 워커가 살아 있는 동안 계속 데워진 채 남는다.
 */
import { parentPort } from "node:worker_threads";
import { readFeatures, scanWorkingCopies } from "@gootte/core-io";

if (!parentPort) throw new Error("features-worker: parentPort 가 없다(워커로 띄워지지 않았다)");

type Job =
  | { id: number; kind: "features"; copies: string[] }
  | { id: number; kind: "scan"; root: string; project: string; projectPaths: string[]; bbRoot?: string };

parentPort.on("message", (msg: Job) => {
  try {
    // 🔴 사본 관측(D 등급)도 여기서 돈다 — 사본마다 git 을 도는 일이라 메인 루프에 두면
    // `/api/features/:slug` 가 도는 동안 문서 요청이 그 뒤에 선다(실측 540ms, T08).
    const value =
      msg.kind === "scan"
        ? { scan: scanWorkingCopies(msg.root, msg.project, msg.projectPaths, msg.bbRoot) }
        : { features: readFeatures(msg.copies) };
    parentPort!.postMessage({ id: msg.id, ok: true, ...value });
  } catch (err) {
    // 🔴 삼키지 않는다 — 부모가 "계산이 막혔다" 를 알아야 마지막 값을 계속 내줄지 정할 수 있다.
    parentPort!.postMessage({ id: msg.id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});
