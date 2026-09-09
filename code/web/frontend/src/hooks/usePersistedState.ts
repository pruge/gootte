import { useState } from "react";

/**
 * localStorage 에 유지되는 상태 — 탭을 다시 열어도 마지막 선택이 남는다(캡틴 지시 2026-09-09:
 * 메모 필터를 한번 설정하면 유지). 값이 저장 규약(화이트리스트)에서 벗어나면 폐기하고 기본값으로
 * 돌아간다 — 저장된 것은 "사람이 정한 것"이지 신뢰할 데이터가 아니다.
 */
export function usePersistedState<T extends string>(key: string, valid: readonly T[], fallback: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof localStorage === "undefined") return fallback;
    const raw = localStorage.getItem(key);
    return valid.includes(raw as T) ? (raw as T) : fallback;
  });

  const set = (v: T): void => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      // 저장 실패(비공개 모드 등)는 조용히 — 이 탭 안에서는 상태가 유지된다.
    }
  };

  return [value, set];
}
