# memo-pad — 캡틴의 빠른 생각을 적는 메모 탭

Status: ready-for-agent

## 배경

이전 작업 세션에서 다른 모델(Codex)이 구현을 시작했다. 커밋되지 않은 상태로 멈춰 있었다.

## 문제

캡틴이 기능을 쓰기 전에 떠오르는 생각을 적을 곳이 없다. 관리대상 프로젝트의 `docs/features/` 는
INV-2(읽기 전용)라 거기에 쓸 수 없고, `GOOTTE_DATA_DIR` (계획·설정 등 사람이 정한 값이 모이는
곳)은 저장할 자격이 있는 칸(INV-5)이지만 거기에 적는 도구가 없다.

## Goal

gootte 화면의 새 탭 `memo` 에서 캡틴이 프로젝트별로 **메모**를 적고·고치고·지울 수 있다.
메모는 gootte 자기 저장소(`GOOTTE_DATA_DIR/memos/<project>.json`)에만 쓴다 — 관리대상은
한 글자도 건드리지 않는다(INV-2).

## 설계 결정

- **저장 위치**: `GOOTTE_DATA_DIR/memos/<project>.json`. 계획·설정과 같은 부모를 쓰는 이유는
  "사람이 정한 것" 이 모이는 곳이 하나뿐이어야 하기 때문이다(INV-5).
- **INV-5 경계**: 메모는 **이 기능을 쓰기 전 캡틴이 떠올리는 생각**으로, 어디 문서에도 적혀
  있지 않고 사람만 아는 값이라 저장할 자격이 있다.
- **INV-4 요약 금지**: `content` 는 사람이 적은 그대로(verbatim) 저장한다. 요약·추론은
  저장하지 않는다.
- **레이아웃**: 좌우 1:2 컬럼. 왼쪽(1/3)은 날짜별 메모 목록 + **검색 상자**, 오른쪽(2/3)은
  선택한 날짜(또는 검색 결과)의 메모를 메모지(sticky note) 스타일로 보여준다.
- **검색**: 왼쪽 검색 상자로 메모 **내용**을 대소문자 무시 포함(contains)으로 걸러낸다.
  날짜 선택과 겹치면 **교집합**만 보인다. 검색어를 지우면 원래 목록으로 돌아온다(INV-3 —
  파생물은 다시 계산한다).
- **새 메모**: 따로 버튼을 두지 않는다 — 오른쪽 컬럼 맨 위의 입력칸이 곧 새 메모 자리다.
- **id**: `<epochMs>-<counter>` — 화면 키·삭제 대상 식별에만 쓴다. 정렬은 화면 몫(서버는
  저장 순서 그대로 싣는다).
- **작성 순서 보존**: 서버는 저장 순서 그대로 싣는다. 화면(최신순)과 그룹(날짜별)은 화면이 정한다.
- **API**: RESTful — GET(목록) POST(추가) PUT(수정) DELETE(삭제). 시각은 요청마다의 `now()`
  (ISO 8601 UTC)로 찍는다.

## Produces

- `contract/src/index.ts` — `Memo`, `MemosResponse`, `MemoWriteRequest`, `MemoDeleteResponse` zod 스키마
- `core-io/src/memo-store.ts` — `readMemos`, `appendMemo`, `updateMemo`, `deleteMemo` (파일 CRUD)
- `core-io/src/index.ts` — `memo-store` export
- `backend/src/app.ts` — `GET/POST/PUT/DELETE /api/memos/:slug` 4개 엔드포인트
- `frontend/src/lib/api.ts` — `fetchMemos`, `createMemo`, `updateMemo`, `deleteMemo` fetch 함수
- `frontend/src/lib/query.ts` — `useMemos`, `useCreateMemo`, `useUpdateMemo`, `useDeleteMemo` React Query hooks
- `frontend/src/components/memo/MemoView.tsx` — 좌우 2컬럼 메모 탭 UI
- `frontend/src/components/main/Tabs.tsx` — `memo` 탭 추가
- `frontend/src/components/main/MainPanel.tsx` — `tab === "memo"` 라우팅
- `frontend/src/hooks/useUrlState.ts` — `Tab` 타입에 `"memo"` 추가

## 불변식

- **INV-5**: 메모는 gootte 자기 저장소에만 쓴다. 관리대상 문서를 한 글자도 건드리지 않는다.
- **INV-4**: 내용은 verbatim 그대로 저장한다. 요약·추론을 넣지 않는다.
- **INV-2**: 관리대상은 읽기만 한다. 메모 API는 `GOOTTE_DATA_DIR`에만 쓴다.
- **INV-3**: 메모 목록은 항상 파일을 다시 읽는다(캐시 없음).

## 범위 밖

- 프로젝트 간 메모 공유·검색
- 메모에 태그·분류
- 메모 알림·리마인더
- 마크다운 렌더링 (지금은 평문 textarea)

## 티켓

| # | 무엇을 낸다 | 막힘 |
|---|---|---|
| [T01](tickets/T01.md) | memo-pad 전체 구현: contract → core-io → backend → frontend | 🟢 **없음 — 즉시 착수 가능** |