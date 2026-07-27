---
id: M-0005
title: web-realtime 2b — 파일변경 → chokidar → WS broadcast → 클라 invalidate → refetch
status: living
supersedes: []
superseded_by: null
sources: [docs/roadmap/project-manager/web-realtime/spec.md, docs/mermaid/M-0001-gootte-architecture.md, docs/mermaid/M-0002-web-dashboard-2a.md]
updated: 2026-07-27
---

# M-0005 — web-realtime 2b 실시간 데이터흐름

> M-0002(2a) 위 확장 — 사용자가 수동 새로고침하던 갱신을 watcher push로 자동화(INV-3 웹 실현). 서버상태=TanStack Query(복제 X).

```mermaid
sequenceDiagram
  participant FS as 관리대상 문서/worktree
  participant CH as core-io.watchProjects (chokidar)
  participant BE as backend server.ts (WS /api/live)
  participant DC as discover-cache
  participant WS as 브라우저 WebSocket (useLiveSync)
  participant Q as TanStack Query 캐시
  participant V as 뷰(plan·worktree·doc…)

  Note over FS: docs/todo·sprint·roadmap·profile·worktree 편집
  FS->>CH: fs 이벤트 (debounce 150ms)
  alt 문서/worktree 변경
    CH->>BE: onChange {project: X}
    BE->>WS: ChangeEvent {kind:"project", project:X} (broadcast)
    WS->>Q: invalidateQueries(predicate: key.includes(X))
    Q->>V: 재조회 → 최신 SoT 렌더
  else 프로젝트 추가/삭제 (.cling/profile.md)
    CH->>BE: onChange {projects}
    BE->>DC: clearDiscoverCache()
    BE->>WS: ChangeEvent {kind:"projects"} (broadcast)
    WS->>Q: invalidateQueries(["projects"])
    Q->>V: 프로젝트 목록 재조회
  end
  Note over WS: 끊기면 backoff 재연결 → 재연결 시 전체 invalidate(놓친 변경 흡수)
```

- 🔵 phase 1/2a 재사용(core-io·discover-cache·TanStack Q·뷰) · 🟢 2b 신규(watchProjects·WS broadcast·useLiveSync) · 🟣 CONTRACT `ChangeEvent`.
- coarse(프로젝트 단위) invalidate — 파일→뷰 매핑 없이 그 프로젝트 쿼리 전체(ADR-0004). WS 양방향(후속 제어 대비, ADR-0002).
