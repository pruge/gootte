---
status: done
completedAt: 2026-07-27
priority: normal
sprint: web-realtime
initiative: null
area: [web/frontend]
source: spec-decompose
related: [../roadmap/project-manager/web-realtime/spec.md, 022-realtime-backend]
created: 2026-07-27
---

# realtime frontend — useLiveSync (T4)

spec [web-realtime](../roadmap/project-manager/web-realtime/spec.md) T4. 클라 구독 → 쿼리 invalidate.

## 작업
- **T4 frontend** — `lib/live.ts` `useLiveSync(queryClient)`: WS `/api/live` 연결(same-origin `ws(s)://`), `onmessage`(ChangeEvent 파싱) → `kind:"project"`면 `invalidateQueries({predicate: q => q.queryKey.includes(project)})`, `kind:"projects"`면 `["projects"]` invalidate. `onclose`→backoff 재연결, 재연결 open→전체 invalidate(놓친 변경 흡수)([ADR-0004]).
- `main.tsx`(또는 App root)에서 `useLiveSync` 배선(QueryClientProvider 아래).
- `vite.config.ts` dev proxy `/api`에 `ws: true` 추가(WS 업그레이드 프록시).

## acceptance
vitest — mock WebSocket: `ChangeEvent{kind:"project"}` 메시지 → `invalidateQueries`가 올바른 predicate(project 매칭)로 호출 · `{kind:"projects"}` → projects invalidate · onclose→재연결 스케줄 · 재연결 open→전체 invalidate. tsc. dev 실렌더(문서 편집 → 대시보드 자동 최신화, 새로고침 X).

## 의존
022(ChangeEvent 메시지 shape + `/api/live` 엔드포인트). **실행 준비 완료**(spec이 닫음).
