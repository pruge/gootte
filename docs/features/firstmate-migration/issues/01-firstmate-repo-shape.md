# 01 — firstmate 저장소 모양 세우기

**What to build:** 이 저장소를 처음 여는 사람이나 작업자가 **지침과 문서 관례를 한 자리에서 찾을 수 있게** 한다.
지금은 그 지식이 `.cling/profile.md` 한 곳에만 있고, 그 파일은 은퇴한 워크플로우의 산물이라 곧 삭제된다.
루트 `AGENTS.md` 를 세워 그 지식을 옮기고, `docs/agents/` 에 이 저장소의 문서 관례를 명문화한다.

**Blocked by:** 없음 — **즉시 착수 가능**

**Status:** resolved (2026-08-09)

## 완료 시 시연 가능한 것

작업자가 이 저장소를 처음 열어 `AGENTS.md` 를 읽으면 **아키텍처 불변식·검증 기준·프론트엔드 하드룰·실행 명령**을
찾을 수 있고, `docs/agents/` 를 열면 **티켓을 어떤 서식으로 쓰는지**를 찾을 수 있다.
`.cling/profile.md` 를 열어볼 필요가 없다.

## 완료 조건

- 루트 `AGENTS.md` 가 `.cling/profile.md` 의 다음 여섯 가지를 전부 담는다. **원문과 한 항목씩 대조해 확인한다.**
  1. 제품 불변식 INV-1 ~ INV-4 (파생물만 · 관리대상 읽기전용 · stale 뷰 금지 · read-path 결정적)
  2. contract codegen SoT 정책과 drift-guard (생성물 손편집 금지, codegen 재실행 후 diff 0)
  3. 컴포넌트별 검증 기준 (컴파일 + 테스트, 컴파일만으로 완료 금지)
  4. 프론트엔드 하드룰 — CSS 는 Tailwind, 아이콘은 Tabler 전용, 폰트는 Pretendard
  5. track 통제 어휘 (E 엔진/lineage · W 웹 대시보드 · R 원격/모바일 · X 확장)
  6. 실행 명령표 (루트 `package.json` 이 `code/web` 으로 위임하는 구조)
- `CLAUDE.md` 가 `AGENTS.md` 를 가리키는 심볼릭 링크다.
- `docs/agents/issue-tracker.md` — 레이아웃(`docs/features/<기능>/{spec.md,issues/NN-*.md,adr/}`),
  티켓당 파일 1개 규칙, `Blocked by:` 의미, 코멘트는 파일 하단에 append.
- `docs/agents/triage-labels.md` — 정규 `Status:` 여덟 값과 서식. `resolved` 는 완료일 동반,
  `Status:` 줄은 한 줄로 끝난다.
- `docs/agents/domain.md` — 이 저장소를 탐색하기 전에 읽는 순서. 컨텍스트가 여섯(`contract` `core`
  `core-io` `cli` `backend` `frontend`)이라는 사실과, 순수 계층(`core`)과 IO 계층(`core-io`)이
  갈려 있다는 사실을 포함한다.
- `.gitignore` 에 `.codegraph/` 가 있어 `git status` 가 깨끗하다.
- `AGENTS.md` 에 **구조 파악은 codegraph 로 하고 한국어 개념어 사전은 `docs/agents/codegraph/` 에 있다**는
  한 줄이 있다. 그 폴더는 티켓 02 가 채운다 — 이 티켓 직후 잠시 비어 있어도 문제되지 않는다.
- `pnpm verify` green.

## 테스트

**이 티켓은 테스트를 만들지 않는다.** 산출물이 전부 읽히는 문서이고, 문서를 검증하는 테스트는
그 자체가 낡는 두 번째 표현이 된다. 검증은 위 완료 조건의 **원문 대조**가 담당한다.

## 이 티켓이 하지 않는 것

- `.cling/profile.md` 삭제 — 티켓 06 이 한다. 이 티켓이 끝난 뒤에도 원본은 그대로 남아 대조에 쓰인다.
- `docs/roadmap` `docs/todo` `docs/sprint` 삭제 — 티켓 03.
- codegraph 사전 채우기 — 티켓 02.
- 포트 파일 도입 — 티켓 05.

## 실행 모델

기본 작업자 등급을 넘는다.

**이유:** `.cling/profile.md` 의 여섯 항목을 `AGENTS.md` 의 어떤 구조로 재배치할지가 이 저장소에 전례가 없다.
jinwooauto 의 `AGENTS.md` 는 참고는 되지만 컨텍스트 구성이 달라 그대로 복사할 수 없다.
구조를 처음 세우는 판단이라 코드와 원문을 함께 놓고 정해야 한다.

**완료 조건에 반드시 포함할 것:** `AGENTS.md` 안에 **그 문서의 구조와 이후 항목을 추가하는 절차**를
남긴다. 이것이 빠지면 다음 티켓들이 코드를 역추적하게 되고 다시 높은 등급이 필요해진다.
