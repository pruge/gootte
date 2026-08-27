# Specification — fast-cold-start

**Status:** ready-for-agent (2026-08-27)

## Goal

gootte 는 **앱을 몇 번을 껐다 켜도, 첫 화면이 13초 스피너를 보지 않는다.**

- 앱 부팅 → 첫 `/api/projects` 요청: 실측 12-15초(git 하위프로세스) → **<100ms**(스냅샷 서빙).
- 프로세스가 살아 있는 동안: 관리대상 문서가 바뀌면 해당 변경만 곧바로 반영(전체 재계산 없음).
- 읽어온 정보는 TTL 만료로 버려지지 않는다 — git 위치 검증과 감시 신호가 값을 믿는 근거다.

## 문제 (2026-08-27 재정의)

T01·T02 로 도입한 구조는 "5초 TTL 메모리 캐시 + 폴백 폴링 제외" 였다:

- 캐시 생애가 프로세스와 함께 산다 — **재시작할 때마다 첫 요청은 언제나 콜드**(`readFeatures` ~13초).
- TTL 만료 시 읽어온 정보를 통째로 버리고 전체 재계산 — 값이 stale 인지 아닌지와 무관하다.
- 신선함 판정의 근거가 시계(TTL)지 git 이 아니다.

캡틴 지시(2026-08-27): 스캔한 정보는 **영구히 갖고 있고**, 그때의 **git 위치를 기록**한다.
다음 실행에서는 가진 정보로 바로 띄우고 백그라운드로 git 시점을 다시 파악해 새 커밋이 있으면
갱신한다. 켜져 있는 동안에는 실시간 감시로 변경된 내용만 반영한다.
결정 기록: [adr/0001](adr/0001-git-stamped-persistent-snapshot.md).

## 설계 — 네 흐름

### F1. 최초 실행 — 스캔하고 영구 저장

스냅샷이 없으면(첫 실행 또는 파기됨) discover + `readFeatures` 로 전체 스캔(~13초, 평생 한 번),
결과를 `GOOTTE_DATA_DIR`(기본 `~/.gootte`)에 저장한다.

```
{
  version: 1,
  scannedAt: <ISO>,
  projects: [{
    slug, root, copies: [...],
    stamps: [{ repo: <사본 경로>, head: <headCommit@스캔시점> }],
    features: <readFeatures(copies) 결과 verbatim>   // /api/projects · /api/features/:slug 가 함께 먹는 소스
  }]
}
```

- 위치: gootte 자기 데이터 디렉터리(`settings.json` · `plan.db` 옆). INV-2 — 관리대상에는
  여전히 아무것도 쓰지 않는다.
- zod 스키마로 파싱·검증(backend 내부 스키마). 깨진 파일은 통째로 파기 후 재스캔 — 파생물이라
  치명적이지 않다(INV-1).
- 스캔 결과가 스탬프(stamps.head)와 같은 트랜잭션에 같이 저장된다 — "언제 어떤 입력에서
  계산했나" 가 한 덩어리다.

### F2. 다음 실행 — 즉시 서빙

백엔드 부팅 시 스냅샷을 메모리로 올린다. `/api/projects` · `/api/features/:slug` 는
`getProjectsPayload` 안에서 스캔 대신 스냅샷을 답한다. 디스크 read 하나 — git 없음.

### F3. 부팅 직후 — 백그라운드 재검증

즉시 서빙된 값은 **스캔 시점의 값이다.** 부팅 직후 백그라운드로 사본마다 현재 `headCommit`
(`core-io/src/git.ts`)을 스탬프와 비교한다:

- 모두 같으면 — 스냅샷이 현재 SoT 의 파생물임이 확인되었다. 아무 방송 없이 조용히 확정.
- 어떤 사본이 달라지면(커밋 등록·리베이스·브랜치 전환) — **그 프로젝트만** 재계산해
  메모리+디스크 교체, `ChangeEvent` 방송으로 화면을 고친다.
- 사본이 새로 생겼거나 사라졌으면(discover 변화) — 목록 수준(`kind: "projects"`)으로 갱신.

허용되는 유일한 stale 폭 = "부팅 ~ 검증 완료". 그 뒤 화면은 감시기가 지키는 현재 SoT 를 반영한다(INV-3).

### F4. 켜져 있는 동안 — 실시간 감시, 변경분만 반영

감시기(`backend/src/watchers.ts`, core-io watch)가 살아 있는 동안 문서 변경이 오면:

- 지금은 `onProjectsChange: clearDiscoverCache`(`server.ts:85`)로 **전부 flush** → 다음 요청이
  전체를 다시 계산한다. 이걸 바꾼다 — 이벤트가 어느 프로젝트/슬러그인지 이미 알고 있다
  (`Change` 의 `{ kind: "project", project: slug }`).
- 해당 프로젝트만 재계산해 메모리·디스크(write-through)에 반영하고 ChangeEvent 를 방송한다.
  프론트엔드 invalidate 는 kind 단위(기존 T02 배선 유지).
- 감시가 불가능한 환경(watch-fallback)에서는 HEAD 재검증(F3 절차)을 낮은 주기로 태워 폴백의
  백업 수단으로 삼는다 — 세부 주기는 T04 몫.

## 불변식 충족

| 불변식 | 이 설계가 지키는 법 |
|---|---|
| INV-1 파생물만 | 스냅샷은 재생성 가능 파생물(전체 스캔 한 번으로 복구). 손편집 금지, 코드가 쓴다 |
| INV-2 읽기 전용 | 쓰는 자리는 GOOTTE_DATA_DIR 뿐. 관리대상에는 변함없이 아무것도 안 쓴다 |
| INV-3 stale 금지 | 값을 믿는 근거가 git 스탬프 + 감시신호. 허용 stale 폭 = 부팅~검증완료만, 명시적으로 |
| INV-4 결정적 | 스냅샷 내용 = 계산값 + verbatim 원문. 요약·추론 저장 금지 |

INV-5 와의 경계(파생 데이터 저장)는 ADR 0001 에서 다룬다.

## Scope

- **하는 것:** 스냅샷 저장소(디스크 + zod), 부팅 즉시 서빙, HEAD 스탬프 재검증, watcher 증분
  write-through, (parallel) 콜드 스캔 git 하위프로세스 배치화.
- **안 하는 것:** 폴백 폴링 주기·제외 정책 되돌리기(T02 그대로 역사); plan/steps 탭용 별도
  캐시(판 데이터는 plan.db 발이라 기존 속도 유지); 스냅샷의 UI 노출("as of ..." 문구 등 — 필요해지면
  새 기능); Kotlin 뷰어 어휘.

## 수용 조건

1. 스냅샷이 있으면 백엔드 재시작 직후 첫 `/api/projects` 요청이 <100ms(git 하위프로세스 0건).
2. 스냅샷이 없으면 스캔 후 저장하고, 재시작 뒤부터 위 상태가 된다.
3. 부팅 직후 백그라운드 검증이 스탬프 불일치를 찾으면 해당 프로젝트만 갱신되고 화면에 반영된다.
4. 감시 환경에서 문서 변경 시 해당 프로젝트만 갱신된다(전체 flush → 재계산이 안 돈다).
5. `pnpm verify` green.

## Progress

- [x] T01 — projects 페이로드 메모리 캐시(5초 TTL) — 2e4c049 (2026-08-27)
- [x] T02 — 폴백 폴링 projects 제외 · 15초 — PR #88 (2026-08-27)
- [ ] T03 — 영구 discover 스냅샷: 저장·부팅 즉시 서빙
- [ ] T04 — git 위치 스탬프: 부팅 직후 백그라운드 재검증
- [ ] T05 — 감시 중 증분 write-through
- [ ] T06 — 콜드 스캔 git 하위프로세스 배치화
- [ ] T07 — 캡틴 확인(종료)

## Evidence anchors

- `code/web/backend/src/discover-cache.ts` — getProjectsPayload(TTL 캐시)/clearDiscoverCache — T03~T05 가 뒤집는 자리
- `code/web/backend/src/app.ts:282` — /api/projects 핸들러와 TTL 주석
- `code/web/backend/src/server.ts:85` — `onProjectsChange: clearDiscoverCache`(flush 배선)
- `code/web/core-io/src/watch.ts` — `Change`(`project`/`projects` kind), fire per-slug(:121)
- `code/web/core-io/src/git.ts` — `headCommit`(:69) · `isRepo`(:64) — 스탬프 소스
- `code/web/core-io/src/features.ts` — `readFeatures`(스캔의 느린 본질)
- `backend/src/app.ts:79-82` — `planDataDir()`(GOOTTE_DATA_DIR) — 스냅샷 저장 자리 해석

## Comments

- 2026-08-27 — 첫 기획(5초 TTL + 폴백 제외)이 커밋 619b2b4 에 들어왔으나, 캡틴 지시로 영구
  스냅샷 방향으로 재작성했다. 옛 기획은 grill.md 에 남아 있다.
