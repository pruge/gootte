import { Hono } from "hono";
import { StorageResponse } from "@gootte/contract";
import { clearFeatureCache } from "@gootte/core-io";
import { clearDiscoverCache, clearPayloadCache } from "../discover-cache";
import { clearInProgressMemory, clearSnapshotMemory } from "../snapshot";
import { storageTotalBytes } from "../storage";

/** 저장소 사용량 라우트(settings-storage-meter) — 설정 화면의 한 줄과 비우기 버튼이 쓴다. */
export function createStorageRoutes(): Hono {
  const router = new Hono();

  // GET /api/storage → StorageResponse (그때 잰 총량, INV-5 저장 없음)
  router.get("/api/storage", (c) => {
    return c.json(StorageResponse.parse({ totalBytes: storageTotalBytes() }));
  });

  // POST /api/storage/clear → { ok: true } — 비우는 것은 전부 파생물(INV-1)이라
  // 다음 read 가 다시 계산한다. localStorage 파일은 손대지 않는다 — 실행 중 렌더러가
  // 물고 있어 지우면 미정의 동작이다. 본체는 프론트가 `localStorage.clear()` 한다.
  router.post("/api/storage/clear", (c) => {
    clearFeatureCache();
    clearSnapshotMemory();
    clearInProgressMemory();
    clearDiscoverCache();
    clearPayloadCache();
    return c.json({ ok: true });
  });

  return router;
}
