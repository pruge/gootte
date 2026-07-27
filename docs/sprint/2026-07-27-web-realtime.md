---
created: 2026-07-27
status: in_progress       # pending | in_progress | done
priority: normal
kind: bundle
todos: [022-realtime-backend, 023-realtime-frontend]
worktree: web-realtime
startedAt: 2026-07-27
related_sprints: []
---

# web-realtime — 파일변경 → WS push → 자동 최신화 (phase 2b)
> 묶음. 1 worktree = 1 sprint. blueprint 2b. 새로고침 없이 대시보드가 현재 SoT 반영(INV-3 웹 실현).

## scope
- 022-realtime-backend (normal) — ChangeEvent(contract) + watchProjects(core-io chokidar) + WS `/api/live` broadcast(backend).
- 023-realtime-frontend (normal) — useLiveSync(WS 연결·재연결 → invalidateQueries) + vite ws 프록시.

## 🔴 Invariant 점검 (프로파일 Invariants 중 이 sprint 에 걸리는 것)
- **INV-1** — WS는 재조회 촉발만, 계산·데이터는 기존 projection 그대로. 클라도 TanStack 캐시가 유일 서버상태(별 스토어 X). 2차 SoT 없음.
- **INV-2** — watcher는 감시(read)만, 관리대상에 write 없음. 감시 ≠ 쓰기.
- **INV-3** — 이 sprint가 웹에서 INV-3 실현(watcher push → 자동 재조회, stale 뷰 제거). 핵심 목적.
- **INV-4** — WS 메시지 = "바뀜" 신호(project slug)뿐, 해석·요약 없음. watcher→slug 매핑 결정적. 관찰 전용 유지(제어 메시지 미도입).

## 묶음 근거
- domain: 같은 기능(실시간)의 서버(022)/클라(023) 짝. 023 dep 022(WS 메시지 shape). 한 worktree에서 backend→frontend 순차. 분리 시 반쪽 배포(가시 효과 0).

## 작업 path (예상 phase)
### Phase 1 — 022 backend 파이프라인
- T1 CONTRACT `ChangeEvent` discriminatedUnion(project|projects).
- T2 core-io `watchProjects(roots, onChange)`(chokidar, 프로젝트 docs 스코프·debounce·경로→slug).
- T3 backend `live.ts`(소켓 레지스트리) + server.ts `@hono/node-ws` `/api/live` + watcher→broadcast + `{projects}`시 clearDiscoverCache.
- 외부 의존 설치: `chokidar`·`@hono/node-ws`.

### Phase 2 — 023 frontend 구독
- T4 `useLiveSync(queryClient)`(WS 연결·onmessage→invalidate predicate·재연결→전체 invalidate) + main.tsx 배선 + vite proxy `ws:true`.

## 다음 단계 결정 필요
- 없음(spec TBD 0 — ADR 0001~0004로 scope·전송·watcher·단위 확정). debounce 150ms·재연결 backoff는 spec 파생 디테일.

## 완료 기준
- 022 완료: `pnpm -C code/web verify` green — watchProjects(temp-dir: 변경→onChange project/projects·debounce·dispose) + broadcast 레지스트리 + ChangeEvent tsc.
- 023 완료: verify green — useLiveSync(mock WS: 메시지→invalidate predicate·재연결→전체 invalidate) + vite ws 프록시.
- 전체 회귀: dev — 관리대상 문서 편집 → 대시보드 **새로고침 없이** 자동 최신화. 프로젝트 추가/삭제 → 사이드바 목록 갱신. plan/lineage/board/timeline 무회귀.

## 사용자 테스트
> 자동 게이트(제가 머지 전 실행): `pnpm verify` — tsc 전 패키지 + vitest **134 passed**(watchProjects 2 · liveHub 2 · useLiveSync 4). 아래는 사용자 몫 가시 확인.

🌐 dev 서버 (backend+frontend)
```
pnpm dev
```

✅ 테스트 (스크래치 프로젝트로 실증함 — 새로고침 없이 갱신 확인)
- `:5304` → dev 실행 후 아무 프로젝트 선택 → 다른 창/에디터에서 **그 프로젝트의 문서를 편집·저장**(예: todo status pending→done) → 대시보드가 **새로고침 없이** 자동 갱신(예: 진척 0/1 → 1/1).
- **worktree 생성/머지**(git worktree 변경) → 작업중 탭·plan 자동 반영.
- 새 cling 프로젝트 생성(`.cling/profile.md`) 또는 삭제 → 사이드바 **프로젝트 목록** 자동 갱신.
- backend 재시작·네트워크 끊김 후 자동 재연결(재연결 시 전체 재조회로 놓친 변경 흡수).
- 기존 뷰(plan/lineage/board/timeline/worktree) 무회귀.

## 관련 todo / spec
- [022-realtime-backend](../todo/022-realtime-backend.md) · [023-realtime-frontend](../todo/023-realtime-frontend.md)
- [spec](../roadmap/project-manager/web-realtime/spec.md) · [M-0005](../mermaid/INDEX.md#M-0005)
