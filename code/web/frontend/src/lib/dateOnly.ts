/**
 * 완료 시각 표시용 날짜만 — `closedDisplayAt`(core)이 주는 값은 `YYYY-MM-DD` 또는
 * `YYYY-MM-DD HH:MM` 또는 ISO(`YYYY-MM-DDTHH:MM:SS+09:00`)일 수 있다. 표시는 **날짜만**
 * `yyyy-mm-dd` 로 통일한다(캡틴 지시). 앞 10자리가 날짜가 아니면 그대로 돌려준다(지어내지 않는다, INV-4).
 */
export function dateOnly(display: string): string {
  const m = /^\d{4}-\d{2}-\d{2}/.exec(display);
  return m ? m[0] : display;
}
