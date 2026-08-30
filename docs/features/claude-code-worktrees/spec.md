# claude-code-worktrees — Claude Code worktree 를 감시 대상에 자동 포함

Status: ready-for-agent

## 캡틴 지시 (원문)

> **"gootte가 감시중인 projects 폴더의 하위 project 하나(yyyyy)가 claude code의 projects/yyyyy/.claude/worktrees/xxxx 이름으로 생성된다. 이때 이 worktree도 자동으로 감시대상에 올라갈수 있게해줘."**

## 문제

gootte 의 처리중 관측(`scanWorkingCopies`)은 **격리 사본 뿌리(`GOOTTE_TREEHOUSE`, 기본
`~/.treehouse`)만** 훑었다 — 배치가 `<뿌리>/<프로젝트>-<6자리>/<슬롯>/<프로젝트>/` (F6) 로
못 박혀 있었기 때문이다. 그런데 Claude Code 가 만드는 worktree 는 **프로젝트 안
(`projects/<프로젝트>/.claude/worktrees/<이름>`)에 생긴다.** firstmate 와 무관하게 Claude Code
로 작업하면, 그 작업이 "지금 누가 무엇을 붙들고 있나" 에서 전혀 보이지 않는다 — 감시 대상이
아니어서다.

## Goal

프로젝트의 `.claude/worktrees/*` (Claude Code 가 만드는 git worktree)도 **자동으로 감시
대상(작업 사본)** 에 올린다. worktree 는 git worktree 라 `.git` 이 파일이고, branch·커밋 이력이
있어 treehouse 사본과 **똑같이 관측**할 수 있다 — 브랜치가 작업 중이면 처리중, detached 면
유휴, 그 가지의 커밋이 티켓 파일을 건드렸으면 그 티켓 처리중.

## 설계 결정

- **`scanWorkingCopies(root, project, projectPaths = [])`** — 세 번째 인자로 프로젝트 사본
  경로를 받는다. 각 경로의 `.claude/worktrees/` 를 훑어 worktree 하나를 사본 하나로 센다.
- **식별자(슬러그) = `<프로젝트>/claude/<워크트리명>`** — treehouse(`<풀>/<슬롯>`)와 겹치지
  않게. 차단 목록(`blockedCopies`)이 이 slug 를 저장하므로 헷갈리면 안 된다(INV-5).
- **판정은 treehouse 와 완전히 같다** — `repoIn`(`.git` 존재), `currentBranch`, `touchedOnBranch`
  재사용. worktree 의 `.git` 은 파일이라 `existsSync` 가 그대로 잡는다.
- **treehouse 가 없어도 worktree 는 관측된다** — `rootExists:false` 라도 copies 는 실린다.
  작업 사본이 실제로 돌고 있으면 사라지면 안 된다(INV-4).
- backend 는 `projectCopiesFor(project)` = `resolveSlug(effectiveRoots(), project)?.copies`
  (캐시 5s TTL) 를 넘겨준다. `/api/features/:slug` 는 이미 가진 `proj.copies` 를 쓴다.

## Produces

- `core-io` `scanWorkingCopies(root, project, projectPaths?)` — `.claude/worktrees/` 관측.
- `backend` `projectCopiesFor` 헬퍼 + 세 호출부(재갱신·서빙·features 라우트)에 project paths 전달.
- `core-io/src/treehouse.test.ts` — Claude Code worktree 관측·슬러그 테스트 2건.

## Consumers

- `code/web/core-io/src/treehouse.ts` — `scanWorkingCopies`
- `code/web/backend/src/app.ts:214,258,447` — 세 호출부

## Out of scope

- discover(`/api/projects` 목록)에 worktree 를 별도 프로젝트로 올리기 — worktree 는 프로젝트의
  **사본**이지 새 프로젝트가 아니다(같은 slug 로 묶인다).
- worktree 를 관리대상 문서처럼 읽어 할일 목록 만들기 — 사본 관측의 몫이다.
- 인프라 없이 `.claude/worktrees` 를 스캔하는 폴링 — 감시 신호(워처)는 이미 프로젝트 문서 변화에
  달려 있고, 처리중 관측은 기존 TTL/디바운스 재갱신을 그대로 탄다.
