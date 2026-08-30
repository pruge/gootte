/**
 * 설정 화면 — 본문 영역에 그려지는 전역 설정 뷰(settings-in-main-area).
 *
 * T01(셸 배치)에서는 빈 골격이다 — 내용(VSCode 레이아웃: 검색 + 좌측 카테고리 + 우측 폼)은
 * T02 가 채운다. 🔴 전역 하나다 — 프로젝트 선택과 무관하게 gear 로 열리는 같은 화면(INV-5:
 * 값 저장 정책은 그대로 settings.json, 관리대상 문서 무접촉).
 */
export function SettingsView() {
  return (
    <div className="flex-1 overflow-hidden">
      <div className="px-6 py-5">
        <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
      </div>
    </div>
  );
}