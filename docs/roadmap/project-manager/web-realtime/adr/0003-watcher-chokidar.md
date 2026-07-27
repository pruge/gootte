# ADR-0003: watcher = chokidar, 프로젝트 docs 경로 스코프

Status: accepted
Date: 2026-07-27 / 관련: spec.md §Architecture, Task T2

## Context
파일 변경 감지가 실시간의 근원이다. 네이티브 `fs.watch`는 재귀 지원이 플랫폼마다 불일치(Linux 구버전 재귀 X)하고 atomic-save(에디터 rename)에서 이벤트 누락/중복이 잦다. 신뢰성이 실시간 도구의 생명.

## Decision
**chokidar**(core-io `watchProjects`). 감시 대상은 **cling 프로젝트 문서 경로만**(`~/Documents` 전체 X):
- 각 발견 프로젝트 `P`: `P/docs/**`(todo·sprint·roadmap) · `P/.cling/profile.md` · `P/.git/worktrees`(worktree 목록) · `P/.claude/worktrees/*/docs/**`(활성 worktree 라이브 sprint).
- roots 얕은 감시 `<root>/*/.cling/profile.md`·`<root>/*/*/.cling/profile.md` → 프로젝트 추가/삭제.
- 옵션: `ignoreInitial` · node_modules·`.git/objects` ignore · `awaitWriteFinish`(atomic-save) · debounce(150ms 뭉침).

## Alternatives
- `fs.watch`: 의존성 0이나 재귀·atomic-save 불안정 → 신뢰성 미달.
- 폴링: 단순하나 지연 + 상시 CPU.

## Consequences
- `chokidar` 의존 추가(core-io). 소품이지만 사실상 표준.
- 감시 스코프 한정 → 대규모 root에서도 파일핸들·CPU 억제.
- git 작업(대량 파일 touch)은 debounce로 1이벤트 뭉침.

## Invariant impact
- **INV-2**: watcher는 감시(read)만 — 관리대상에 write 없음. 감시 ≠ 쓰기. 준수.

## Contract impact
없음(watcher 내부 산출은 `{project}`/`{projects}` → backend가 ChangeEvent로 변환·broadcast).
