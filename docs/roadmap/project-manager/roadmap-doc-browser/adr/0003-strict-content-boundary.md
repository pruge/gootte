# ADR-0003: 엄격 콘텐츠 경계 (이니셔티브 폴더 + 가상 todo/; mermaid 인라인; worktree non-goal)

Status: accepted
Date: 2026-07-27 / 관련: spec.md §Scope, §Data Model

## Context
브라우저에 무엇을 노출하나. 이니셔티브 폴더에 `brief/spec/wireframe/ledger/adr/` 가 있고,
mermaid(`M-NNNN`)는 **다른 폴더**(`docs/mermaid/`)에서 문서가 앵커로 참조한다. worktree 에는
활성 작업의 미커밋 문서가 있다.

## Decision
브라우저 트리 = **이 이니셔티브 폴더의 실제 파일 + `adr/` 서브폴더 + 가상 `todo/` 폴더**만.
- **mermaid** — 트리에 노출하지 않는다. 문서(spec 등)를 **열면** 기존 `MermaidBlock` 이 인라인 렌더하므로 이미 보인다.
- **worktree 라이브 트리** — non-goal. 트리 소스는 main 트리(커밋본). (기존 DocDrawer 의 sprint worktree read 는 유지 — 무관.)
- **archive todo** — 가상 `todo/` 안에 done/archived 포함(소속 이니셔티브의 완료 이력도 보이게).

## Alternatives
- **+ 참조 mermaid 를 가상 `mermaid/` 폴더로** — 다이어그램 직접 탐색 가능하나 경계가 두 폴더로 늘고
  참조 해소 로직 필요. → future.
- **+ worktree 라이브 트리** — 라이브성 좋으나 트리 소스 2개(main/worktree)로 복잡. → future.

## Consequences
- traversal 경계가 단순·명확(한 이니셔티브 폴더 + 합성 todo/) → INV-2/traversal 가드 구현 쉬움(ADR-0004).
- mermaid 폴더 탐색·worktree 트리는 spec §future 에 기록(YAGNI).

## Invariant impact
- **INV-2**(read-only) — 경계 안 파일 read 만. 유지.
- **INV-4**(결정적) — 노출 집합이 고정·결정적(폴더 열거 + effInitiative). 유지.

## Contract impact
없음(범위 결정). tree 노드 형상 = ADR-0004.
