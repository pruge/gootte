# git-removal-and-state-store — git 전부 제거, JSON 상태 저장소로 교체

Status: draft (2026-09-08)

## 캡틴 지시 (원문)

> "git은 불필요로 판단했었는데. 이제 정리하는것으로 하자."
> "이 프로젝트는 각 티켓의 진행상태를 파악하기 위함이야. 이제는 md 파일 자체에 기록하기로 했으니, git은 필요없어 보인다."
> "binary가 아니라 text 기반 간단한 query 가능한것. 한곳에서 등록하면 자동으로 진행사항을 확인할수 있게하자."
> "conflict는 필요없어. 어디 몇개로 작업하던지"

## Goal

git 하위프로세스 17회 전부 제거하고, JSON 기반 상태 저장소(`state.json`)로 교체한다.
conflict(갈라짐) 판정도 삭제한다.
감시 설정을 `firstmateHome` + `watchRoots` 분리에서 `projects[]` 단일 배열로 통합한다.

## User stories

1. 앱 시작 시 사이드바 배지가 즉시 표시된다
2. `gootte start/end` 후 변경이 즉시 반영된다
3. git 하위프로세스가 단 하나도 실행되지 않는다
4. conflict 배지가 화면에 나타나지 않는다
5. worktree 루트를 등록하면 해당 worktree가 자동으로 감지된다
6. worktree에서 `gootte start`하면 메인 프로젝트의 state.json이 갱신된다
7. settings.projects로 감시 대상을 단일 배열로 관리한다

## Architecture

### 1. 감시 대상 통합 (`settings.json`)

```json
{
  "projects": [
    "~/Documents/ai2/projects",
    "~/.claude/worktrees",
    "~/.bb/worktrees"
  ]
}
```

- 기존 `firstmateHome` + `watchRoots` → `projects[]` 하나로 통합
- 메인 프로젝트 뿌리 + 중앙 worktree 뿌리를 같은 배열에 등록
- `firstmateHome`은 폐기 (backlog/secondmates 기능 별도 처리)

### 2. 프로젝트 발견 (`discoverProjects`)

```
settings.projects 의 각 루트를 스캔:
  - 메인 뿌리 (~/Documents/ai2/projects) → depth 2 스캔
  - worktree 뿌리 (~/.claude/worktrees 등) → depth 4 스캔
    (구조: root/env_or_name/project/ 이므로 깊이 필요)

발견 기준: AGENTS.md + docs/features/ 디렉토리가 있는 곳
같은 basename은 copies[]로 병합
```

### 3. state.json 위치

```
<프로젝트 루트>/.gootte/state.json
```

- 프로젝트마다 독립적 — 다른 machine으로 옮겨도 상태가 따라감
- 스키마: `{ version: 1, updatedAt: string, openFeatures: Feature[] }`

### 4. worktree → 메인 동기화

worktree의 `.gootte/config.json`:
```json
{
  "mainProject": "/Users/pruge/Documents/ai2/projects/gootte"
}
```

`gootte start` 실행 시:
1. config.json 읽기 → mainProject 경로 확인
2. 메인 프로젝트의 `.gootte/state.json` 갱신
3. worktree의 `Time:` 기록도 동시에 작성

### 5. worktree 종류와 처리

| 종류 | 위치 | 감지 방식 |
|---|---|---|
| 중앙 worktree | `~/.claude/worktrees/`, `~/.bb/worktrees/` | settings.projects에 루트 등록 → discoverProjects가 별도 프로젝트로 감지 |
| 프로젝트별 worktree | `<project>/.claude/worktrees/` | featuresFor() 안의 withWorktrees(copies)가 기존대로 처리 |

## Scope

- `core-io/src/git.ts` 파일 전면 삭제
- `CopyResolver` 클래스 · `resolveFile` · `sameStamps` · `snapshotNeedsRefresh` 삭제
- 축 2 (커밋 감시: `gitRefPaths`, `gitW`) 삭제
- `FeatureConflict` 계약 필드 · `ConflictBadge` UI 컴포넌트 삭제
- `state.json` 저장소 모듈 신설 (프로젝트별)
- 사이드바 배지 → `state.json`에서 즉시 서빙
- `scanWorkingCopies`에서 git 호출 제거
- settings 통합: `firstmateHome` + `watchRoots` → `projects[]`
- `discoverProjects` worktree 루트 스캔 지원
- `gootte start` → 메인 state.json 갱신

## Out of scope

- `plan.db` (SQLite) 변경 — 기존 그대로 유지
- MD 파일(`Time:` 줄) 변경 — 여전히 SoT
  🔴 **뒤집힘(2026-09-09)** — 티켓 시간 기록의 SoT 가 state.json v2 로 옮겨졌다
  (time-records-to-state-store). MD 줄은 아직 읽히지만(미이관 프로젝트 폴백) v2 프로젝트에선 무시된다.
- 파일 감시(축 1: chokidar) 유지
- `readFeatures` MD 읽기 유지
- backlog/secondmates — `firstmateHome` 폐기 시 별도 처리

## Decisions

- **D1** — `state.json`은 파생물이다. MD 파일이 SoT(INV-1). 프로젝트마다 `.gootte/state.json`으로 격리 — 다른 machine으로 프로젝트를 옮겨도 상태가 따라감
  🔴 **뒤집힘(time-records-to-state-store, 캡틴 승인 2026-09-09) — 옛 결정은 남긴다:** 이후 티켓
  시간·상태 기록의 SoT 가 state.json v2(`tickets` 맵)로 옮겨졌다. `start/end` 가 기록한 시각은
  write-time 캡처라 원본 재생성이 불가능한 INV-5 값이라 저장 자격이 갈렸다. 배지 캐시(`openFeatures`)
  는 여전히 파생물 — 아래 D1 본문은 배지에 대해서는 유효하다.
- **D2** — `plan.db`와 `state.json`은 분리. 각각의 역할이 다르다
- **D3** — conflict 판정 전부 삭제. 동시 작업 불필요
- **D4** — 처리중 관측은 worktree 존재 여부만 확인. 브랜치 이름·git 호출 제거
- **D5** — 사이드바 3초 스피너 딜레이 전부 제거. state.json에서 즉시 서빙
- **D6** — 감시 설정 통합. `firstmateHome` + `watchRoots` → `projects[]` 단일 배열
- **D7** — worktree 루트는 settings.projects에 등록. discoverProjects가 자동 감지 (depth 4)
- **D8** — worktree에서 gootte start 시 config.json으로 메인 경로를 찾아 state.json 갱신
  (time-records T05 — config.json 은 이제 worktree에서 자동 생성된다)

## Existing seams / integration points

- `core-io/src/` — IO 층. git.ts 삭제 후 다른 모듈에 영향 없는지 확인
- `backend/src/app.ts` — Hono 라우트. `featuresFor`·`openCountOf`·`scheduleCountFill` 변경
- `backend/src/snapshot.ts` — 스냅샷 관리. stamps 제거
- `backend/src/watchers.ts` — 감시기. 축 2 제거
- `contract/src/index.ts` — 공유 타입. `FeatureConflict`·`Settings` 스키마 변경
- `frontend/src/components/` — UI. `ConflictBadge` 제거
- `core-io/src/settings-store.ts` — settings 구조 변경
- `core-io/src/discover.ts` — discoverProjects depth 확장

## Acceptance criteria

- `pnpm verify` 전체 회귀 통과
- git 관련 코드 잔존 없음 (import·함수·클래스)
- 사이드바 배지가 앱 시작 시 즉시 표시
- `gootte start/end` 후 state.json 갱신 및 WS 방송
- settings.projects에 worktree 루트 등록 시 worktree 자동 감지
- worktree에서 gootte start 시 메인 state.json 갱신

## Verification strategy

각 티켓 완료 시 `pnpm verify` 실행. 최종 T09에서 전체 회귀 확인.
