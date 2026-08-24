# Grill 기록 — tauri-desktop-app

## Design tree (확정 2026-08-24, Round 1)

- D1 Tauri 적용 범위 → (a) 확정: 기존 React+Vite/Hono 자산 재사용, Tauri는 셸·창·네이티브 다이얼로그 계층. Rust 재작성 기각.
- D2 설정 저장 위치 → (a) 확정: gootte 자체 저장소(INV-5 "사람만 아는 것" 허용). firstmate 경로도 여기 저장.
- D3 감시 방식 → (a) 확정: FS 이벤트 즉시 반영 + 주기 풀스캔 백업. 결정적 파서(INV-4) 재사용.
- D4 신관례 지원 → 확정: tickets/TNN.md 트리 노드 + grill.md/design/wayfinder 표시(INV-4: 실재하는 것만), 상태는 tasks-axi 백로그 조인(`<parent>-t<NN>` id 규약), firstmate 홈 경로는 설정에서.
- D5 플랫폼 → macOS 우선 단일 타깃. Windows/Linux/서명은 범위 밖.

## Frontier 상태

비었음 - Round 1 전 항목 사관장 추천 승인으로 닫힘("추천 승인"). 남은 기술 세부(크레이트 선택 등)는 구현 사실이므로 질문 대상 아님.
