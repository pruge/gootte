/**
 * Tauri 셸 감지(tauri-desktop-app T02) — 웹 실행 경로와 데스크톱 실행 경로를 가르는 유일한 지점.
 * T01 셸은 http 오리진 하나로 UI 를 먹이므로 코드 차이는 이 감지 한 곳으로 모은다.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 네이티브 폴더 다이얼로그 — Tauri 위에서만 부른다(호출 전 `isTauri()` 확인 몫).
 * plugin-dialog 를 정적 import 하지 않는 이유: 웹 실행 경로(vitest·브라우저)가 이 모듈을
 * 로드조차 않게 — 취소하면 null.
 */
export async function pickFolder(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const picked = await open({ directory: true, multiple: false });
  return typeof picked === "string" ? picked : null;
}
