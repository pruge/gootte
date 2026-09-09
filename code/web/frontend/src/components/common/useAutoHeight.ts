import { useEffect, useRef } from "react";

/**
 * textarea 자동 높이 — 내용에 맞춰 늘어나 **수직 스크롤이 절대 생기지 않는다**(캡틴 지시
 * 2026-09-09: 메모 입력폼과 등록된 메모 모두). `value` 가 바뀔 때마다 높이를 내용으로 재계산한다.
 * `overflow-hidden` 은 계산 한 박자의 누름 방지용이고, 실제 스크롤은 없다.
 */
export function useAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return ref;
}
