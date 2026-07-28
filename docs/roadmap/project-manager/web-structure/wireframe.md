# wireframe — web-structure (레이아웃 A: track 인덱스 → 포커스)

> plan 탭 · 뷰모드 = 리스트 / **구조** / 타임라인. 본문 = 좌 track 인덱스 + 우 포커스 그림.
> 스택 = Tailwind · Tabler icon · Pretendard (하드룰).

## 기본 (그림 선택 전 = 첫 그림 자동 포커스)
```
┌ project-manager ───────────────────────  [리스트][구조•][타임라인] [탭] ┐
├──────────────────────┬──────────────────────────────────────────────────┤
│  구조 다이어그램        │   M-0001 · 전체 아키텍처              🟢 living   │
│                       │  ┌────────────────────────────────────────────┐ │
│  ─ 시스템/공통 ─        │  │                                            │ │
│  ▸ M-0001 아키텍처 🟢  │  │        [ mermaid 렌더 — MermaidBlock ]       │ │
│    M-0009 토폴로지 🟢  │  │                                            │ │
│                       │  │   contract ← core ← core-io ← 어댑터        │ │
│  ─ W · 웹 대시보드 ─   │  │                                            │ │
│    M-0002 데이터흐름 🟢 │  └────────────────────────────────────────────┘ │
│    M-0003 viz     ⚫   │   sources: blueprint.md · lineage-engine/spec.md │
│    M-0007 구조뷰   🟢  │                                                  │
│                       │                                                  │
│  ─ R · 원격/모바일 ─   │                                                  │
│    (없음)             │                                                  │
└──────────────────────┴──────────────────────────────────────────────────┘
```

## 요소
- **좌 인덱스** = `groupByTrack`(그림) — 그룹 헤더 = track label(시스템/공통 first → E·W·R·X → 미분류 last). 항목 = `제목 · 상태칩`. `▸` = 현재 포커스. 클릭 = 포커스 전환.
- **우 포커스** = 헤더(id·title·상태) + `MermaidBlock code=diagram.code` + `sources:` 줄(future 드릴 링크).
- **상태칩**: 🟢 living / ⚫ superseded(항목·포커스 모두 dimmed opacity-60, 숨김 X).
- **선택 상태** = 로컬 state(그림 id). URL 상태화는 future(현 `?view=structure` 까지만).

## empty (그림 0)
```
│   IconChartDots3(Tabler) 회색                    │
│   이 프로젝트엔 저작된 구조 다이어그램이 없습니다.  │
│   docs/mermaid/ 에 M-NNNN 을 저작하면 여기 나타납니다. │
```

## 반응형
- 좁은 폭: 인덱스가 상단 가로 스크롤 칩 열 → 아래 포커스(기존 패널 패턴 준용). 본문 가로 스크롤 금지, 그림만 `overflow-x:auto`(MermaidBlock 내장).
