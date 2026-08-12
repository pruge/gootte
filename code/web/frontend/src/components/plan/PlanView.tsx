/**
 * `plan` 탭 — 옛 트랙·순위·왜·어긋남·드래그 경고 배선은 plan-board/01 이 걷어냈다
 * (docs/features/plan-board/spec.md, 캡틴 지시: "기존 배선 싹 겉어내고 새로 작업해").
 * 02 가 다섯 자리 모델로 다시 세운다.
 */
export function PlanView() {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <p className="mono text-sm text-muted">새 판을 짓는 중</p>
    </div>
  );
}
