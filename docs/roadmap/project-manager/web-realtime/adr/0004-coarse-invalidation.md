# ADR-0004: 프로젝트 단위 coarse invalidation + 목록 변화

Status: accepted
Date: 2026-07-27 / 관련: spec.md §Data Model, §Test Strategy

## Context
파일이 바뀌면 클라가 무엇을 재조회할지 정해야 한다. fine-grained(파일→영향 뷰 매핑: todo→plan/board·sprint→worktree/timeline)는 정밀하나 복잡하다.

## Decision
**프로젝트 단위(coarse)**. 프로젝트 X의 어떤 문서/worktree가 바뀌든 `{kind:"project", project:X}` 1건 push → 클라는 **X의 모든 쿼리**(plan·roadmap·lineage·board·timeline·worktree·doc)를 predicate로 invalidate. 프로젝트 추가/삭제 = `{kind:"projects"}` → projects 쿼리 invalidate + 서버 `clearDiscoverCache()`.
- 근거: 대시보드는 한 번에 한 프로젝트, per-request 재계산이 싸서 그 프로젝트 뷰 전체 재조회가 비용 무시가능. TanStack은 비활성 쿼리 invalidate가 값싸(관측 시 재조회).

## Alternatives
- fine-grained(뷰별): 복잡도↑, 이득 미미(재계산이 이미 쌈) → over-engineering.

## Consequences
- 서버 broadcast·클라 invalidate 로직 단순(파일→뷰 매핑 테이블 불요).
- 한 문서 변경에 그 프로젝트 뷰 몇 개 재조회 = 로컬·소규모라 무해.
- 클라 invalidate = `predicate: q => q.queryKey.includes(project)`.

## Invariant impact
- **INV-1**: invalidate는 기존 projection 재조회만 — 2차 SoT·별 스토어 없음. 준수.
- **INV-3**: 변경 즉시 전체 관련 뷰가 최신 SoT로 → stale 뷰 제거(목적).

## Contract impact
`ChangeEvent` discriminatedUnion(`project`|`projects`) — spec §Data Model에 정의.
