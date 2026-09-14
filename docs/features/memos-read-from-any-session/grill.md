# grill — memos-read-from-any-session (메모 읽기 CLI)

요청(캡틴 2026-09-14): "gootte memo 명렬어를 신설하고, 각 프로젝트의 메모를 보여줘. 단 필터 기능도
넣어줘. 전체/완료/미완료." → 후속 정정: **"내가 원한 것은 CLI 다. `gootte memo <project slug>` 이렇게.
그래서 AI 세션에서 읽어서 같이 논의할 수 있었으면 한다."**

## 라운드 1 — 화면으로 오독, 전량 폐기

화면(크로스 프로젝트 메모 목록)으로 읽고 프론티어 5개(착지 자리·집계 범위·정렬·쓰기 범위·필터 유지)를
올렸다. 캡틴이 "CLI" 로 정정 → **이 라운드의 질문과 추천은 모두 무효**. 폐기 사유를 남기는 이유: 같은
요청이 다시 화면으로 읽힐 수 있기 때문.

이 라운드에서 얻은 유효한 사실 하나: **`memo` 탭에는 이미 `전체/완료/미완료` 필터가 있다**
(`MemoView.tsx` 의 `usePersistedState("gootte:memo-filter")`, 캡틴 지시 2026-09-09). 따라서 요청의
새 부분은 화면이 아니라 **CLI 부재**다.

## 라운드 2 — CLI 프론티어 (캡틴 답 확보)

| # | 결정 | 답 |
|---|---|---|
| 1 | 기본 범위 | **세션이 진행 중인 프로젝트가 기본, 인자 불요. "전체 프로젝트" 모드는 불요** |
| 2 | 필터 표기 | `--done` / `--undone` (없으면 전체) — 승인 |
| 3 | 출력 서식 | 헤더 `== <slug> (완료 8/23) ==` + `- [ ] YYYY-MM-DD <verbatim>` — 승인 |
| 4 | 집계 | 다시 현재 프로젝트로 한정(1과 같은 답) |
| 5 | 데이터 접근 | 백엔드 API·contract 를 타지 않고 **CLI 가 직접 읽는다** |
| 6 | 고아 slug(발견 목록에 없는 메모 파일) | 그대로 출력 — 승인 |

## Facts (캡틴에게 묻지 않고 코드에서 찾은 것)

- 메모는 **프로젝트 단위 파일**: `GOOTTE_DATA_DIR/memos/<project>.json` (`core-io/src/memo-store.ts:16`).
- 필드 `id/content/done/createdAt/updatedAt` (`contract/src/index.ts:361`). **실측: content 에 개행이
  있다** — jinwooauto 23건 중 2건. 한 줄 출력 규약과 충돌하므로 continuation 정책을 잠가야 한다.
- 화면의 완료 필터는 `Memo.done` 하나만 본다. 완료 = `done === true`.
- CLI 관례: 명령당 `xxxText(argv, dataDir, cwd)` 순수 함수 + `main.ts` 디스패치 + `usage()` 한 줄
  (`cli/src/commands.ts:217,259,330,347`).
- 프로젝트 인자 유추 관례가 **이미 있다**: `resolveProjectArg`/`slugFromCwd` — cwd 의 조상에서 발견
  표식(`AGENTS.md` + `docs/features/`)로 자기 프로젝트를 찾는다 (`cli/src/commands.ts:69-86`). 1번 답의
  구현체는 새로 만들 것이 아니라 이것을 쓰면 끝이다.
- 빈 결과 관례: `(착수 가능 티켓 없음)` 같은 한 줄 (`commands.ts:347` `frontierText`).
- 손상 JSON 을 빈 목록으로 위장하지 않는 규율이 저장소에 이미 있다 (`memo-store.ts` 주석 —
  "사용자가 지운 것과 저장소가 고장 난 것을 같게 그리면 화면이 거짓말을 한다"). CLI 도 같은 판을 쓴다.
- 🔴 **PATH 바이너리 `gootte`(= `bin/gootte`) 는 시간·상태 명령만 받고 나머지는 거부한다**
  (`bin/gootte:763` "그 외 명령은 pnpm gootte 로 실행하세요"). AI 세션은 **자기 프로젝트 cwd** 에서
  `gootte memo` 를 친다(`which gootte` → gootte 저장소 `bin/gootte`, 다른 프로젝트의 cwd 에서도 동작하도록
  `GOOTTE_HOME` 을 도구 저장소로解決 — `bin/gootte:42-50`). 따라서 **`bin/gootte` 라우팅 없이는 이 기능이
  목적을 못 이룬다** → 게이트가 아니라 기능의 일부.
- `working|pending` 이 그 라우팅의 선례다 (`bin/gootte:755-762`): slug 인자 전달 + `GOOTTE_ROOTS`
  기본값 부여. 단 저 둘은 **플래그를 넘기지 않는다** — `memo` 는 `--done/--undone` 도 넘어가야 한다.

## INV 점검 (이 저장소의 불변식)

- **INV-1·INV-5**: 이 기능은 아무것도 저장하지 않는다 — 메모 파일의 파생 읽기뿐. 저장 0.
- **INV-2**: 관리대상은 읽기만. 여기는 gootte 자기 저장소(`GOOTTE_DATA_DIR`)를 읽는다. 쓰기 없음.
- **INV-3**: 매 실행마다 파일을 다시 읽는다(캐시 없음).
- **INV-4**: `content` 는 verbatim 싣는다 — 요약·요약어 금지. 개행 보존이 이 불변식의 CLI 측 얼굴이다.

## Locked decisions (사실에서 나온 것, 캡틴에게 다시 묻지 않는다)

1. `gootte memo [project-slug] [--done|--undone]`. slug 생략 → `resolveProjectArg` 로 cwd 유추.
2. 파일 없음 = 0건(빈 목록), JSON 파싱 실패 = 오류(stderr + exit 1). 둘을 같게 그리지 않는다.
3. 정렬 `createdAt` 내림차순, 동시각은 저장 순서 유지(안정 정렬).
4. 0건일 때 헤더를 버리지 않고 `(메모 없음 — 본 자리: <path>)` 를 낸다 — 오타 slug 를 조용한 빈 화면으로
   죽이지 않기 위한 한 줄.
5. 개행 포함 content 는 첫 줄만 항목 머리(`- [ ] 날짜 `) 뒤에 싣고, 둘째 줄부터 **4칸** 들여쓰기로
   verbatim 보존. 재접합 규칙이 문서에 남는다.
   ⚠ 왕복 중 발견한 제 문서 모순: 이 줄과 spec 은 처음 **2칸**이었고 T01 locked decision 5 는
   **4칸**이었다. 작업자는 표(구현 계약)를 좇아 4칸으로 찍었고 테스트가 그 값을 고정했다 —
   즉 모순은 조용히 해결된 게 아니라 **표 쪽으로 해소**된 것이다. 게이트 2(대조)를 제가 제 문서
   두 장 사이에 돌리지 않아 안 잡혔다(외부 눈이 필요한 자리). 이제 세 곳이 4칸으로 같다.
6. 필터 적용 중임을 헤더에 쓴다(`· 필터: done|undone`) — 잘린 목록을 전체로 보이게 그리는 것(거짓)을 막는다.
   (원문은 `· 필터: 미완료` 였고 T01 · 구현은 값 그대로 `undone`/`done` 을 쓴다. 같은 모순의 둘째 건 —
   입력(`--undone`)과 출력(`필터: undone`) 단어를 맞춘 표 쪽이 낫다고 판단, spec 을 정정했다.)
