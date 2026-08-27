/**
 * 걸린 시간 어림 문구 — a-ticket-tells-how-long-it-took/T01. 순수·결정적(INV-4), 인자로 받은
 * 시각만 본다(시계를 직접 안 만진다 — 시험이 시계에 흔들리지 않는다). 어림 규칙 표는 이 함수
 * **한 자리**뿐이다(spec §어림 규칙) — plan·steps 두 탭이 같은 문구를 보려면 계산 자리가 하나여야 한다.
 *
 * 🔴 분을 저장하지 않는다(INV-1) — 이 함수는 저장된 시각에서 매번 다시 잰다.
 * 🔴 없는 시각을 지어내지 않는다(INV-4) — `started` 가 없거나 못 읽으면 null. `finished` 가 없으면
 * 진행 중으로 본다(줄 자체가 없는 것과 다르다).
 * 🔴 완료가 착수보다 이르면(시계가 되돌아간 등) null — 음수 시간을 화면에 내지 않는다.
 */
export function elapsedPhrase(
  startedAt: string | null | undefined,
  finishedAt: string | null | undefined,
  now: string,
): string | null {
  if (!startedAt) return null; // 착수 자체를 모르면 아무것도 모른다
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null; // 파싱 실패는 모름으로 접는다 — 예외로 죽지 않는다

  const inProgress = !finishedAt;
  const endRaw = inProgress ? now : finishedAt;
  const ended = Date.parse(endRaw);
  if (Number.isNaN(ended)) return null;

  const diffMs = ended - started;
  if (diffMs < 0) return null; // 역전된 시각 — 모름으로 접는다

  const base = roughPhrase(diffMs);
  return inProgress ? `${base} 진행 중` : base;
}

/** 밀리초 → `약 <N>분`/`약 <H>시간 <M>분` 꼴. 0분이라고 말하지 않는다(1분 미만은 `약 1분`). */
function roughPhrase(diffMs: number): string {
  const seconds = diffMs / 1000;
  let totalMinutes = Math.round(seconds / 60);
  if (totalMinutes === 0 && seconds > 0) totalMinutes = 1;

  if (totalMinutes < 60) return `약 ${totalMinutes}분`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `약 ${hours}시간` : `약 ${hours}시간 ${minutes}분`;
}
